# Runtime Protocol

This document describes the current public-facing runtime protocol between the control plane and execution-side services.

The protocol is intentionally small. It is meant to support the first coherent open source flow, not to mirror every legacy or compatibility route.

## Current Routes

### Register Runtime Agent

```text
POST /runtime/agents
```

Request body:

```json
{
  "agentId": "agent-1",
  "slug": "demo-agent",
  "probeId": "probe-1",
  "sessionsDir": "/tmp/demo-agent/sessions"
}
```

Use this when a probe-managed runtime should be discoverable by the control plane.

### List Runtime Agents

```text
GET /runtime/agents?probeId=probe-1
```

Returns the currently registered runtime agents for a probe.

### Report Probe Heartbeat

```text
POST /runtime/heartbeats
```

Request body:

```json
{
  "probeId": "probe-1",
  "timestamp": "2026-04-23T08:10:00.000Z",
  "status": "alive",
  "agents": [
    {
      "agentId": "agent-1",
      "agentSlug": "demo-agent",
      "sessionFile": "/tmp/demo-agent/sessions/session-1.jsonl",
      "hasSession": true
    }
  ]
}
```

This is the current online-state signal from the probe bridge to the control plane.

### Ingest Normalized Runtime Event

```text
POST /runtime-events
```

This route accepts already-normalized runtime events.

### Ingest Raw Probe Event Batch

```text
POST /runtime-events/batch
```

Request body:

```json
{
  "probeId": "probe-1",
  "sessionFile": "/tmp/demo-agent/sessions/session-1.jsonl",
  "agentId": "agent-1",
  "timestamp": "2026-04-23T08:11:00.000Z",
  "rawDataList": [
    "{\"type\":\"message\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"Ready\"}]}}"
  ]
}
```

Current behavior:

- accepts plain JSON or `gzip` JSON body
- parses supported OpenClaw raw events on the control-plane side
- converts them into normalized runtime events
- correlates them against active task runs

## Protocol Notes

- `probe-bridge` now prefers these public routes first.
- Legacy `/api/probe/*` routes are still used as compatibility fallback during the transition.
- Raw-event parsing still lives on the control-plane side, consistent with the design rule that the probe stays transport-focused.

## Browser Worker Boundary

The browser worker currently stabilizes through shared contracts instead of HTTP routes:

- `BrowserTaskExecutionRequest`
- `BrowserTaskExecutionResult`
- `BrowserWorkerArtifact`
- `BrowserWorkerLogEntry`

The first worker loop lives under `services/browser-worker` and is intentionally a mock execution path that proves the control-plane boundary before the real runtime is extracted.
