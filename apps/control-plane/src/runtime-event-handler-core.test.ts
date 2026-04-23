import assert from "node:assert/strict"
import test from "node:test"

import { planControlPlaneRuntimeEvent } from "./runtime-event-handler-core.js"

test("approval request event enters waiting_approval and emits approval signal", () => {
  const plan = planControlPlaneRuntimeEvent({
    task: {
      id: "task-1",
      title: "Task 1",
      agentId: "agent-1",
      requireApproval: false,
      workflowState: "RUNNING",
      createdAt: "2026-04-22T09:59:00.000Z",
      updatedAt: "2026-04-22T09:59:00.000Z",
      startedAt: "2026-04-22T10:00:00.000Z",
    },
    event: {
      eventType: "assistant",
      eventAt: "2026-04-22T10:00:05.000Z",
      content: "[APPROVAL_REQUEST] Review this | Approve the final answer",
    },
  })

  assert.deepEqual(plan.actions[0], {
    kind: "persist_task_result",
    taskId: "task-1",
    result: "[APPROVAL_REQUEST] Review this | Approve the final answer",
    eventAt: "2026-04-22T10:00:05.000Z",
  })
  assert.deepEqual(plan.actions[2], {
    kind: "create_approval_record",
    taskId: "task-1",
    approvalType: "approval",
    title: "Review this",
    resolutionAction: "resume_run",
    description: "Approve the final answer",
    targetRunStatus: "waiting_approval",
  })
})

test("completion event completes task and unlocks agent when approval is not required", () => {
  const plan = planControlPlaneRuntimeEvent({
    task: {
      id: "task-2",
      agentId: "agent-2",
      title: "Task 2",
      workflowState: "RUNNING",
      requireApproval: false,
      createdAt: "2026-04-22T09:59:00.000Z",
      updatedAt: "2026-04-22T09:59:00.000Z",
      startedAt: "2026-04-22T10:00:00.000Z",
    },
    event: {
      eventType: "assistant",
      eventAt: "2026-04-22T10:00:05.000Z",
      content: "All done\n[TASK_COMPLETE]",
    },
  })

  assert.equal(plan.actions.some((action) => action.kind === "mark_task_completed"), true)
  assert.equal(plan.actions.some((action) => action.kind === "unlock_agent_session"), true)
  assert.equal(
    plan.actions.some(
      (action) => action.kind === "emit_signal" && action.signal === "task:completed",
    ),
    true,
  )
})

test("completion event creates an approval gate when task requires approval", () => {
  const plan = planControlPlaneRuntimeEvent({
    task: {
      id: "task-3",
      agentId: "agent-3",
      title: "Analyze campaign",
      workflowState: "RUNNING",
      createdAt: "2026-04-22T09:59:00.000Z",
      updatedAt: "2026-04-22T09:59:00.000Z",
      startedAt: "2026-04-22T10:00:00.000Z",
      requireApproval: true,
    },
    event: {
      eventType: "assistant",
      eventAt: "2026-04-22T10:00:05.000Z",
      content: "Recommendation ready\n[TASK_COMPLETE]",
    },
  })

  assert.equal(plan.actions.some((action) => action.kind === "mark_task_completed"), false)
  assert.deepEqual(plan.actions.at(-2), {
    kind: "create_approval_record",
    taskId: "task-3",
    approvalType: "approval",
    title: "Confirm completion: Analyze campaign",
    resolutionAction: "complete_task",
    description: "Recommendation ready\n[TASK_COMPLETE]",
    targetRunStatus: "waiting_approval",
  })
})

test("resume control user message only refreshes last activity", () => {
  const plan = planControlPlaneRuntimeEvent({
    task: {
      id: "task-4",
      title: "Task 4",
      agentId: "agent-4",
      workflowState: "WAITING_INPUT",
      requireApproval: false,
      createdAt: "2026-04-22T09:59:00.000Z",
      updatedAt: "2026-04-22T09:59:00.000Z",
      lastActivityAt: "2026-04-22T10:00:00.000Z",
    },
    event: {
      eventType: "user",
      eventAt: "2026-04-22T10:01:00.000Z",
      content: "[HUMAN_INPUT_RESULT] Use the Hangzhou account",
    },
  })

  assert.deepEqual(plan.actions, [
    {
      kind: "set_last_activity",
      taskId: "task-4",
      eventAt: "2026-04-22T10:01:00.000Z",
    },
  ])
})
