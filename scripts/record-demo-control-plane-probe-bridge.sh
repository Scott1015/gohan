#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_BASE="${1:-${ROOT_DIR}/docs/assets/gohan-control-plane-probe-bridge-demo}"
OUTPUT_DIR="$(dirname "${OUTPUT_BASE}")"
TYPE_SCRIPT_FILE="${OUTPUT_BASE}.typescript"
TEXT_FILE="${OUTPUT_BASE}.txt"

mkdir -p "${OUTPUT_DIR}"
rm -f "${TYPE_SCRIPT_FILE}" "${TEXT_FILE}"

script -q "${TYPE_SCRIPT_FILE}" \
  env \
    DEMO_DIR=/tmp/gohan-demo-recording \
    CONTROL_PORT=3210 \
    PROBE_PORT=3211 \
    bash "${ROOT_DIR}/scripts/demo-control-plane-probe-bridge.sh"

python3 - "${TYPE_SCRIPT_FILE}" "${TEXT_FILE}" <<'PY'
from pathlib import Path
import re
import sys

source = Path(sys.argv[1]).read_text(encoding="utf-8", errors="ignore")
text = source.replace("\r", "")
text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
text = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", "", text)
text = re.sub(r"^\^D", "", text)
Path(sys.argv[2]).write_text(text, encoding="utf-8")
PY

echo "Recorded terminal session:"
echo "  ${TYPE_SCRIPT_FILE}"
echo "Plain-text transcript:"
echo "  ${TEXT_FILE}"
