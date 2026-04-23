#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STRICT="${STRICT:-0}"

run_step() {
  local label="$1"
  shift
  echo "==> ${label}"
  "$@"
}

run_step "TypeScript typecheck" npm --prefix "${ROOT_DIR}" run typecheck
run_step "TypeScript tests" npm --prefix "${ROOT_DIR}" test
run_step "Control-plane demo" "${ROOT_DIR}/scripts/demo-control-plane.sh"

PROBE_DIR="${ROOT_DIR}/services/probe-bridge"
if [[ -x "${PROBE_DIR}/.venv/bin/python" ]]; then
  (
    cd "${PROBE_DIR}"
    run_step "Probe bridge tests" ./.venv/bin/python -m unittest -v test_app.py
  )
else
  echo "==> Probe bridge tests skipped: ${PROBE_DIR}/.venv/bin/python not found"
  if [[ "${STRICT}" == "1" ]]; then
    echo "STRICT=1 requires the local probe-bridge virtualenv to exist" >&2
    exit 1
  fi
fi

echo
echo "Release check completed."
