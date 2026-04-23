import assert from "node:assert/strict"
import test from "node:test"

import { planRuntimeEvent } from "./runtime-event-plan.js"

test("assistant events after task start update result and complete task", () => {
  const plan = planRuntimeEvent({
    eventType: "assistant",
    content: "Done.\n[TASK_COMPLETE]",
    eventAt: "2026-04-22T10:00:05.000Z",
    taskStartedAt: "2026-04-22T10:00:00.000Z",
  })

  assert.deepEqual(plan.actions, [
    {
      kind: "update_task_result",
      result: "Done.\n[TASK_COMPLETE]",
      eventAt: "2026-04-22T10:00:05.000Z",
    },
    {
      kind: "refresh_last_activity",
      eventAt: "2026-04-22T10:00:05.000Z",
    },
    {
      kind: "complete_task",
    },
  ])
})

test("assistant approval request plans waiting actions without direct completion", () => {
  const plan = planRuntimeEvent({
    eventType: "assistant",
    content: "[APPROVAL_REQUEST] Confirm plan | Need sign-off\n[TASK_COMPLETE]",
    eventAt: "2026-04-22T10:00:05.000Z",
    taskStartedAt: "2026-04-22T10:00:00.000Z",
  })

  assert.equal(plan.actions.some((action) => action.kind === "complete_task"), false)
  assert.deepEqual(plan.actions[2], {
    kind: "request_approval",
    title: "Confirm plan",
    description: "Need sign-off",
  })
})

test("user resume message only refreshes last activity", () => {
  const plan = planRuntimeEvent({
    eventType: "user",
    content: "[HUMAN_INPUT_RESULT] Use the Shanghai store",
    eventAt: "2026-04-22T10:01:00.000Z",
    lastActivityAt: "2026-04-22T09:59:00.000Z",
  })

  assert.deepEqual(plan.actions, [
    {
      kind: "refresh_last_activity",
      eventAt: "2026-04-22T10:01:00.000Z",
    },
  ])
})
