#!/usr/bin/env python3

import gzip
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from queue import Queue
from unittest.mock import MagicMock, patch

import app
from runtime_client import OpenClawRuntimeClient


class TestUtils(unittest.TestCase):
    def test_utc_now_iso(self):
        value = app.utc_now_iso()
        self.assertTrue(value.endswith("Z"))
        self.assertIn("T", value)

    def test_elapsed_ms(self):
        start = "2026-01-01T00:00:00.000Z"
        end = "2026-01-01T00:00:01.500Z"
        self.assertEqual(app.elapsed_ms(start, end), 1500)

    def test_elapsed_ms_bad_input(self):
        self.assertEqual(app.elapsed_ms(None, "2026-01-01T00:00:00Z"), 0)
        self.assertEqual(app.elapsed_ms("bad", "also-bad"), 0)

    def test_is_interactive_event_line(self):
        self.assertTrue(
            app.is_interactive_event_line(
                json.dumps({"type": "message", "message": {"role": "assistant"}})
            )
        )
        self.assertFalse(
            app.is_interactive_event_line(
                json.dumps({"type": "message", "message": {"role": "toolResult"}})
            )
        )

    def test_parse_probe_agents_config(self):
        parsed = app.parse_probe_agents_config(
            json.dumps(
                [
                    {
                        "agentId": "agent-1",
                        "slug": "demo-agent",
                        "sessionsDir": "/tmp/demo-agent/sessions",
                    }
                ]
            )
        )
        self.assertEqual(
            parsed,
            [
                {
                    "agentId": "agent-1",
                    "slug": "demo-agent",
                    "sessionsDir": "/tmp/demo-agent/sessions",
                }
            ],
        )


class TestReporter(unittest.TestCase):
    def setUp(self):
        self.reporter = app.Reporter()

    def test_send_batch_empty(self):
        with patch.object(self.reporter._session, "post") as mock_post:
            self.assertTrue(self.reporter.send_batch("s.jsonl", []))
        mock_post.assert_not_called()

    def test_send_batch_gzip_payload(self):
        response = MagicMock(status_code=202)
        captured = {}

        def fake_post(url, data, headers, timeout):
            captured["url"] = url
            captured["data"] = data
            captured["headers"] = headers
            return response

        with patch.object(self.reporter._session, "post", side_effect=fake_post):
            result = self.reporter.send_batch("s.jsonl", ['{"x":1}', '{"x":2}'], agent_id="a1", agent_slug="demo")

        self.assertTrue(result)
        self.assertEqual(captured["url"], "http://localhost:3000/runtime-events/batch")
        self.assertEqual(captured["headers"]["Content-Encoding"], "gzip")
        payload = json.loads(gzip.decompress(captured["data"]))
        self.assertEqual(payload["rawDataList"], ['{"x":1}', '{"x":2}'])
        self.assertEqual(payload["agentId"], "a1")
        self.assertEqual(payload["agentSlug"], "demo")

    def test_send_heartbeat_uses_public_route(self):
        response = MagicMock(status_code=202)
        captured = {}

        def fake_post(url, json, timeout):
            captured["url"] = url
            captured["json"] = json
            return response

        with patch.object(self.reporter._session, "post", side_effect=fake_post):
            result = self.reporter.send_heartbeat(
                [{"agentId": "agent-1", "agentSlug": "demo-agent", "hasSession": True}]
            )

        self.assertTrue(result)
        self.assertEqual(captured["url"], "http://localhost:3000/runtime/heartbeats")
        self.assertEqual(captured["json"]["probeId"], app.Config.PROBE_ID)


class TestTailThread(unittest.TestCase):
    def test_tail_reads_new_lines(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as handle:
            filename = handle.name

        queue = Queue()
        tail = app.TailThread(filename, queue)
        tail.start()
        time.sleep(0.3)

        line = '{"type":"message","id":"e1"}'
        with open(filename, "a", encoding="utf-8") as handle:
            handle.write(line + "\n")

        time.sleep(0.5)
        tail.stop()
        tail.join(timeout=2)

        os.unlink(filename)
        self.assertFalse(queue.empty())
        self.assertEqual(queue.get_nowait(), line)


class TestRuntimeClient(unittest.TestCase):
    def test_sessions_create_command(self):
        client = OpenClawRuntimeClient(openclaw_home="/tmp")
        with patch("runtime_client.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(stdout='{"ok":true}', stderr="", returncode=0)
            result = client.sessions_create("demo", "agent:demo:main", label="Demo")

        self.assertTrue(result.ok)
        cmd = mock_run.call_args[0][0]
        self.assertEqual(cmd[:4], ["openclaw", "gateway", "call", "sessions.create"])
        self.assertIn("--json", cmd)
        self.assertIn("--params", cmd)


class TestFlaskRoutes(unittest.TestCase):
    def setUp(self):
        app.app.testing = True
        self.client = app.app.test_client()
        app._reporter = MagicMock()
        app._reporter.seconds_since_last_report.return_value = 1.2

        monitor = MagicMock()
        monitor.current_session = "/tmp/demo-session.jsonl"
        monitor.tail_alive.return_value = True
        monitor.sender_alive.return_value = True
        monitor.queue_size.return_value = 0
        monitor.active_session_count.return_value = 1
        app._session_mgr = MagicMock()
        app._session_mgr.current_session.return_value = "demo: /tmp/demo-session.jsonl"
        app._session_mgr._agents = {"demo": monitor}

    def test_health(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["status"], "ok")
        self.assertIn("buildInfo", payload)


class TestSessionManager(unittest.TestCase):
    def test_load_agents_config_from_env(self):
        reporter = MagicMock()
        runtime_client = MagicMock(spec=OpenClawRuntimeClient)
        runtime_client.get_sessions_dir.return_value = "/tmp/fallback/sessions"

        original = app.Config.PROBE_AGENTS_JSON
        app.Config.PROBE_AGENTS_JSON = json.dumps(
            [
                {
                    "agentId": "agent-1",
                    "slug": "demo-agent",
                    "sessionsDir": "/tmp/demo-agent/sessions",
                }
            ]
        )
        try:
            with patch("app.os.makedirs") as makedirs:
                manager = app.SessionManager(reporter, runtime_client)

            self.assertIn("demo-agent", manager._agents)
            self.assertEqual(manager._agents["demo-agent"].agent_id, "agent-1")
            makedirs.assert_called_once_with("/tmp/demo-agent/sessions", exist_ok=True)
        finally:
            app.Config.PROBE_AGENTS_JSON = original


if __name__ == "__main__":
    unittest.main()
