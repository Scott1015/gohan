# Architecture

Gohan is organized around a simple boundary:

- the control plane owns task state, scheduling, approvals, and runtime identity
- the execution plane owns actual work execution and raw event production

The system is intentionally designed so remote runtimes can be bridged into one control plane without collapsing everything into a single process.

## High-Level Topology

```text
                        +-----------------------------+
                        |     Control Plane App       |
                        |-----------------------------|
                        | task API                    |
                        | scheduler                   |
                        | task runs                   |
                        | approvals                   |
                        | runtime event ingestion     |
                        | online-state computation    |
                        +--------------+--------------+
                                       |
                        +--------------+--------------+
                        |       Shared Contracts      |
                        |-----------------------------|
                        | task dispatch payloads      |
                        | runtime identifiers         |
                        | runtime events              |
                        | browser task result schema  |
                        +--------------+--------------+
                                       |
                    +------------------+------------------+
                    |                                     |
          +---------v---------+                 +---------v---------+
          |   Probe Bridge    |                 |  Browser Worker   |
          |-------------------|                 |-------------------|
          | session tracking  |                 | isolated sessions |
          | event forwarding  |                 | browser execution |
          | message injection |                 | structured result |
          +---------+---------+                 +---------+---------+
                    |                                     |
                    v                                     v
             remote agent runtime                  browser runtime
```

## Core Concepts

### Task

The user-facing unit of work.

### TaskRun

The concrete execution attempt for a task. This is where runtime identity should live:

- session key
- runtime run id
- runtime task id
- runtime flow id

### Approval

A runtime gate where execution pauses for a human decision or extra input.

### RuntimeEvent

The normalized event format that allows the control plane to correlate execution back to tasks and task runs.

### Probe Bridge

A lightweight sidecar or bridge that watches an execution environment, forwards raw events, and injects messages back into the active runtime when needed.

### Browser Worker

A dedicated execution path for browser-bound workloads that should not pollute long-lived conversational state.

## Extraction Principles

- keep control plane and execution plane separate
- extract contracts before extracting implementation details
- prefer narrow seams and explicit payloads
- do not leak internal product terminology into the public model unless it is genuinely useful

## First Extraction Boundary

The first useful public boundary is:

- `packages/contracts`: shared runtime payload and event types
- `packages/core`: pure runtime helpers
- `services/probe-bridge`: extracted probe process
- `services/browser-worker`: extracted browser task worker
- `apps/control-plane`: thin control-plane app that speaks those contracts

The repo is not trying to ship every surrounding platform concern in the first cut.
