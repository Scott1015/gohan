import assert from "node:assert/strict"
import test from "node:test"

import {
  parseProbeRawEvent,
  parseProbeRawEventBatch,
} from "./probe-runtime-events.js"

test("parseProbeRawEvent converts assistant message into runtime envelope", () => {
  const event = parseProbeRawEvent({
    probeId: "probe-1",
    defaultSessionId: "session-1",
    defaultAgentId: "agent-1",
    rawLine: JSON.stringify({
      id: "evt-1",
      type: "message",
      timestamp: "2026-04-23T08:00:00.000Z",
      runId: "run-1",
      taskId: "runtime-task-1",
      flowId: "flow-1",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Recommendation ready\n[TASK_COMPLETE]",
          },
        ],
      },
    }),
  })

  assert.deepEqual(event, {
    probeId: "probe-1",
    sessionId: "session-1",
    agentId: "agent-1",
    runtimeRunId: "run-1",
    runtimeTaskId: "runtime-task-1",
    runtimeFlowId: "flow-1",
    eventType: "assistant",
    content: "Recommendation ready\n[TASK_COMPLETE]",
    eventAt: "2026-04-23T08:00:00.000Z",
  })
})

test("parseProbeRawEventBatch derives session id from session file and skips unsupported events", () => {
  const events = parseProbeRawEventBatch({
    probeId: "probe-1",
    sessionFile: "/tmp/sessions/session-7.jsonl",
    agentId: "agent-7",
    timestamp: "2026-04-23T08:01:00.000Z",
    rawDataList: [
      JSON.stringify({
        type: "message",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: "[APPROVAL_RESULT] approved | proceed",
            },
          ],
        },
      }),
      JSON.stringify({
        type: "custom",
        data: { ignored: true },
      }),
    ],
  })

  assert.equal(events.length, 1)
  assert.deepEqual(events[0], {
    probeId: "probe-1",
    sessionId: "session-7",
    agentId: "agent-7",
    runtimeRunId: undefined,
    runtimeTaskId: undefined,
    runtimeFlowId: undefined,
    eventType: "user",
    content: "[APPROVAL_RESULT] approved | proceed",
    eventAt: "2026-04-23T08:01:00.000Z",
  })
})
