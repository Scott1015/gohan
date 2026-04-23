# Contributing

Gohan is still an early extraction. Contributions are most useful when they strengthen the runtime-control-plane story instead of widening product surface too early.

## Working Rules

- keep control plane and execution plane separate
- prefer narrow contracts over large internal module dumps
- do not add SaaS shell concerns to the first public cut
- keep browser workloads isolated from long-lived conversational runtime logic
- keep probe-side code transport-focused; parsing should stay on the control-plane side unless there is a strong reason to move it

## Local Verification

TypeScript workspace:

```bash
npm run typecheck
npm test
```

Probe bridge:

```bash
cd services/probe-bridge
./.venv/bin/python -m unittest -v test_app.py
```

End-to-end local demo:

```bash
./scripts/demo-control-plane.sh
```

## Change Shape

Good first contributions:

- shared contracts
- pure runtime helpers
- control-plane runtime state transitions
- probe/control-plane protocol cleanup
- browser-worker boundary improvements
- local demo and docs quality

Changes that should be treated carefully:

- broad admin UX
- billing or quota logic
- deployment-specific scripts
- large internal compatibility layers

## Pull Request Expectations

- keep changes scoped
- add or update tests when behavior changes
- update docs when public routes, contracts, or demos change
- explain tradeoffs when changing runtime state semantics
