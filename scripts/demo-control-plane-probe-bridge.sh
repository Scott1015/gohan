#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROL_PORT="${CONTROL_PORT:-3210}"
PROBE_PORT="${PROBE_PORT:-3211}"
CONTROL_PLANE_URL="http://127.0.0.1:${CONTROL_PORT}"
PROBE_URL="http://127.0.0.1:${PROBE_PORT}"
PROBE_ID="${PROBE_ID:-probe-demo-1}"
AGENT_ID="${AGENT_ID:-agent-demo-1}"
AGENT_SLUG="${AGENT_SLUG:-demo-agent}"
SESSION_ID="${SESSION_ID:-session-demo-1}"
RUNTIME_RUN_ID="${RUNTIME_RUN_ID:-run-demo-1}"
TASK_TITLE="${TASK_TITLE:-Publish weekly report}"
DEMO_DIR="${DEMO_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/gohan-joint-demo.XXXXXX")}"
RUNTIME_ROOT="${DEMO_DIR}/runtime"
SESSIONS_DIR="${RUNTIME_ROOT}/${AGENT_SLUG}/sessions"
SESSION_FILE="${SESSIONS_DIR}/${SESSION_ID}.jsonl"
CONTROL_PLANE_LOG="${DEMO_DIR}/control-plane.log"
PROBE_LOG="${DEMO_DIR}/probe-bridge.log"
CONTROL_PLANE_PID=""
PROBE_PID=""

cleanup() {
  if [[ -n "${PROBE_PID}" ]]; then
    kill "${PROBE_PID}" >/dev/null 2>&1 || true
    wait "${PROBE_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${CONTROL_PLANE_PID}" ]]; then
    kill "${CONTROL_PLANE_PID}" >/dev/null 2>&1 || true
    wait "${CONTROL_PLANE_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

require_command() {
  local name="$1"
  if ! command -v "${name}" >/dev/null 2>&1; then
    echo "Missing required command: ${name}" >&2
    exit 1
  fi
}

resolve_probe_python() {
  if [[ -n "${PROBE_PYTHON_BIN:-}" ]]; then
    printf '%s\n' "${PROBE_PYTHON_BIN}"
    return
  fi

  if [[ -x "${ROOT_DIR}/services/probe-bridge/.venv/bin/python" ]]; then
    printf '%s\n' "${ROOT_DIR}/services/probe-bridge/.venv/bin/python"
    return
  fi

  printf '%s\n' "python3"
}

json_field() {
  local payload="$1"
  local expr="$2"
  python3 - "$payload" "$expr" <<'PY'
import json
import sys

data = json.loads(sys.argv[1])
expr = sys.argv[2]

try:
    value = eval(expr, {"__builtins__": {}}, {"data": data})
except Exception:
    value = ""

if value is None:
    print("")
elif isinstance(value, bool):
    print("true" if value else "false")
else:
    print(value)
PY
}

wait_for_health() {
  local url="$1"
  local label="$2"
  local attempts=0
  until curl -fsS "${url}" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [[ "${attempts}" -ge 100 ]]; then
      echo "Timed out waiting for ${label}: ${url}" >&2
      return 1
    fi
    sleep 0.2
  done
}

wait_for_nonempty_field() {
  local url="$1"
  local expr="$2"
  local label="$3"
  local attempts=0

  while true; do
    local payload
    payload="$(curl -fsS "${url}" 2>/dev/null || true)"
    if [[ -n "${payload}" ]]; then
      local value
      value="$(json_field "${payload}" "${expr}")"
      if [[ -n "${value}" ]]; then
        printf '%s\n' "${value}"
        return 0
      fi
    fi

    attempts=$((attempts + 1))
    if [[ "${attempts}" -ge 100 ]]; then
      echo "Timed out waiting for ${label}" >&2
      return 1
    fi
    sleep 0.2
  done
}

wait_for_approval_id() {
  wait_for_nonempty_field \
    "${CONTROL_PLANE_URL}/approvals" \
    'data["approvals"][0]["id"] if data.get("approvals") else ""' \
    "approval record"
}

wait_for_task_state() {
  local task_id="$1"
  local expected_state="$2"
  local attempts=0

  while true; do
    local payload
    payload="$(curl -fsS "${CONTROL_PLANE_URL}/tasks/${task_id}" 2>/dev/null || true)"
    if [[ -n "${payload}" ]]; then
      local state
      state="$(json_field "${payload}" 'data["task"]["workflowState"]')"
      if [[ "${state}" == "${expected_state}" ]]; then
        return 0
      fi
    fi

    attempts=$((attempts + 1))
    if [[ "${attempts}" -ge 100 ]]; then
      echo "Timed out waiting for task ${task_id} to reach ${expected_state}" >&2
      return 1
    fi
    sleep 0.2
  done
}

ensure_probe_deps() {
  local python_bin="$1"
  if "${python_bin}" - <<'PY' >/dev/null 2>&1
import flask
import requests
PY
  then
    return 0
  fi

  cat >&2 <<EOF
Missing probe-bridge Python dependencies for ${python_bin}.
Install them with:

  python3 -m pip install -r services/probe-bridge/requirements.txt
EOF
  return 1
}

require_command curl
require_command npm
require_command node
require_command python3

PROBE_PYTHON="$(resolve_probe_python)"
ensure_probe_deps "${PROBE_PYTHON}"
NOW_AT="$(python3 - <<'PY'
from datetime import datetime, timezone

print(datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"))
PY
)"

mkdir -p "${SESSIONS_DIR}"
: > "${SESSION_FILE}"
cat > "${SESSIONS_DIR}/sessions.json" <<EOF
{
  "agent:${AGENT_SLUG}:main": {
    "sessionId": "${SESSION_ID}",
    "sessionFile": "${SESSION_FILE}",
    "updatedAt": "${NOW_AT}"
  }
}
EOF

