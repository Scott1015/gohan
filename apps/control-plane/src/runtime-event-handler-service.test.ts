import assert from "node:assert/strict"
import test from "node:test"

import {
  ControlPlaneRuntimeEventHandlerService,
  type ControlPlaneRuntimeEventEnvelope,
} from "./runtime-event-handler-service.js"
import type {
  ControlPlaneRuntimePlan,
  ControlPlaneTaskRecord,
} from "./runtime-models.js"

class InMemoryResolver {
  constructor(private readonly task: ControlPlaneTaskRecord | null) {}

  async findActiveTaskForEvent(
    _event: ControlPlaneRuntimeEventEnvelope,
  ): Promise<ControlPlaneTaskRecord | null> {
    return this.task
  }
}

class CapturingExecutor {
  public executed: {
    task: ControlPlaneTaskRecord
    event: ControlPlaneRuntimeEventEnvelope
    plan: ControlPlaneRuntimePlan
  } | null = null

  async executeRuntimePlan(params: {
    task: ControlPlaneTaskRecord
    event: ControlPlaneRuntimeEventEnvelope
    plan: ControlPlaneRuntimePlan
  }): Promise<void> {
    this.executed = params
  }
}

test("runtime handler returns unhandled when no active task matches", async () => {
  const service = new ControlPlaneRuntimeEventHandlerService(
    new InMemoryResolver(null),
    new CapturingExecutor(),
  )

  const result = await service.handleEvent({
    probeId: "probe-1",
    sessionId: "session-1",
    eventType: "assistant",
    content: "Hello",
    eventAt: "2026-04-22T10:00:05.000Z",
  })

  assert.deepEqual(result, { handled: false })
})

test("runtime handler resolves task, executes plan, and refreshes heartbeat", async () => {
  const task: ControlPlaneTaskRecord = {
    id: "task-1",
    agentId: "agent-1",
    title: "Analyze campaign",
    workflowState: "RUNNING",
    requireApproval: false,
    createdAt: "2026-04-22T09:59:00.000Z",
    updatedAt: "2026-04-22T09:59:00.000Z",
    startedAt: "2026-04-22T10:00:00.000Z",
  }

  const resolver = new InMemoryResolver(task)
  const executor = new CapturingExecutor()
  const heartbeatCalls: Array<{ probeId: string; agentId: string; eventAt: string }> = []
  const service = new ControlPlaneRuntimeEventHandlerService(
    resolver,
    executor,
    {
      async refreshAgentHeartbeat(params) {
        heartbeatCalls.push(params)
      },
    },
  )

  const result = await service.handleEvent({
    probeId: "probe-1",
    sessionId: "session-1",
    agentId: "agent-1",
    eventType: "assistant",
    content: "Done\n[TASK_COMPLETE]",
    eventAt: "2026-04-22T10:00:05.000Z",
  })

  assert.equal(result.handled, true)
  assert.equal(result.taskId, "task-1")
  assert.ok((result.actionCount ?? 0) > 0)
  assert.equal(heartbeatCalls.length, 1)
  assert.equal(executor.executed?.task.id, "task-1")
  assert.equal(
    executor.executed?.plan.actions.some((action) => action.kind === "mark_task_completed"),
    true,
  )
})
