#!/usr/bin/env python3
"""
OpenClaw runtime client wrapper.

This module keeps OpenClaw CLI and gateway details out of the Flask bridge so the
bridge can stay focused on transport and session coordination.
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional


@dataclass
class CommandResult:
    ok: bool
    output: str = ""
    parsed: Optional[Any] = None
    returncode: int = 0


class OpenClawRuntimeClient:
    def __init__(self, openclaw_home: str, timeout: int = 120):
        home_path = Path(openclaw_home).expanduser().resolve()
        self.home = str(home_path.parent if home_path.name == ".openclaw" else home_path)
        self.timeout = timeout
        self._gateway_token: Optional[str] = None
        self._resolved_config_path: Optional[Path] = None

    @property
    def home_path(self) -> Path:
        return Path(self.home)

    @property
    def state_dir(self) -> Path:
        return self.home_path / ".openclaw"

    @property
    def workspace_root(self) -> Path:
        os_home = Path(os.path.expanduser("~")).resolve()
        if self.home_path == os_home:
            return self.state_dir / "workspaces"

        direct = self.home_path / "workspaces"
        if direct.exists():
            return direct

        return self.state_dir / "workspaces"

    @property
    def agent_root(self) -> Path:
        return self.state_dir / "agents"

    def _preferred_openclaw_config_path(self) -> Path:
        configured = os.getenv("OPENCLAW_CONFIG_PATH")
        if configured:
            return Path(configured)
        return self.state_dir / "openclaw.json"

    def _cli_home_root(self) -> Path:
        return self.home_path

    def _run(self, cmd: list[str], timeout: Optional[float] = None) -> CommandResult:
        try:
            child_env = dict(os.environ)
            preferred_config_path = self._preferred_openclaw_config_path()
            cli_home_root = self._cli_home_root()
            child_env["HOME"] = str(cli_home_root)
            child_env["OPENCLAW_HOME"] = str(cli_home_root)
            child_env.setdefault("OPENCLAW_CONFIG_PATH", str(preferred_config_path))
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout or self.timeout,
                env=child_env,
            )
        except subprocess.TimeoutExpired:
            return CommandResult(ok=False, output="Command timed out", returncode=-1)
        except Exception as exc:
            return CommandResult(ok=False, output=str(exc), returncode=-1)

        output = (result.stdout or result.stderr or "").strip()
        if result.returncode != 0:
            return CommandResult(
                ok=False,
                output=output or f"Exit code {result.returncode}",
                returncode=result.returncode,
            )

        parsed = self._parse_json(output)
        return CommandResult(ok=True, output=output, parsed=parsed, returncode=0)

    @staticmethod
    def _parse_json(output: str) -> Optional[Any]:
        if not output:
            return None

        try:
            return json.loads(output)
        except json.JSONDecodeError:
            pass

        start = output.find("{")
        end = output.rfind("}")
        if start == -1 or end == -1 or end < start:
            return None

        try:
            return json.loads(output[start : end + 1])
        except json.JSONDecodeError:
            return None

    def _candidate_openclaw_config_paths(self) -> list[Path]:
        paths: list[Path] = [self._preferred_openclaw_config_path()]
        paths.append(self.home_path / "openclaw.json")

        env_home = os.getenv("HOME")
        if env_home:
            paths.append(Path(env_home) / ".openclaw" / "openclaw.json")

        unique: list[Path] = []
        seen = set()
        for path in paths:
            key = str(path)
            if key in seen:
                continue
            seen.add(key)
            unique.append(path)
        return unique

    def _resolve_gateway_token(self) -> Optional[str]:
        explicit = os.getenv("OPENCLAW_GATEWAY_TOKEN")
        if explicit and explicit.strip():
            return explicit.strip()

        if self._gateway_token is not None:
            return self._gateway_token

        for path in self._candidate_openclaw_config_paths():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                continue

            self._resolved_config_path = path
            token = data.get("gateway", {}).get("auth", {}).get("token")
            if isinstance(token, str) and token.strip():
                self._gateway_token = token.strip()
                return self._gateway_token

        return None

    def gateway_call(
        self,
        method: str,
        params: Optional[dict[str, Any]] = None,
        timeout_ms: Optional[int] = None,
        expect_final: bool = False,
    ) -> CommandResult:
        cmd = [
            "openclaw",
            "gateway",
            "call",
            method,
            "--json",
            "--params",
            json.dumps(params or {}, ensure_ascii=False),
        ]
        if expect_final:
            cmd.append("--expect-final")
        if timeout_ms is not None:
            cmd.extend(["--timeout", str(timeout_ms)])

        gateway_token = self._resolve_gateway_token()
        if gateway_token:
            cmd.extend(["--token", gateway_token])

        process_timeout = timeout_ms / 1000 + 15 if timeout_ms else None
        return self._run(cmd, timeout=process_timeout)

    def sessions_create(
        self,
        agent_id: str,
        key: str,
        label: Optional[str] = None,
        task: Optional[str] = None,
        message: Optional[str] = None,
        model: Optional[str] = None,
        timeout_ms: int = 15000,
    ) -> CommandResult:
        params: dict[str, Any] = {"agentId": agent_id, "key": key}
        if label:
            params["label"] = label
        if task:
            params["task"] = task
        if message:
            params["message"] = message
        if model:
            params["model"] = model
        return self.gateway_call("sessions.create", params, timeout_ms=timeout_ms)

    def sessions_send(
        self,
        key: str,
        message: str,
        timeout_ms: int = 120000,
        idempotency_key: Optional[str] = None,
    ) -> CommandResult:
        params: dict[str, Any] = {
            "key": key,
            "message": message,
            "timeoutMs": timeout_ms,
        }
        if idempotency_key:
            params["idempotencyKey"] = idempotency_key
        return self.gateway_call("sessions.send", params, timeout_ms=timeout_ms)

    def sessions_abort(
        self,
        key: str,
        run_id: Optional[str] = None,
        timeout_ms: int = 15000,
    ) -> CommandResult:
        params: dict[str, Any] = {"key": key}
        if run_id:
            params["runId"] = run_id
        return self.gateway_call("sessions.abort", params, timeout_ms=timeout_ms)

    def agent_run(
        self,
        agent_id: str,
        session_key: str,
        message: str,
        session_id: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        timeout_ms: int = 15000,
    ) -> CommandResult:
        params: dict[str, Any] = {
            "agentId": agent_id,
            "sessionKey": session_key,
            "message": message,
        }
        if session_id:
            params["sessionId"] = session_id
        if idempotency_key:
            params["idempotencyKey"] = idempotency_key
        return self.gateway_call("agent", params, timeout_ms=timeout_ms)

    def agent_send(
        self,
        slug: str,
        session_id: str,
        message: str,
        timeout: Optional[int] = None,
    ) -> CommandResult:
        return self._run(
            [
                "openclaw",
                "agent",
                "--agent",
                slug,
                "--session-id",
                session_id,
                "--message",
                message,
            ],
            timeout=timeout or 120,
        )

    def _agent_dir(self, slug: str) -> Path:
        return self.agent_root / slug

    def get_sessions_dir(self, slug: str) -> str:
        return str(self._agent_dir(slug) / "sessions")
