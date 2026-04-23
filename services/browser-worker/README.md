# Browser Worker

Isolated execution worker for browser-bound tasks.

This service should stay separate from long-lived agent chat/runtime sessions.
Its job is not “run the whole agent in a browser”. Its job is narrower:

- consuming browser tasks from the control plane
- creating isolated execution sessions per browser task
- running browser automation through a constrained runtime
- sending structured results back to the control plane

## Why It Exists

Browser work has different operational constraints from conversational runtimes:

- stronger isolation needs
- more artifact output
- different timeout/retry behavior
- easier contamination of long-lived session state

The browser worker is therefore a dedicated execution path, not an afterthought inside the main runtime loop.

## Planned Public Contract

The first public contract lives in `@gohan/contracts`:

- `BrowserTaskExecutionRequest`
- `BrowserTaskExecutionResult`
- `BrowserWorkerArtifact`
- `BrowserWorkerLogEntry`

Those types are intentionally small. They are meant to stabilize the worker boundary before the full implementation is extracted.

## Expected Flow

1. the control plane creates a `BrowserTask`
2. the worker pulls or receives the execution request
3. the worker runs the browser job in isolation
4. the worker reports a structured result with logs and optional artifacts
5. the control plane correlates the result back to the parent task

## Initial Non-Goals

The first open source cut does not need to include all of these on day one:

- distributed scheduling
- advanced retry policy
- artifact storage backend abstraction
- every internal browser automation adapter

The public value is the worker boundary and result contract first.

## Current Extraction Status

This directory now includes a minimal mock worker loop:

- claim one browser task from a source port
- dispatch it to a task-type handler
- report a structured result to a sink port
- fail cleanly when a task type has no registered handler

The first implementation is intentionally small. It is a contract-stabilizing worker, not the final browser runtime.

Key files:

- `src/worker.ts`: minimal source -> handler -> sink worker loop
- `src/worker.test.ts`: mock worker behavior tests
