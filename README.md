# Gohan

Kubernetes-inspired control plane for long-running agents.

Gohan is an early-stage open source extraction from the Goku project. It is focused on a narrow problem:

**how to run agents and browser workers like managed workloads instead of fragile chat sessions.**

Most agent tooling is strong at one of these layers:

- agent building: frameworks, SDKs, prompt graphs
- agent observability: traces, evals, replay
- agent execution tools: browser control, tool calling

Gohan focuses on the missing control-plane layer between them:

- schedule and dispatch work
- track runtime sessions and task runs
- correlate execution events back to platform tasks
- pause for approvals or human input
- bridge remote runtimes through lightweight probes
- route browser jobs to dedicated workers

## Positioning

Gohan is not trying to be:

- another agent SDK
- another workflow builder
- another chat UI
- another tracing-only product

Gohan is trying to be:

- a self-hosted runtime control plane for long-running agents
- a place to manage task lifecycle, runtime identity, and execution state
- a thin coordination layer between platform APIs and remote execution environments

## Why This Exists

Teams can build agents quickly today. What still breaks in production is runtime management:

- Which task is running where?
- Which session or runtime flow does this event belong to?
- Is the agent alive, busy, blocked on approval, or actually dead?
- How do browser jobs run without polluting long-lived chat state?
- How do remote workers report back into one control plane?

Gohan is being shaped around these runtime problems first.

## Core Primitives

The open source cut is expected to center on a small set of primitives:

- `AgentRuntime`: a managed execution target
- `Task`: the user-facing unit of work
- `TaskRun`: the concrete execution attempt for a task
- `Approval`: a human approval or input gate
- `RuntimeEvent`: normalized execution events from probes or workers
- `BrowserTask`: a dedicated browser workload routed to a specialized worker
- `BrowserTaskExecutionResult`: structured browser output returned to the control plane

These names may still change as the extraction stabilizes.

## Architecture

```text
                 +---------------------------+
                 |      Gohan Control Plane  |
                 |---------------------------|
                 | API / scheduler / state   |
                 | task runs / approvals     |
                 | runtime event correlation |
                 +-------------+-------------+
                               |
               +---------------+----------------+
               |                                |
     +---------v---------+            +---------v---------+
     |   Probe Bridge    |            | Browser Worker    |
     |-------------------|            |-------------------|
     | session tracking  |            | isolated runs     |
     | event forwarding  |            | structured output |
     | message injection |            | browser-specific  |
     +---------+---------+            +---------+---------+
               |                                |
               v                                v
        remote agent runtime              browser runtime
```

## Initial Scope

The first open source milestone is intentionally narrow:

- runtime event ingestion
- task and task-run state transitions
- approval and human-input waiting states
- probe heartbeat and online-state computation
- browser task bridging contract

The first milestone is intentionally not focused on:

- billing
- multi-tenant product packaging
- polished team-management UX
- every internal Goku feature

## Current Status

This repository is being created before the extraction is complete.

Expect:

- incomplete modules
- changing interfaces
- rough edges in naming
- docs that stabilize before code does

## Extraction Strategy

The source project has more product surface than should be open sourced in the first cut. The extraction strategy is:

1. keep the runtime control-plane core
2. remove unrelated SaaS shell concerns
3. preserve clean seams between control plane and execution plane
4. publish a narrow but coherent system before expanding scope

See [docs/EXTRACTION_PLAN.md](docs/EXTRACTION_PLAN.md).
The current execution/control-plane handshake is documented in [docs/RUNTIME_PROTOCOL.md](docs/RUNTIME_PROTOCOL.md).
Release-prep work is tracked in [docs/FIRST_RELEASE_CHECKLIST.md](docs/FIRST_RELEASE_CHECKLIST.md).
Contributor workflow is documented in [CONTRIBUTING.md](CONTRIBUTING.md).
License tradeoffs are summarized in [docs/LICENSE_OPTIONS.md](docs/LICENSE_OPTIONS.md).
Basic GitHub Actions CI is defined in [.github/workflows/ci.yml](.github/workflows/ci.yml).
Issue and PR hygiene is preconfigured under [.github](.github).
The recommended first publish flow is documented in [docs/PUBLISH_SEQUENCE.md](docs/PUBLISH_SEQUENCE.md).

## Roadmap

- define stable core runtime data model
- extract probe bridge with a minimal protocol
- extract browser task worker contract
- publish local development workflow
- add a minimal demo showing task dispatch, waiting approval, and completion

## Repo Layout

This repo is structured as a small workspace so the runtime core can be extracted in layers:

```text
gohan/
  apps/
    control-plane/
  services/
    probe-bridge/
    browser-worker/
  packages/
    contracts/
    core/
  docs/
    ARCHITECTURE.md
    EXTRACTION_PLAN.md
```

## Design Principles

- control plane and execution plane stay separate
- execution events are the source of runtime truth
- browser workloads are first-class, not hacked into chat loops
- human approval is a runtime state, not an afterthought
- keep the first open source version smaller than the internal system

## Name

Gohan is the open source runtime-focused extraction track from Goku.

## Development

The repo uses a minimal npm workspace layout.

Current first commands:

```bash
npm install
npm run typecheck
npm test
npm run demo
npm run check:release
node apps/control-plane/dist/server.js
./scripts/demo-control-plane.sh
```

The current in-memory control-plane demo is documented in [docs/LOCAL_DEMO.md](docs/LOCAL_DEMO.md).

The current extracted boundaries are:

- control-plane runtime core and in-memory HTTP demo
- probe bridge skeleton with public runtime protocol fallback
- browser worker public contract and minimal mock worker loop
