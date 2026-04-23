#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3100}"
BASE_URL="http://127.0.0.1:${PORT}"
SERVER_PID=""
STARTED_SERVER=0

cleanup() {
  if [[ "${STARTED_SERVER}" == "1" && -n "${SERVER_PID}" ]]; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

wait_for_health() {
  local attempts=0
  until curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [[ "${attempts}" -ge 50 ]]; then
      echo "Timed out waiting for ${BASE_URL}/health" >&2
      return 1
    fi
    sleep 0.2
  done
}

json_field() {
  local payload="$1"
  local expr="$2"
  python3 -c 'import json,sys; data=json.loads(sys.argv[1]); print(eval(sys.argv[2], {"__builtins__": {}}, {"data": data}))' "$payload" "$expr"
}

echo "==> Building workspace"
cd "${ROOT_DIR}"
npm run build >/dev/null

if curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
  echo "==> Reusing existing control-plane at ${BASE_URL}"
else
  echo "==> Starting control-plane at ${BASE_URL}"
  PORT="${PORT}" node apps/control-plane/dist/server.js >/tmp/gohan-control-plane-demo.log 2>&1 &
  SERVER_PID="$!"
  STARTED_SERVER=1
  wait_for_health
fi

echo "==> Creating task"
task_payload="$(curl -fsS "${BASE_URL}/tasks" \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Publish weekly report",
    "agentId": "agent-demo-1",
    "requireApproval": true
  }')"
task_id="$(json_field "${task_payload}" 'data["task"]["id"]')"
echo "task_id=${task_id}"

echo "==> Starting task run"
curl -fsS "${BASE_URL}/tasks/${task_id}/runs" \
  -H 'Content-Type: application/json' \
  -d '{
    "runtimeRunId": "run-demo-1",
    "messageId": "session-demo-1"
  }' >/dev/null

echo "==> Sending runtime event"
event_payload="$(curl -fsS "${BASE_URL}/runtime-events" \
  -H 'Content-Type: application/json' \
  -d '{
    "probeId": "probe-demo-1",
    "sessionId": "session-demo-1",
    "agentId": "agent-demo-1",
    "runtimeRunId": "run-demo-1",
    "eventType": "assistant",
    "content": "Weekly report is ready\n[TASK_COMPLETE]",
    "eventAt": "2026-04-23T10:05:00.000Z"
  }')"
echo "runtime_event_result=$(json_field "${event_payload}" 'data["result"]["handled"]')"

echo "==> Fetching approval"
approvals_payload="$(curl -fsS "${BASE_URL}/approvals")"
approval_id="$(json_field "${approvals_payload}" 'data["approvals"][0]["id"]')"
echo "approval_id=${approval_id}"

echo "==> Resolving approval"
curl -fsS "${BASE_URL}/approvals/${approval_id}/resolve" \
  -H 'Content-Type: application/json' \
  -d '{
    "status": "approved",
    "response": "Publish it"
  }' >/dev/null

echo "==> Reading final task state"
final_payload="$(curl -fsS "${BASE_URL}/tasks/${task_id}")"
workflow_state="$(json_field "${final_payload}" 'data["task"]["workflowState"]')"
result_text="$(json_field "${final_payload}" 'data["task"]["result"]')"
echo "workflow_state=${workflow_state}"
echo "task_result=${result_text}"

echo
echo "Demo completed successfully."
