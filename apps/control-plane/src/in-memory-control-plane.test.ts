import assert from "node:assert/strict"
import test from "node:test"

import { InMemoryControlPlaneService } from "./in-memory-control-plane.js"

test("control-plane service creates task and starts task run", () => {
  const service = new InMemoryControlPlaneService()
  const task = service.createTask({
    title: "Analyze campaign",
    agentId: "agent-1",
    requireApproval: true,
  })
  const run = service.startTaskRun(task.id, {
    runtimeRunId: "run-1",
    runtimeTaskId: "runtime-task-1",
    messageId: "session-1",
  })

  assert.equal(task.workflowState, "PENDING")
  assert.equal(run.status, "running")
  assert.equal(service.getTask(task.id)?.workflowState, "RUNNING")
})

test("runtime event ingestion creates approval and keeps task waiting", async () => {
  const service = new InMemoryControlPlaneService()
  const task = service.createTask({
    title: "Review answer",
    agentId: "agent-1",
  })
  service.startTaskRun(task.id, {
    runtimeRunId: "run-1",
    messageId: "session-1",
  })

  const result = await service.ingestRuntimeEvent({
    probeId: "probe-1",
    sessionId: "session-1",
    agentId: "agent-1",
    runtimeRunId: "run-1",
    eventType: "assistant",
    content: "[APPROVAL_REQUEST] Review this | Approve final text",
    eventAt: "2026-04-22T10:00:05.000Z",
  })

  assert.equal(result.handled, true)
  assert.equal(service.listApprovals().length, 1)
  assert.equal(service.getTask(task.id)?.workflowState, "WAITING_APPROVAL")
})

test("approval resolution resumes runtime for normal approval gates", async () => {
  const service = new InMemoryControlPlaneService()
  const task = service.createTask({
    title: "Review answer",
    agentId: "agent-1",
  })
  service.startTaskRun(task.id, {
    runtimeRunId: "run-1",
    messageId: "session-1",
  })
  await service.ingestRuntimeEvent({
    probeId: "probe-1",
    sessionId: "session-1",
    agentId: "agent-1",
    runtimeRunId: "run-1",
    eventType: "assistant",
    content: "[APPROVAL_REQUEST] Review this | Approve final text",
    eventAt: "2026-04-22T10:00:05.000Z",
  })

  const approval = service.listApprovals()[0]
  service.resolveApproval(approval.id, {
    status: "approved",
    response: "Looks good",
  })

  assert.equal(service.getTask(task.id)?.workflowState, "RUNNING")
  assert.equal(
    service.store.signals.some((signal) => signal.signal === "task:resume-requested"),
    true,
  )
})

test("completion approval resolves task to completed", async () => {
  const service = new InMemoryControlPlaneService()
  const task = service.createTask({
    title: "Analyze campaign",
    agentId: "agent-1",
    requireApproval: true,
  })
  service.startTaskRun(task.id, {
    runtimeRunId: "run-1",
    messageId: "session-1",
  })

  await service.ingestRuntimeEvent({
    probeId: "probe-1",
    sessionId: "session-1",
    agentId: "agent-1",
    runtimeRunId: "run-1",
    eventType: "assistant",
    content: "Recommendation ready\n[TASK_COMPLETE]",
    eventAt: "2026-04-22T10:00:05.000Z",
  })

  const approval = service.listApprovals()[0]
  assert.equal(approval.resolutionAction, "complete_task")

  service.resolveApproval(approval.id, {
    status: "approved",
    response: "Ship it",
  })

  assert.equal(service.getTask(task.id)?.workflowState, "COMPLETED")
  assert.equal(
    service.store.signals.some((signal) => signal.signal === "task:completed"),
    true,
  )
})
