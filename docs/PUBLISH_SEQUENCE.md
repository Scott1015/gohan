# Publish Sequence

This is the practical sequence for turning the local `gohan` repo into a hosted GitHub repository.

## Before Publishing

Recommended local checks:

```bash
npm run check:release
```

Current remaining manual decision:

- choose a license and add `LICENSE`

See [docs/LICENSE_OPTIONS.md](./LICENSE_OPTIONS.md).

## Suggested First Commit

From the repo root:

```bash
git add .
git commit -m "Initial open source extraction for Gohan"
```

## Create the GitHub Repository

Private first:

```bash
gh repo create Scott1015/gohan --private --source=. --remote=origin --push
```

Public directly:

```bash
gh repo create Scott1015/gohan --public --source=. --remote=origin --push
```

If the repository is already created remotely:

```bash
git remote add origin git@github.com:Scott1015/gohan.git
git push -u origin main
```

If the default branch is still `master`, adjust the final push command accordingly.

## After Publishing

- verify GitHub Actions CI starts
- verify `README.md` renders correctly
- verify `SECURITY.md`, `CONTRIBUTING.md`, and issue templates are visible
- open the first tracking issue for post-v0.1 extraction work

## Suggested First Tracking Issues

- choose and commit the final license
- replace the in-memory control-plane store with a persistent adapter
- add a real browser-worker execution backend behind the current mock loop
- run one control-plane plus probe-bridge cross-process demo