echo "==> Demo workspace"
echo "demo_dir=${DEMO_DIR}"

echo "==> Building workspace"
cd "${ROOT_DIR}"
npm run build >/dev/null

echo "==> Starting control-plane at ${CONTROL_PLANE_URL}"
PORT="${CONTROL_PORT}" node apps/control-plane/dist/server.js >"${CONTROL_PLANE_LOG}" 2>&1 &
CONTROL_PLANE_PID="$!"
wait_for_health "${CONTROL_PLANE_URL}/health" "control-plane"

echo "==> Registering runtime agent"
curl -fsS "${CONTROL_PLANE_URL}/runtime/agents" \
  -H 'Content-Type: application/json' \
  -d "{
    \"agentId\": \"${AGENT_ID}\",
    \"slug\": \"${AGENT_SLUG}\",
    \"probeId\": \"${PROBE_ID}\",
    \"sessionsDir\": \"${SESSIONS_DIR}\"
  }" >/dev/null

echo "==> Starting probe-bridge at ${PROBE_URL}"
PYTHONUNBUFFERED=1 \
GOHAN_CONTROL_PLANE_URL="${CONTROL_PLANE_URL}" \
GOHAN_PROBE_AGENTS_JSON="[{\"agentId\":\"${AGENT_ID}\",\"slug\":\"${AGENT_SLUG}\",\"sessionsDir\":\"${SESSIONS_DIR}\"}]" \
GOHAN_HEARTBEAT_INTERVAL="${GOHAN_HEARTBEAT_INTERVAL:-0.6}" \
GOHAN_HEARTBEAT_LOOP_INTERVAL="${GOHAN_HEARTBEAT_LOOP_INTERVAL:-0.2}" \
GOHAN_SESSION_POLL_INTERVAL="${GOHAN_SESSION_POLL_INTERVAL:-0.2}" \
GOHAN_BATCH_INTERVAL="${GOHAN_BATCH_INTERVAL:-0.2}" \
GOHAN_INTERACTIVE_BATCH_INTERVAL="${GOHAN_INTERACTIVE_BATCH_INTERVAL:-0.1}" \
PROBE_ID="${PROBE_ID}" \
PROBE_PORT="${PROBE_PORT}" \
"${PROBE_PYTHON}" services/probe-bridge/app.py >"${PROBE_LOG}" 2>&1 &
PROBE_PID="$!"
wait_for_health "${PROBE_URL}/health" "probe-bridge"

echo "==> Waiting for probe to publish heartbeat"
last_heartbeat="$(wait_for_nonempty_field \
  "${CONTROL_PLANE_URL}/runtime/agents?probeId=${PROBE_ID}" \
  'data["agents"][0].get("lastHeartbeatAt") if data.get("agents") else ""' \
  "probe heartbeat")"
echo "last_heartbeat=${last_heartbeat}"

echo "==> Confirming probe session tracking"
resolved_session_id="$(wait_for_nonempty_field \
  "${PROBE_URL}/session?agentSlug=${AGENT_SLUG}" \
  'data.get("sessionId") or ""' \
  "probe session id")"
echo "probe_session_id=${resolved_session_id}"

echo "==> Creating task"
task_payload="$(curl -fsS "${CONTROL_PLANE_URL}/tasks" \
  -H 'Content-Type: application/json' \
  -d "{
    \"title\": \"${TASK_TITLE}\",
    \"agentId\": \"${AGENT_ID}\",
    \"requireApproval\": true
  }")"
task_id="$(json_field "${task_payload}" 'data["task"]["id"]')"
echo "task_id=${task_id}"

echo "==> Starting task run"
curl -fsS "${CONTROL_PLANE_URL}/tasks/${task_id}/runs" \
  -H 'Content-Type: application/json' \
  -d "{
    \"runtimeRunId\": \"${RUNTIME_RUN_ID}\",
    \"messageId\": \"${SESSION_ID}\"
  }" >/dev/null

echo "==> Appending runtime event to session file"
python3 - "${SESSION_FILE}" "${RUNTIME_RUN_ID}" <<'PY'
import json
import sys
from datetime import datetime, timezone

session_file = sys.argv[1]
runtime_run_id = sys.argv[2]
event = {
    "type": "message",
    "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    "runId": runtime_run_id,
    "message": {
        "role": "assistant",
        "content": [
            {
                "type": "text",
                "text": "Weekly report is ready\n[TASK_COMPLETE]",
            }
        ],
    },
}
with open(session_file, "a", encoding="utf-8") as handle:
    handle.write(json.dumps(event) + "\n")
PY

echo "==> Waiting for approval created from raw batch ingest"
approval_id="$(wait_for_approval_id)"
echo "approval_id=${approval_id}"

echo "==> Resolving approval"
curl -fsS "${CONTROL_PLANE_URL}/approvals/${approval_id}/resolve" \
  -H 'Content-Type: application/json' \
  -d '{
    "status": "approved",
    "response": "Publish it"
  }' >/dev/null

echo "==> Waiting for final task state"
wait_for_task_state "${task_id}" "COMPLETED"
final_payload="$(curl -fsS "${CONTROL_PLANE_URL}/tasks/${task_id}")"
workflow_state="$(json_field "${final_payload}" 'data["task"]["workflowState"]')"
result_text="$(json_field "${final_payload}" 'data["task"]["result"]')"
echo "workflow_state=${workflow_state}"
echo "task_result=${result_text}"

echo "==> Logs"
echo "control_plane_log=${CONTROL_PLANE_LOG}"
echo "probe_log=${PROBE_LOG}"

echo
echo "Joint demo completed successfully."
