# First Release Checklist

This is the practical checklist for turning the current extraction into a first public release.

## Repository Hygiene

- choose and add a license
- add a short `SECURITY.md` or explicit security contact
- verify there are no internal URLs, credentials, or private hostnames left in docs or code
- scrub internal-only terminology that should not become part of the public model

## Product Boundary

- confirm the first public promise is `runtime control plane`, not `full agent platform`
- confirm which routes are public and which are still compatibility-only
- decide whether `runtime-events/batch` stays OpenClaw-shaped or gets a more generic raw-ingest envelope later
- decide whether runtime agent registration is manual, file-backed, or control-plane managed in v0.1

## Developer Experience

- keep `README.md` focused on positioning and first run
- keep `docs/LOCAL_DEMO.md` runnable on a clean machine
- keep `docs/RUNTIME_PROTOCOL.md` in sync with actual routes and contracts
- add one copy-paste example that shows control-plane plus probe-bridge together

## Code Health

- keep `npm run typecheck` green
- keep `npm test` green
- keep `services/probe-bridge/.venv/bin/python -m unittest -v test_app.py` green
- avoid dragging internal deployment or SaaS-only modules into the public repo

## Suggested v0.1 Scope

- `packages/contracts`
- `packages/core`
- `apps/control-plane`
- `services/probe-bridge`
- `services/browser-worker`
- `docs/LOCAL_DEMO.md`
- `docs/RUNTIME_PROTOCOL.md`

## Explicitly Delay

- billing
- multi-tenant admin UX
- cloud deployment glue
- internal operator scripts
- broad agent CRUD or team management surface
