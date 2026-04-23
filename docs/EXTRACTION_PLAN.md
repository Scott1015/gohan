# Extraction Plan

This document records the intended first open source cut from the internal Goku codebase.

## Goal

Publish a coherent runtime control-plane core, not a partial dump of the whole product.

## Current Status

Current repository status as of the latest extraction pass:

- done: shared runtime contracts and pure runtime helpers
- done: in-memory control-plane service and minimal HTTP server
- done: local end-to-end demo for task -> runtime event -> approval -> completion
- done: probe bridge extraction baseline in Python
- in progress: browser worker contract and minimal worker loop
- pending: probe-bridge/public control-plane protocol alignment
- pending: first cross-process demo that includes the extracted probe bridge

## Keep First

The first extraction should prioritize the parts that make the runtime story credible:

- task lifecycle models
- task-run and runtime identity mapping
- approval and human-input waiting flow
- runtime event ingestion and correlation
- probe heartbeat and online-state logic
- browser task bridge and worker contract

## Keep Later

These may be useful later, but they should not block the first public cut:

- richer admin UI
- deployment helpers
- asset and file subsystems beyond what runtime needs
- advanced workflow templates
- broader role and team-management surface

## Leave Out

Do not let the first public repo get diluted by unrelated product concerns:

- billing and quota logic
- internal operator scripts
- environment-specific deployment glue
- unrelated experiments
- legacy compatibility layers that are not required for the extracted runtime

## Proposed Module Boundaries

Control plane:

- task API
- task scheduler
- task event handler
- approval API
- runtime event store
- heartbeat state service

Execution plane:

- probe bridge
- browser worker

Shared contract:

- runtime event schema
- task dispatch schema
- browser task result schema

## Extraction Rules

- prefer clean interfaces over copying large internal modules
- rename internal product-specific terms when they leak unnecessary baggage
- keep data models understandable without the rest of Goku
- do not preserve internal complexity just because it already exists

## Suggested First Demo

A good first public demo should show one end-to-end flow:

1. create a task
2. dispatch it to a remote runtime through a probe
3. ingest execution events
4. enter waiting approval
5. resume after approval
6. complete the task

If this flow is clear, the project positioning will be clear.
