# Local Demo

This repository now has a minimal runnable control-plane skeleton. The fastest way to show the project value is to walk one task through:

1. create task
2. start run
3. ingest runtime event
4. create approval
5. resolve approval
6. see task complete

## Start

```bash
npm install
npm run build
node apps/control-plane/dist/server.js
```

Or run the scripted version:

```bash
./scripts/demo-control-plane.sh
```

Default port:

```text
http://localhost:3100
```

## 1. Create Task

```bash
curl -s http://localhost:3100/tasks \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Publish weekly report",
    "agentId": "agent-7",
    "requireApproval": true
  }'
```

Save the returned `task.id`.

## 2. Start Task Run

```bash
curl -s http://localhost:3100/tasks/<task-id>/runs \
  -H 'Content-Type: application/json' \
  -d '{
    "runtimeRunId": "run-7",
    "messageId": "session-7"
  }'
```

## 3. Ingest Runtime Event

This simulates a probe or worker reporting that the agent finished and is waiting on a completion approval.

```bash
curl -s http://localhost:3100/runtime-events \
  -H 'Content-Type: application/json' \
  -d '{
    "probeId": "probe-1",
    "sessionId": "session-7",
    "agentId": "agent-7",
    "runtimeRunId": "run-7",
    "eventType": "assistant",
    "content": "Weekly report is ready\n[TASK_COMPLETE]",
    "eventAt": "2026-04-22T10:05:00.000Z"
  }'
```

Expected result:

```text
handled=true
```

## 4. Inspect Approval

```bash
curl -s http://localhost:3100/approvals
```

You should see one approval with:

- `type=approval`
- `status=pending`
- `resolutionAction=complete_task`

## 5. Resolve Approval

Use the returned approval id:

```bash
curl -s http://localhost:3100/approvals/<approval-id>/resolve \
  -H 'Content-Type: application/json' \
  -d '{
    "status": "approved",
    "response": "Publish it"
  }'
```

## 6. Inspect Final Task State

```bash
curl -s http://localhost:3100/tasks/<task-id>
```

Expected state:

```text
workflowState=COMPLETED
```

## Why This Demo Matters

This is the first open source story Gohan needs to tell clearly:

- runtime event correlation is separate from the agent runtime itself
- approvals are runtime state transitions, not UI-only metadata
- completion can be gated without losing execution identity
- the control plane can coordinate remote runtimes through a thin event contract
