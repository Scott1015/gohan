# Local Demo

The fastest way to show what Gohan is trying to be is to run the control plane and probe bridge together.

This demo proves a more realistic runtime path than the earlier single-process walkthrough:

1. a probe-managed runtime is seeded locally
2. the probe bridge reports heartbeat into the control plane
3. a task and task run are created
4. a raw runtime event is appended to a session file
5. the probe bridge batches and forwards that event
6. the control plane correlates it back to the active task run
7. an approval is created and then resolved
8. the task finishes without losing runtime identity

## Quick Start

Prerequisites:

- Node.js 20+
- Python 3 with `flask` and `requests`

Install once:

```bash
npm install
python3 -m pip install -r services/probe-bridge/requirements.txt
```

Run the joint demo:

```bash
npm run demo:joint
```

The script will:

- build the TypeScript workspace
- start the control plane on `127.0.0.1:3210`
- start the probe bridge on `127.0.0.1:3211`
- seed a local runtime session manifest under a temporary demo directory
- wait for probe heartbeat
- create a task and task run
- append an assistant event to the session file
- wait for approval creation
- resolve the approval
- show the final task state and log file paths

## Terminal Recording

Generate a terminal recording plus a plain-text transcript:

```bash
npm run demo:record
```

That command writes:

- `docs/assets/gohan-control-plane-probe-bridge-demo.typescript`
- `docs/assets/gohan-control-plane-probe-bridge-demo.txt`

The checked-in transcript is meant to make the first-run story easy to skim on GitHub without replay tooling.

## Demo Shape

The joint demo intentionally keeps the runtime simple:

- one probe
- one seeded runtime agent
- one session file
- one task run
- one assistant completion event
- one approval gate

That is enough to show the control-plane boundary clearly without pretending the repo is already a full production runtime.

## Fallback Single-Process Demo

If you only want the smaller control-plane-only walkthrough:

```bash
npm run demo:control-plane
```

That path skips the probe bridge and directly posts runtime events to the control plane.
