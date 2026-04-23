# Probe Bridge

Execution-side bridge for remote agent runtimes.

The probe bridge is the first extracted execution-side adapter in this repo. It keeps a narrow job:

- watch runtime session output
- batch and forward raw runtime events
- report heartbeat
- inject messages back into the active runtime session
- keep lightweight session identity and runtime fallback logic close to the runtime

It should stay transport-focused. It is not a second control plane.

## Current Scope

This first public cut intentionally includes only the bridge core:

- session polling and tailing
- batch event forwarding
- heartbeat reporting
- session ensure
- message send
- abort support
- OpenClaw gateway integration

It intentionally does not include:

- artifact upload
- attachment download
- platform-side parsing
- agent CRUD flows
- environment-specific config management surfaces

## Compatibility

The bridge now prefers the public Gohan runtime protocol first:

- `POST /runtime-events/batch`
- `POST /runtime/heartbeats`
- `GET /runtime/agents?probeId=<probeId>`

Legacy compatibility routes are still kept as fallback during the transition:

- `POST /api/probe/events/raw/batch`
- `POST /api/probe/heartbeat`
- `GET /api/probe/<probeId>/agents`

See [docs/RUNTIME_PROTOCOL.md](../../docs/RUNTIME_PROTOCOL.md).

## Files

- `app.py`: Flask service, session tracking, batching, HTTP routes
- `runtime_client.py`: OpenClaw CLI and gateway wrapper
- `test_app.py`: bridge unit tests
- `requirements.txt`: minimal Python dependencies

## Configuration

Environment variables:

- `GOHAN_CONTROL_PLANE_URL`
- `GOHAN_PROBE_AGENTS_JSON`
- `PROBE_ID`
- `PROBE_PORT`
- `OPENCLAW_HOME`
- `OPENCLAW_SESSIONS_DIR`

`GOHAN_CONTROL_PLANE_URL` is the control-plane endpoint used by the bridge.
`GOHAN_PROBE_AGENTS_JSON` can be used to seed probe-managed agents locally without a separate agent registry.

## Local Run

```bash
cd services/probe-bridge
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 app.py
```

## Verification

Minimal verification:

```bash
cd services/probe-bridge
python3 -m unittest -v
```
