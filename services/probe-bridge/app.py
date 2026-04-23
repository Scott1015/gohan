#!/usr/bin/env python3
"""
Gohan Probe Bridge

Execution-side bridge for OpenClaw runtimes.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from queue import Empty, Queue
from typing import Any, Optional

import requests
from flask import Flask, jsonify, request

from runtime_client import OpenClawRuntimeClient


class Config:
    OPENCLAW_HOME = os.getenv("OPENCLAW_HOME", os.path.expanduser("~"))
    OPENCLAW_STATE_DIR = os.path.join(OPENCLAW_HOME, ".openclaw")
    SESSIONS_DIR = os.getenv(
        "OPENCLAW_SESSIONS_DIR",
        os.path.join(OPENCLAW_STATE_DIR, "agents/main/sessions"),
    )
    CONTROL_PLANE_URL = os.getenv(
        "GOHAN_CONTROL_PLANE_URL",
        "http://localhost:3000",
    )
    PROBE_AGENTS_JSON = os.getenv("GOHAN_PROBE_AGENTS_JSON", "")
    PROBE_PORT = int(os.getenv("PROBE_PORT", "3001"))
    PROBE_ID = os.getenv("PROBE_ID", "probe-local-1")
    RETRY_COUNT = 3
    TIMEOUT = 30
    HEARTBEAT_INTERVAL = 30
    BATCH_SIZE = 10
    BATCH_INTERVAL = 1.0
    INTERACTIVE_BATCH_INTERVAL = 0.15
    SESSION_POLL_INTERVAL = 5
    MAX_BACKFILL_BYTES = 5 * 1024 * 1024


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def elapsed_ms(start: Optional[str], end: Optional[str]) -> int:
    if not start or not end:
        return 0
    try:
        start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(end.replace("Z", "+00:00"))
    except ValueError:
        return 0
    return max(0, int((end_dt - start_dt).total_seconds() * 1000))


def parse_probe_agents_config(raw: str) -> list[dict[str, Any]]:
    if not raw or not raw.strip():
        return []

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []

    if not isinstance(data, list):
        return []

    result: list[dict[str, Any]] = []
    for item in data:
        if not isinstance(item, dict):
            continue

        agent_id = item.get("agentId")
        slug = item.get("slug")
        if not isinstance(agent_id, str) or not agent_id.strip():
            continue
        if not isinstance(slug, str) or not slug.strip():
            continue

        entry: dict[str, Any] = {
            "agentId": agent_id.strip(),
            "slug": slug.strip(),
        }
        sessions_dir = item.get("sessionsDir")
        if isinstance(sessions_dir, str) and sessions_dir.strip():
            entry["sessionsDir"] = sessions_dir.strip()
        result.append(entry)

    return result


class Checkpoint:
    def __init__(self, path: str):
        self._path = path
        self._lock = threading.Lock()

    def load(self, session_file: str) -> Optional[int]:
        try:
            with open(self._path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            if data.get("session_file") == session_file:
                return data.get("offset")
        except (FileNotFoundError, json.JSONDecodeError):
            pass
        return None

    def save(self, session_file: str, offset: int) -> None:
        with self._lock:
            try:
                with open(self._path, "w", encoding="utf-8") as handle:
                    json.dump({"session_file": session_file, "offset": offset}, handle)
            except Exception as exc:
                print(f"[Checkpoint] save failed: {exc}", flush=True)

    def resolve_start_offset(self, session_file: str) -> Optional[int]:
        saved = self.load(session_file)
        if saved is None:
            return None

        try:
            file_size = os.path.getsize(session_file)
        except OSError:
            return None

        gap = file_size - saved
        if gap < 0:
            return None
        if gap > Config.MAX_BACKFILL_BYTES:
            print(
                f"[Checkpoint] skipping oversized backfill gap {gap}",
                flush=True,
            )
            return None

        return saved


class Reporter:
    def __init__(self):
        self._session = requests.Session()
        self.last_report_time = time.time()

    def send_batch(
        self,
        session_file: str,
        lines: list[str],
        agent_id: Optional[str] = None,
        agent_slug: Optional[str] = None,
    ) -> bool:
        if not lines:
            return True

        payload = json.dumps(
            {
                "probeId": Config.PROBE_ID,
                "sessionFile": session_file,
                "rawDataList": lines,
                "timestamp": utc_now_iso(),
                "agentId": agent_id,
                "agentSlug": agent_slug,
            }
        ).encode()
        body = gzip.compress(payload)
        headers = {"Content-Type": "application/json", "Content-Encoding": "gzip"}
        urls = [
            f"{Config.CONTROL_PLANE_URL}/runtime-events/batch",
            f"{Config.CONTROL_PLANE_URL}/api/probe/events/raw/batch",
        ]

        for url in urls:
            for attempt in range(Config.RETRY_COUNT):
                try:
                    response = self._session.post(url, data=body, headers=headers, timeout=Config.TIMEOUT)
                    if response.status_code in (200, 202):
                        self.last_report_time = time.time()
                        print(f"[Reporter] sent {len(lines)} events via {url}", flush=True)
                        return True
                    if response.status_code != 404:
                        print(
                            f"[Reporter] batch HTTP {response.status_code} attempt {attempt + 1} via {url}",
                            flush=True,
                        )
                except Exception as exc:
                    print(f"[Reporter] batch error {exc} attempt {attempt + 1} via {url}", flush=True)

                if attempt < Config.RETRY_COUNT - 1:
                    time.sleep(1)

        return False

    def send_heartbeat(self, agents: list[dict[str, Any]]) -> bool:
        payload = {
            "probeId": Config.PROBE_ID,
            "timestamp": utc_now_iso(),
            "status": "alive",
            "agents": agents,
        }

        urls = [
            f"{Config.CONTROL_PLANE_URL}/runtime/heartbeats",
            f"{Config.CONTROL_PLANE_URL}/api/probe/heartbeat",
        ]

        for url in urls:
            try:
                response = self._session.post(
                    url,
                    json=payload,
                    timeout=Config.TIMEOUT,
                )
                if response.status_code in (200, 202):
                    self.last_report_time = time.time()
                    print(f"[Reporter] heartbeat {len(agents)} agents via {url}", flush=True)
                    return True
                if response.status_code != 404:
                    print(f"[Reporter] heartbeat HTTP {response.status_code} via {url}", flush=True)
            except Exception as exc:
                print(f"[Reporter] heartbeat error {exc} via {url}", flush=True)
        return False

    def seconds_since_last_report(self) -> float:
        return time.time() - self.last_report_time


class TailThread(threading.Thread):
    def __init__(self, session_file: str, queue: Queue[str], start_offset: Optional[int] = None):
        super().__init__(daemon=True)
        self.session_file = session_file
        self.queue = queue
        self._start_offset = start_offset
        self._stop_event = threading.Event()
        self.current_offset = 0

    def stop(self) -> None:
        self._stop_event.set()

    def run(self) -> None:
        waited = 0.0
        while not os.path.exists(self.session_file):
            if self._stop_event.is_set():
                return
            if waited >= 30:
                print(f"[Tail] session file did not appear: {self.session_file}", flush=True)
                return
            time.sleep(0.5)
            waited += 0.5

        try:
            with open(self.session_file, "r", encoding="utf-8") as handle:
                if self._start_offset is not None:
                    handle.seek(self._start_offset)
                else:
                    handle.seek(0, 2)

                self.current_offset = handle.tell()

                while not self._stop_event.is_set():
                    line = handle.readline()
                    if not line:
                        time.sleep(0.2)
                        continue

                    self.current_offset = handle.tell()
                    line = line.strip()
                    if not line:
                        continue

                    try:
                        json.loads(line)
                    except json.JSONDecodeError:
                        print("[Tail] invalid json skipped", flush=True)
                        continue

                    self.queue.put(line)
        except Exception as exc:
            print(f"[Tail] error {exc}", flush=True)


def is_interactive_event_line(line: str) -> bool:
    try:
        event = json.loads(line)
    except Exception:
        return False

    if event.get("type") != "message":
        return False

    message = event.get("message")
    if not isinstance(message, dict):
        return False

    role = message.get("role")
    return role in ("user", "assistant")


class BatchSender(threading.Thread):
    def __init__(
        self,
        session_file: str,
        queue: Queue[str],
        reporter: Reporter,
        checkpoint: Checkpoint,
        tail_ref: Optional[TailThread] = None,
        agent_id: Optional[str] = None,
        agent_slug: Optional[str] = None,
    ):
        super().__init__(daemon=True)
        self.reporter = reporter
        self.queue = queue
        self._session_file = session_file
        self._checkpoint = checkpoint
        self._tail_ref = tail_ref
        self._agent_id = agent_id
        self._agent_slug = agent_slug
        self._stop_event = threading.Event()

    def set_tail_ref(self, tail: TailThread) -> None:
        self._tail_ref = tail

    def stop(self) -> None:
        self._stop_event.set()

    def _flush(self, batch: list[str]) -> bool:
        ok = self.reporter.send_batch(
            self._session_file,
            batch,
            agent_id=self._agent_id,
            agent_slug=self._agent_slug,
        )
        if ok and self._tail_ref:
            self._checkpoint.save(self._session_file, self._tail_ref.current_offset)
        return ok

    def run(self) -> None:
        batch: list[str] = []
        last_flush = time.time()
        interactive_deadline: Optional[float] = None

        while not self._stop_event.is_set():
            timeout = 1.0
            if batch:
                deadline = last_flush + Config.BATCH_INTERVAL
                if interactive_deadline is not None:
                    deadline = min(deadline, interactive_deadline)
                timeout = max(0.05, deadline - time.time())

            try:
                line = self.queue.get(timeout=timeout)
                batch.append(line)
                if is_interactive_event_line(line):
                    interactive_deadline = time.time() + Config.INTERACTIVE_BATCH_INTERVAL
            except Empty:
                pass

            should_flush = (
                len(batch) >= Config.BATCH_SIZE
                or (batch and time.time() - last_flush >= Config.BATCH_INTERVAL)
                or (batch and interactive_deadline is not None and time.time() >= interactive_deadline)
            )

            if not should_flush:
                continue

            if self._flush(batch):
                batch = []
                last_flush = time.time()
                interactive_deadline = None
            else:
                time.sleep(1)

        if batch:
            self._flush(batch)


class AgentSessionStream:
    def __init__(
        self,
        session_file: str,
        sessions_dir: str,
        agent_slug: str,
        agent_id: str,
        reporter: Reporter,
    ):
        self.session_file = session_file
        self.session_id = Path(session_file).stem
        self._queue: Queue[str] = Queue()
        checkpoint_file = os.path.join(
            sessions_dir,
            f".probe_checkpoint_{agent_slug}_{self.session_id}.json",
        )
        self._checkpoint = Checkpoint(checkpoint_file)
        self._tail: Optional[TailThread] = None
        self._sender = BatchSender(
            session_file=session_file,
            queue=self._queue,
            reporter=reporter,
            checkpoint=self._checkpoint,
            agent_id=agent_id,
            agent_slug=agent_slug,
        )

    def start(self) -> None:
        self._sender.start()
        start_offset = self._checkpoint.resolve_start_offset(self.session_file)
        self._tail = TailThread(self.session_file, self._queue, start_offset=start_offset)
        self._tail.start()
        self._sender.set_tail_ref(self._tail)

    def stop(self) -> None:
        if self._tail:
            self._tail.stop()
            self._tail.join(timeout=3)
            self._tail = None
        self._sender.stop()
        self._sender.join(timeout=3)

    def is_tail_alive(self) -> bool:
        return self._tail.is_alive() if self._tail else False

    def is_sender_alive(self) -> bool:
        return self._sender.is_alive()

    def queue_size(self) -> int:
        return self._queue.qsize()


class AgentMonitor:
    def __init__(self, agent_slug: str, agent_id: str, sessions_dir: str, reporter: Reporter):
        self.agent_slug = agent_slug
        self.agent_id = agent_id
        self.sessions_dir = sessions_dir
        self.reporter = reporter
        self.current_session: Optional[str] = None
        self._streams: dict[str, AgentSessionStream] = {}
        self._running = False

    def start(self) -> None:
        self._running = True
        self._sync_sessions()
        threading.Thread(target=self._poll_loop, daemon=True).start()

    def stop(self) -> None:
        self._running = False
        for stream in list(self._streams.values()):
            stream.stop()
        self._streams.clear()

    def _poll_loop(self) -> None:
        while self._running:
            time.sleep(Config.SESSION_POLL_INTERVAL)
            self._sync_sessions()

    def _sync_sessions(self) -> None:
        sessions = self._read_sessions_json()
        target_files = {
            entry.get("sessionFile"): key
            for key, entry in sessions.items()
            if entry.get("sessionFile")
        }

        next_current = self._pick_current_session_file(sessions)
        if next_current != self.current_session:
            self.current_session = next_current

        for session_file in target_files.keys():
            self._track_session_file(session_file)

        for session_file in list(self._streams.keys()):
            if session_file not in target_files:
                self._untrack_session_file(session_file)

    def _track_session_file(self, session_file: Optional[str]) -> bool:
        if not session_file or session_file in self._streams:
            return False
        stream = AgentSessionStream(
            session_file=session_file,
            sessions_dir=self.sessions_dir,
            agent_slug=self.agent_slug,
            agent_id=self.agent_id,
            reporter=self.reporter,
        )
        self._streams[session_file] = stream
        stream.start()
        return True

    def _untrack_session_file(self, session_file: Optional[str]) -> bool:
        if not session_file or session_file not in self._streams:
            return False
        stream = self._streams.pop(session_file)
        stream.stop()
        return True

    def ensure_session_tracked(self, session_file: Optional[str], prefer_current: bool = False) -> bool:
        tracked = self._track_session_file(session_file)
        if session_file and (prefer_current or not self.current_session):
            self.current_session = session_file
        return tracked

    def _pick_current_session_file(self, sessions: dict[str, dict[str, Any]]) -> Optional[str]:
        if not sessions:
            return None

        main_key = f"agent:{self.agent_slug}:main"
        main_entry = sessions.get(main_key)
        if main_entry and main_entry.get("sessionFile"):
            return main_entry.get("sessionFile")

        sorted_entries = sorted(
            sessions.values(),
            key=lambda entry: entry.get("updatedAt", 0),
            reverse=True,
        )
        for entry in sorted_entries:
            session_file = entry.get("sessionFile")
            if session_file:
                return session_file

        return None

    def get_session_file_for_key(self, session_key: Optional[str]) -> Optional[str]:
        normalized = (session_key or "").strip()
        if not normalized:
            return self.current_session

        sessions = self._read_sessions_json()
        entry = sessions.get(normalized)
        if isinstance(entry, dict):
            session_file = entry.get("sessionFile")
            if isinstance(session_file, str) and session_file:
                return session_file
        return None

    def get_session_entry_for_key(self, session_key: Optional[str]) -> Optional[dict[str, Any]]:
        normalized = (session_key or "").strip()
        sessions = self._read_sessions_json()

        if normalized:
            entry = sessions.get(normalized)
            if isinstance(entry, dict):
                return entry
            return None

        current_session = self.current_session
        if current_session:
            for entry in sessions.values():
                if isinstance(entry, dict) and entry.get("sessionFile") == current_session:
                    return entry

        return None

    def _read_sessions_json(self) -> dict[str, dict[str, Any]]:
        path = os.path.join(self.sessions_dir, "sessions.json")
        try:
            with open(path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            if isinstance(data, dict):
                return data
        except Exception:
            pass
        return {}

    def active_session_count(self) -> int:
        return len(self._streams)

    def tail_alive(self) -> bool:
        return any(stream.is_tail_alive() for stream in self._streams.values())

    def sender_alive(self) -> bool:
        return any(stream.is_sender_alive() for stream in self._streams.values())

    def queue_size(self) -> int:
        return sum(stream.queue_size() for stream in self._streams.values())


class SessionManager:
    def __init__(self, reporter: Reporter, runtime_client: OpenClawRuntimeClient):
        self.reporter = reporter
        self.runtime_client = runtime_client
        self._running = True
        self._agents: dict[str, AgentMonitor] = {}
        self._load_agents_config()

    def _load_agents_config(self) -> None:
        configured_agents = parse_probe_agents_config(Config.PROBE_AGENTS_JSON)
        if configured_agents:
            for agent in configured_agents:
                slug = agent["slug"]
                agent_id = agent["agentId"]
                sessions_dir = agent.get("sessionsDir") or self.runtime_client.get_sessions_dir(slug)
                os.makedirs(sessions_dir, exist_ok=True)
                self._agents[slug] = AgentMonitor(
                    agent_slug=slug,
                    agent_id=agent_id,
                    sessions_dir=sessions_dir,
                    reporter=self.reporter,
                )
            return

        try:
            urls = [
                f"{Config.CONTROL_PLANE_URL}/runtime/agents?probeId={Config.PROBE_ID}",
                f"{Config.CONTROL_PLANE_URL}/api/probe/{Config.PROBE_ID}/agents",
            ]

            data = None
            for url in urls:
                response = requests.get(url, timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    break
                if response.status_code != 404:
                    return

            if not data:
                return

            for agent in data.get("agents", []):
                slug = agent.get("slug")
                agent_id = agent.get("agentId")
                sessions_dir = agent.get("sessionsDir") or (
                    self.runtime_client.get_sessions_dir(slug)
                    if slug
                    else None
                )
                if not slug or not agent_id or not sessions_dir:
                    continue

                os.makedirs(sessions_dir, exist_ok=True)
                self._agents[slug] = AgentMonitor(
                    agent_slug=slug,
                    agent_id=agent_id,
                    sessions_dir=sessions_dir,
                    reporter=self.reporter,
                )
        except Exception as exc:
            print(f"[Session] failed to load agent config: {exc}", flush=True)

    def start(self) -> None:
        for monitor in self._agents.values():
            monitor.start()
        threading.Thread(target=self._heartbeat_loop, daemon=True).start()

    def stop(self) -> None:
        self._running = False
        for monitor in self._agents.values():
            monitor.stop()

    def current_session(self) -> Optional[str]:
        sessions = []
        for slug, monitor in self._agents.items():
            if monitor.current_session:
                sessions.append(f"{slug}: {monitor.current_session}")
        return "; ".join(sessions) if sessions else None

    def _heartbeat_loop(self) -> None:
        while self._running:
            time.sleep(5)
            if self.reporter.seconds_since_last_report() < Config.HEARTBEAT_INTERVAL:
                continue

            agents = []
            for slug, monitor in self._agents.items():
                agents.append(
                    {
                        "agentId": monitor.agent_id,
                        "agentSlug": slug,
                        "sessionFile": monitor.current_session,
                        "hasSession": monitor.current_session is not None,
                    }
                )
            self.reporter.send_heartbeat(agents)


app = Flask(__name__)
_reporter: Optional[Reporter] = None
_session_mgr: Optional[SessionManager] = None
_runtime_client: Optional[OpenClawRuntimeClient] = None
_started_at = utc_now_iso()


def _safe_iso_mtime(path: Path) -> Optional[str]:
    try:
        return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    except Exception:
        return None


def _safe_git_commit(repo_root: Path) -> Optional[str]:
    try:
        output = subprocess.check_output(
            ["git", "-C", str(repo_root), "rev-parse", "--short", "HEAD"],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=2,
        )
        return output.strip() or None
    except Exception:
        return None


def _probe_build_info() -> dict[str, Any]:
    repo_root = Path(__file__).resolve().parent
    files = (repo_root / "app.py", repo_root / "runtime_client.py")
    digest = hashlib.sha256()
    for file_path in files:
        try:
            digest.update(file_path.read_bytes())
        except Exception:
            digest.update(f"missing:{file_path.name}".encode("utf-8"))

    return {
        "startedAt": _started_at,
        "pid": os.getpid(),
        "cwd": os.getcwd(),
        "repoRoot": str(repo_root),
        "gitCommit": _safe_git_commit(repo_root),
        "codeFingerprint": digest.hexdigest()[:16],
        "appPyMtime": _safe_iso_mtime(repo_root / "app.py"),
        "runtimeClientPyMtime": _safe_iso_mtime(repo_root / "runtime_client.py"),
    }


def _normalize_agent_slug(agent_slug: Optional[str]) -> Optional[str]:
    slug = (agent_slug or "").strip().lower()
    return slug or None


def _build_main_session_key(agent_slug: str) -> str:
    return f"agent:{agent_slug}:main"


def _is_task_scoped_session_key(session_key: Optional[str]) -> bool:
    raw = (session_key or "").strip().lower()
    return raw.startswith("agent:") and (":task:" in raw or ":taskrun:" in raw)


def _is_main_session_key(agent_slug: Optional[str], session_key: Optional[str]) -> bool:
    raw = (session_key or "").strip().lower()
    slug = _normalize_agent_slug(agent_slug)
    if not raw or not slug:
        return False
    return raw == _build_main_session_key(slug)


def _parse_agent_slug_from_session_key(session_key: Optional[str]) -> Optional[str]:
    raw = (session_key or "").strip()
    if not raw.startswith("agent:"):
        return None

    parts = raw.split(":")
    if len(parts) < 3:
        return None

    slug = parts[1].strip().lower()
    return slug or None


def _extract_gateway_result(parsed: Optional[dict[str, Any]]) -> dict[str, Any]:
    if not isinstance(parsed, dict):
        return {}

    payload = parsed.get("payload")
    if isinstance(payload, dict):
        return payload

    return parsed


def _extract_session_file(session_entry: Optional[dict[str, Any]]) -> Optional[str]:
    if not isinstance(session_entry, dict):
        return None
    session_file = session_entry.get("sessionFile")
    if isinstance(session_file, str) and session_file:
        return session_file
    return None


def _extract_logical_session_id(
    session_entry: Optional[dict[str, Any]],
    create_payload: Optional[dict[str, Any]] = None,
) -> Optional[str]:
    if isinstance(create_payload, dict):
        session_id = create_payload.get("sessionId")
        if isinstance(session_id, str) and session_id:
            return session_id

    if isinstance(session_entry, dict):
        session_id = session_entry.get("sessionId")
        if isinstance(session_id, str) and session_id:
            return session_id

        session_file = _extract_session_file(session_entry)
        if session_file:
            return Path(session_file).stem

    return None


def _resolve_session_identity(
    monitor: Optional[AgentMonitor],
    session_key: Optional[str],
    session_entry: Optional[dict[str, Any]],
    logical_session_id: Optional[str],
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    session_file = _extract_session_file(session_entry)
    if not session_file and monitor:
        resolved_file = monitor.get_session_file_for_key(session_key)
        if isinstance(resolved_file, str) and resolved_file:
            session_file = resolved_file

    transcript_id = Path(session_file).stem if session_file else None

    if not session_file and logical_session_id and monitor and isinstance(monitor.sessions_dir, str):
        session_file = os.path.join(monitor.sessions_dir, f"{logical_session_id}.jsonl")
        transcript_id = logical_session_id

    effective_session_id = transcript_id or logical_session_id
    return effective_session_id, session_file, transcript_id


def _resolve_send_target(agent_slug: Optional[str], session_key: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    effective_key = (session_key or "").strip() or None
    effective_slug = _normalize_agent_slug(agent_slug) or _parse_agent_slug_from_session_key(effective_key)

    if not effective_slug and _session_mgr:
        effective_slug = next(iter(_session_mgr._agents.keys()), None)

    if not effective_slug:
        return None, None

    if not effective_key:
        effective_key = _build_main_session_key(effective_slug)

    return effective_slug, effective_key


@app.route("/health")
def health():
    debug = {}
    if _session_mgr:
        for slug, monitor in _session_mgr._agents.items():
            debug[slug] = {
                "session": monitor.current_session,
                "tailAlive": monitor.tail_alive(),
                "senderAlive": monitor.sender_alive(),
                "queueSize": monitor.queue_size(),
                "activeSessions": monitor.active_session_count(),
            }

    return jsonify(
        {
            "status": "ok",
            "probeId": Config.PROBE_ID,
            "currentSession": _session_mgr.current_session() if _session_mgr else None,
            "lastReportSecondsAgo": round(_reporter.seconds_since_last_report(), 1) if _reporter else None,
            "heartbeatInterval": Config.HEARTBEAT_INTERVAL,
            "agents": debug,
            "buildInfo": _probe_build_info(),
        }
    )


@app.route("/session")
def get_session():
    agent_slug = request.args.get("agentSlug")
    session_key = request.args.get("sessionKey")
    request_id = request.headers.get("x-request-id") or request.args.get("requestId")

    if agent_slug and _session_mgr:
        monitor = _session_mgr._agents.get(agent_slug)
        if not monitor:
            return jsonify({"error": f"Agent '{agent_slug}' not found"}), 404

        entry = monitor.get_session_entry_for_key(session_key)
        logical_session_id = _extract_logical_session_id(entry)
        resolved_session_id, session_file, transcript_id = _resolve_session_identity(
            monitor,
            session_key,
            entry,
            logical_session_id,
        )
        return jsonify(
            {
                "requestId": request_id,
                "sessionFile": session_file,
                "sessionId": resolved_session_id,
                "transcriptId": transcript_id or resolved_session_id,
                "logicalSessionId": logical_session_id,
                "agentSlug": agent_slug,
                "sessionKey": session_key,
            }
        )

    session_file = _session_mgr.current_session() if _session_mgr else None
    return jsonify(
        {
            "requestId": request_id,
            "sessionFile": session_file,
            "sessionId": Path(session_file).stem if session_file else None,
        }
    )


@app.route("/session/ensure", methods=["POST"])
def ensure_session():
    try:
        data = request.get_json() or {}
        request_id = request.headers.get("x-request-id") or data.get("requestId")
        agent_slug = data.get("agentSlug")
        session_key = data.get("sessionKey")
        session_label = data.get("sessionLabel")
        session_task = data.get("sessionTask")

        if not _session_mgr or not _runtime_client:
            return jsonify({"requestId": request_id, "error": "Probe not initialized"}), 400

        effective_slug, effective_session_key = _resolve_send_target(agent_slug, session_key)
        if not effective_slug or not effective_session_key:
            return jsonify({"requestId": request_id, "error": "No agent available"}), 400
        if effective_slug not in _session_mgr._agents:
            return jsonify({"requestId": request_id, "error": f"Agent '{effective_slug}' not registered in probe"}), 404

        monitor = _session_mgr._agents.get(effective_slug)
        explicit_task_session = _is_task_scoped_session_key(session_key)

        create_result = _runtime_client.sessions_create(
            agent_id=effective_slug,
            key=effective_session_key,
            label=session_label,
            task=session_task,
        )
        if (not create_result.ok) and explicit_task_session and (session_label or session_task):
            create_result = _runtime_client.sessions_create(
                agent_id=effective_slug,
                key=effective_session_key,
            )

        create_payload = _extract_gateway_result(create_result.parsed) if create_result.ok else {}
        session_entry = create_payload.get("entry") if isinstance(create_payload.get("entry"), dict) else {}
        if not session_entry and monitor:
            existing_entry = monitor.get_session_entry_for_key(effective_session_key)
            session_entry = existing_entry if isinstance(existing_entry, dict) else {}

        logical_session_id = _extract_logical_session_id(session_entry, create_payload)
        session_id, session_file, transcript_id = _resolve_session_identity(
            monitor,
            effective_session_key,
            session_entry,
            logical_session_id,
        )
        if not session_id:
            error_text = create_result.output if create_result else "Gateway did not return sessionId"
            return jsonify({"requestId": request_id, "error": f"Failed to ensure session: {error_text}"}), 500

        if session_file and monitor:
            monitor.ensure_session_tracked(
                session_file,
                prefer_current=_is_main_session_key(effective_slug, effective_session_key),
            )

        return jsonify(
            {
                "requestId": request_id,
                "agentSlug": effective_slug,
                "sessionKey": effective_session_key,
                "sessionId": session_id,
                "sessionFile": session_file,
                "transcriptId": transcript_id or session_id,
                "logicalSessionId": logical_session_id,
                "sessionsDir": monitor.sessions_dir if monitor else None,
            }
        )
    except Exception as exc:
        print(f"[Session Ensure] error {exc}", flush=True)
        return jsonify({"requestId": request.headers.get("x-request-id"), "error": str(exc)}), 500


@app.route("/send", methods=["POST"])
def send_message():
    try:
        data = request.get_json() or {}
        request_id = request.headers.get("x-request-id") or data.get("requestId")
        message = data.get("message")
        sender = data.get("sender")
        agent_slug = data.get("agentSlug")
        session_key = data.get("sessionKey")
        owner_key = data.get("ownerKey")
        idempotency_key = data.get("idempotencyKey")
        session_label = data.get("sessionLabel")
        session_task = data.get("sessionTask")
        dispatch_mode = (data.get("dispatchMode") or "session_send").strip()
        async_send = data.get("asyncSend") is True
        client_sent_at = data.get("clientSentAt")
        platform_received_at = data.get("platformReceivedAt")
        platform_sent_at = data.get("platformSentAt")
        probe_received_at = utc_now_iso()

        if not message:
            return jsonify({"error": "Missing message"}), 400
        if not _session_mgr or not _runtime_client:
            return jsonify({"error": "Probe not initialized"}), 400

        effective_slug, effective_session_key = _resolve_send_target(agent_slug, session_key)
        if not effective_slug or not effective_session_key:
            return jsonify({"error": "No agent available"}), 400
        if effective_slug not in _session_mgr._agents:
            return jsonify({"error": f"Agent '{effective_slug}' not registered in probe"}), 404

        monitor = _session_mgr._agents.get(effective_slug)
        fallback_session_file = monitor.current_session if monitor else None
        fallback_session_id = Path(fallback_session_file).stem if fallback_session_file else None
        explicit_task_session = _is_task_scoped_session_key(session_key)
        allow_main_fallback = not explicit_task_session
        used_fallback = False

        full_message = message
        if sender:
            metadata_block = json.dumps(sender, ensure_ascii=False)
            full_message = f"Sender (untrusted metadata):\n```json\n{metadata_block}\n```\n\n{message}"

        create_result = _runtime_client.sessions_create(
            agent_id=effective_slug,
            key=effective_session_key,
            label=session_label,
            task=session_task,
        )
        if (not create_result.ok) and explicit_task_session and (session_label or session_task):
            create_result = _runtime_client.sessions_create(
                agent_id=effective_slug,
                key=effective_session_key,
            )

        logical_session_id = None
        transcript_id = None
        if create_result.ok:
            create_payload = _extract_gateway_result(create_result.parsed)
            session_entry = create_payload.get("entry") if isinstance(create_payload.get("entry"), dict) else {}
            logical_session_id = _extract_logical_session_id(session_entry, create_payload)
            session_id, session_file, transcript_id = _resolve_session_identity(
                monitor,
                effective_session_key,
                session_entry,
                logical_session_id,
            )
            if session_file and monitor:
                monitor.ensure_session_tracked(
                    session_file,
                    prefer_current=_is_main_session_key(effective_slug, effective_session_key),
                )
        else:
            session_id = None

        if not session_id and fallback_session_id and allow_main_fallback:
            used_fallback = True
            session_id = fallback_session_id
            transcript_id = fallback_session_id
            effective_session_key = _build_main_session_key(effective_slug)

        if not session_id:
            error_text = create_result.output if create_result else "Gateway did not return sessionId"
            return jsonify({"error": f"Failed to ensure session: {error_text}"}), 500

        print(
            "[Send] "
            f"requestId={request_id or '-'} "
            f"agent={effective_slug} "
            f"sessionKey={effective_session_key} "
            f"ownerKey={owner_key or '-'} "
            f"idempotencyKey={idempotency_key or '-'} "
            f"c->p={elapsed_ms(client_sent_at, platform_received_at)}ms "
            f"p->probe={elapsed_ms(platform_sent_at, probe_received_at)}ms",
            flush=True,
        )

        run_id = None
        send_payload = None
        send_status = "queued"

        def _run_fallback(send_session_id: str) -> None:
            try:
                result = _runtime_client.agent_send(effective_slug, send_session_id, full_message, timeout=120)
                if result.ok:
                    print("[Send] fallback done", flush=True)
                else:
                    print(f"[Send] fallback failed {result.output[:200]}", flush=True)
            except Exception as exc:
                print(f"[Send] fallback exception {exc}", flush=True)

        def _run_async_session_send(send_key: str, legacy_session_id: Optional[str], can_fallback: bool) -> None:
            try:
                send_result = _runtime_client.sessions_send(
                    send_key,
                    full_message,
                    timeout_ms=120000,
                    idempotency_key=idempotency_key,
                )
                if send_result.ok:
                    payload = _extract_gateway_result(send_result.parsed)
                    async_run_id = payload.get("runId") if isinstance(payload, dict) else None
                    print(f"[Send] async accepted runId={async_run_id or '-'}", flush=True)
                    return

                if legacy_session_id and can_fallback:
                    _run_fallback(legacy_session_id)
                    return

                print(f"[Send] async sessions.send failed {send_result.output[:200]}", flush=True)
            except Exception as exc:
                print(f"[Send] async exception {exc}", flush=True)

        if used_fallback:
            threading.Thread(target=_run_fallback, args=(session_id,), daemon=True).start()
        elif dispatch_mode == "gateway_agent":
            send_result = _runtime_client.agent_run(
                agent_id=effective_slug,
                session_key=effective_session_key,
                session_id=logical_session_id or session_id,
                message=full_message,
                idempotency_key=idempotency_key,
                timeout_ms=15000,
            )
            if not send_result.ok:
                return jsonify({"error": send_result.output}), 500

            send_payload = _extract_gateway_result(send_result.parsed)
            if isinstance(send_payload, dict):
                run_id = send_payload.get("runId")
                send_status = send_payload.get("status") or "accepted"
            else:
                send_status = "accepted"
        else:
            if async_send:
                threading.Thread(
                    target=_run_async_session_send,
                    args=(effective_session_key, fallback_session_id, allow_main_fallback),
                    daemon=True,
                ).start()
                return jsonify(
                    {
                        "success": True,
                        "requestId": request_id,
                        "sessionId": session_id,
                        "transcriptId": transcript_id or session_id,
                        "logicalSessionId": logical_session_id,
                        "sessionKey": effective_session_key,
                        "runId": None,
                        "data": None,
                        "fallbackMode": "legacy_current_session" if used_fallback else None,
                        "status": send_status,
                        "probeReceivedAt": probe_received_at,
                        "timing": {
                            "clientSentAt": client_sent_at,
                            "platformReceivedAt": platform_received_at,
                            "platformSentAt": platform_sent_at,
                            "probeReceivedAt": probe_received_at,
                        },
                    }
                )

            send_result = _runtime_client.sessions_send(
                effective_session_key,
                full_message,
                timeout_ms=120000,
                idempotency_key=idempotency_key,
            )
            if send_result.ok:
                send_payload = _extract_gateway_result(send_result.parsed)
                if isinstance(send_payload, dict):
                    run_id = send_payload.get("runId")
                    send_status = send_payload.get("status") or "accepted"
                else:
                    send_status = "accepted"
            elif fallback_session_id and allow_main_fallback:
                used_fallback = True
                session_id = fallback_session_id
                effective_session_key = _build_main_session_key(effective_slug)
                threading.Thread(
                    target=_run_fallback,
                    args=(fallback_session_id,),
                    daemon=True,
                ).start()
            else:
                return jsonify({"error": send_result.output}), 500

        return jsonify(
            {
                "success": True,
                "requestId": request_id,
                "sessionId": session_id,
                "transcriptId": transcript_id or session_id,
                "logicalSessionId": logical_session_id,
                "sessionKey": effective_session_key,
                "runId": run_id,
                "data": send_payload,
                "fallbackMode": "legacy_current_session" if used_fallback else None,
                "status": send_status,
                "probeReceivedAt": probe_received_at,
                "timing": {
                    "clientSentAt": client_sent_at,
                    "platformReceivedAt": platform_received_at,
                    "platformSentAt": platform_sent_at,
                    "probeReceivedAt": probe_received_at,
                },
            }
        )
    except Exception as exc:
        print(f"[Send] error {exc}", flush=True)
        return jsonify({"requestId": request.headers.get("x-request-id"), "error": str(exc)}), 500


@app.route("/abort", methods=["POST"])
def abort_session():
    try:
        data = request.get_json() or {}
        agent_slug = data.get("agentSlug")
        session_key = data.get("sessionKey")
        run_id = data.get("runId")

        if not _runtime_client:
            return jsonify({"error": "Probe not initialized"}), 400

        effective_slug, effective_session_key = _resolve_send_target(agent_slug, session_key)
        if not effective_slug or not effective_session_key:
            return jsonify({"error": "No agent/session available"}), 400

        result = _runtime_client.sessions_abort(effective_session_key, run_id=run_id)
        if not result.ok:
            return jsonify({"error": result.output}), 500

        payload = _extract_gateway_result(result.parsed)
        return jsonify({"success": True, "sessionKey": effective_session_key, "data": payload})
    except Exception as exc:
        print(f"[Abort] error {exc}", flush=True)
        return jsonify({"error": str(exc)}), 500


def initialize_bridge() -> None:
    global _reporter
    global _session_mgr
    global _runtime_client

    _reporter = Reporter()
    _runtime_client = OpenClawRuntimeClient(Config.OPENCLAW_HOME)
    _session_mgr = SessionManager(_reporter, _runtime_client)
    _session_mgr.start()


if __name__ == "__main__":
    initialize_bridge()
    app.run(host="0.0.0.0", port=Config.PROBE_PORT, debug=False)
