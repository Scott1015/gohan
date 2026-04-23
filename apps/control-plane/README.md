# Control Plane

This directory will hold the public control-plane app for Gohan.

Its first responsibilities are expected to be:

- task API
- task-run state transitions
- approval and human-input gates
- runtime-event ingestion
- online-state derivation from heartbeat plus session state

This should stay intentionally small and only contain the runtime-management core needed to make the open source story coherent.

## Extraction Direction

The current extraction path is:

- keep runtime parsing and state-transition planning in shared pure modules first
- move platform-side persistence and APIs only after those seams are stable

The next control-plane cut should likely center on:

- runtime-event ingestion handlers
- task-run state transitions
- approval and human-input records
- scheduled dispatch hooks

The shared runtime packages now already cover:

- workflow-state normalization
- control-marker parsing
- assistant/user event decision helpers
- high-level runtime event planning

The control-plane package now also includes:

- a pure runtime event handler core that maps runtime events to control-plane actions
- a service shell with injected resolver / executor / heartbeat ports
- an in-memory control-plane service for local development
- a minimal Node HTTP server skeleton for task, run, approval, and runtime-event routes
