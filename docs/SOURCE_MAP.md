# Source Map

This file tracks likely source locations in the internal Goku codebase that map into the first public Gohan extraction.

## Packages

### `packages/contracts`

Expected responsibility:

- runtime event types
- dispatch result types
- task and task-run status enums
- approval-state payloads
- browser task payload contracts

Likely internal sources:

- `goku-alpha/prisma/schema.prisma`
- `goku-alpha/src/services/task/task-runtime-mapping.ts`
- `goku-alpha/src/services/task/session-metadata.ts`
- `goku-alpha/src/services/probe/heartbeat.ts`

### `packages/core`

Expected responsibility:

- runtime metadata merge helpers
- dispatch-result normalization
- session/runtime assertion helpers
- runtime health computation

Likely internal sources:

- `goku-alpha/src/services/task/task-runtime-mapping.ts`
- `goku-alpha/src/services/task/session-metadata.ts`
- `goku-alpha/src/services/task/task-runtime-flow-link.ts`
- `goku-alpha/src/services/probe/heartbeat.ts`

## Services

### `services/probe-bridge`

Expected responsibility:

- watch runtime sessions
- batch and forward raw events
- heartbeat loop
- message injection

Likely internal sources:

- `probe-service/probe.py`
- `probe-service/openclaw.py`
- `probe-service/README.md`

### `services/browser-worker`

Expected responsibility:

- consume browser tasks
- create isolated runtime sessions
- return structured browser-task results
- keep the execution loop thin and task-type driven

Likely internal sources:

- `browser-task-service/worker.py`
- `browser-task-service/supervisor.py`
- `browser-task-service/helpers/*`
- `browser-task-service/README.md`

## App

### `apps/control-plane`

Expected responsibility:

- task creation and scheduling
- task-run state transitions
- approval APIs
- runtime-event ingestion
- online-state derivation

Likely internal sources:

- `goku-alpha/src/services/task/index.ts`
- `goku-alpha/src/services/task/task-dispatcher.ts`
- `goku-alpha/src/services/task/task-event-handler.ts`
- `goku-alpha/src/services/task/scheduled-task-scheduler.ts`
- `goku-alpha/src/services/task/recurring-task-scheduler.ts`
- `goku-alpha/src/services/probe/heartbeat.ts`

## Notes

- not every internal module should be copied as-is
- pure functions and narrow contracts should move first
- product-specific naming should be normalized during extraction
- current public extraction already includes a mock browser-worker loop and a public runtime protocol baseline
