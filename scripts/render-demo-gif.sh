#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

resolve_python() {
  if [[ -n "${GIF_PYTHON_BIN:-}" ]]; then
    printf '%s\n' "${GIF_PYTHON_BIN}"
    return
  fi

  if [[ -x "${ROOT_DIR}/services/probe-bridge/.venv/bin/python" ]]; then
    printf '%s\n' "${ROOT_DIR}/services/probe-bridge/.venv/bin/python"
    return
  fi

  printf '%s\n' "python3"
}

ensure_pillow() {
  local python_bin="$1"
  if "${python_bin}" - <<'PY' >/dev/null 2>&1
import PIL
PY
  then
    return 0
  fi

  cat >&2 <<EOF
Missing Pillow for ${python_bin}.
Install it with:

  ${python_bin} -m pip install -r ${ROOT_DIR}/scripts/requirements-visuals.txt
EOF
  return 1
}

PYTHON_BIN="$(resolve_python)"
ensure_pillow "${PYTHON_BIN}"

"${PYTHON_BIN}" "${ROOT_DIR}/scripts/render-demo-gif.py"
