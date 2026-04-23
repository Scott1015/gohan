import { randomUUID } from "node:crypto"

import type {
  ControlPlaneApproval,
  ControlPlaneBrowserTask,
  ControlPlaneRuntimeEventRecord,
  ControlPlaneTask,
  ControlPlaneTaskRun,
  CreateTaskRequest,
  ProbeHeartbeatRequest,
  ResolveApprovalRequest,
  RuntimeAgentRegistration,
  RuntimeAgentState,
  StartTaskRunRequest,
} from "@gohan/contracts"

import {
  ControlPlaneRuntimeEventHandlerService,
  type ActiveTaskResolverPort,
  type ControlPlaneRuntimeEventEnvelope,
  type RuntimeActionExecutorPort,
  type RuntimeHeartbeatPort,
} from "./runtime-event-handler-service.js"
import type {
  ControlPlaneRuntimeAction,
  ControlPlaneRuntimePlan,
} from "./runtime-models.js"

export class InMemoryControlPlaneStore
  implements ActiveTaskResolverPort, RuntimeActionExecutorPort, RuntimeHeartbeatPort
{
  readonly tasks = new Map<string, ControlPlaneTask>()
  readonly taskRuns = new Map<string, ControlPlaneTaskRun>()
  readonly approvals = new Map<string, ControlPlaneApproval>()
  readonly browserTasks = new Map<string, ControlPlaneBrowserTask>()
  readonly runtimeEvents = new Map<string, ControlPlaneRuntimeEventRecord>()
  readonly signals: Array<{ signal: string; payload: Record<string, unknown> }> = []
  readonly agents = new Map<string, RuntimeAgentState>()

  createTask(input: CreateTaskRequest): ControlPlaneTask {
    const now = new Date().toISOString()
    const task: ControlPlaneTask = {
      id: input.taskId?.trim() || randomUUID(),
      title: input.title.trim(),
      agentId: input.agentId.trim(),
      workflowState: "PENDING",
      requireApproval: input.requireApproval === true,
      createdAt: now,
      updatedAt: now,
      activeRunId: null,
      result: null,
      startedAt: null,
      completedAt: null,
      lastActivityAt: null,
    }
    this.tasks.set(task.id, task)
    this.ensureAgent(task.agentId)
    return task
  }

  startTaskRun(taskId: string, input: StartTaskRunRequest): ControlPlaneTaskRun {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    const now = input.startedAt || new Date().toISOString()
    const run: ControlPlaneTaskRun = {
      id: input.runId?.trim() || randomUUID(),
      taskId,
      status: "running",
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      completedAt: null,
      messageId: input.messageId ?? null,
      sessionKey: input.sessionKey ?? null,
      runtimeRunId: input.runtimeRunId ?? null,
      runtimeTaskId: input.runtimeTaskId ?? null,
      runtimeFlowId: input.runtimeFlowId ?? null,
    }

    this.taskRuns.set(run.id, run)
    this.tasks.set(taskId, {
      ...task,
      workflowState: "RUNNING",
      startedAt: task.startedAt || now,
      updatedAt: now,
      activeRunId: run.id,
    })

    const currentAgent = this.ensureAgent(task.agentId)
    this.agents.set(task.agentId, {
      ...currentAgent,
      sessionState: "busy",
      currentTaskId: taskId,
    })

    return run
  }

  listTasks(): ControlPlaneTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  getTask(taskId: string): ControlPlaneTask | null {
    return this.tasks.get(taskId) ?? null
  }

  listApprovals(): ControlPlaneApproval[] {
    return Array.from(this.approvals.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  listBrowserTasks(): ControlPlaneBrowserTask[] {
    return Array.from(this.browserTasks.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  upsertRuntimeAgent(input: RuntimeAgentRegistration): RuntimeAgentState {
    const current = this.ensureAgent(input.agentId)
    const next: RuntimeAgentState = {
      ...current,
      agentId: input.agentId,
      slug: input.slug,
      probeId: input.probeId,
      sessionsDir: input.sessionsDir ?? null,
    }
    this.agents.set(input.agentId, next)
    return next
  }

  listRuntimeAgents(probeId?: string): RuntimeAgentState[] {
    return Array.from(this.agents.values())
      .filter((agent) => (probeId ? agent.probeId === probeId : true))
      .sort((a, b) => a.agentId.localeCompare(b.agentId))
  }

  private ensureAgent(agentId: string): RuntimeAgentState {
    const existing = this.agents.get(agentId)
    if (existing) return existing

    const initial: RuntimeAgentState = {
      agentId,
      slug: agentId,
      probeId: "unassigned",
      sessionState: "idle",
      currentTaskId: null,
    }
    this.agents.set(agentId, initial)
    return initial
  }

  private getActiveRunForTask(task: ControlPlaneTask): ControlPlaneTaskRun | null {
    if (!task.activeRunId) return null
    return this.taskRuns.get(task.activeRunId) ?? null
  }

  private updateTask(taskId: string, updater: (task: ControlPlaneTask) => ControlPlaneTask): ControlPlaneTask {
    const current = this.tasks.get(taskId)
    if (!current) {
      throw new Error(`Task ${taskId} not found`)
    }
    const next = updater(current)
    this.tasks.set(taskId, next)
    return next
  }

  private updateTaskRun(runId: string, updater: (run: ControlPlaneTaskRun) => ControlPlaneTaskRun): ControlPlaneTaskRun {
    const current = this.taskRuns.get(runId)
    if (!current) {
      throw new Error(`TaskRun ${runId} not found`)
    }
    const next = updater(current)
    this.taskRuns.set(runId, next)
    return next
  }

  async refreshAgentHeartbeat(params: {
    probeId: string
    agentId: string
    eventAt: string
  }): Promise<void> {
    const current = this.ensureAgent(params.agentId)
    this.agents.set(params.agentId, {
      ...current,
      probeId: current.probeId === "unassigned" ? params.probeId : current.probeId,
      lastHeartbeatAt: params.eventAt,
      lastProbeId: params.probeId,
    })
  }

  recordHeartbeat(input: ProbeHeartbeatRequest): void {
    for (const agent of input.agents) {
      const current = this.ensureAgent(agent.agentId)
      this.agents.set(agent.agentId, {
        ...current,
        probeId: input.probeId,
        slug: agent.agentSlug || current.slug,
        lastHeartbeatAt: input.timestamp,
        lastProbeId: input.probeId,
        sessionFile: agent.sessionFile ?? null,
        hasSession: agent.hasSession === true,
      })
    }
  }

  async findActiveTaskForEvent(
    event: ControlPlaneRuntimeEventEnvelope,
  ): Promise<ControlPlaneTask | null> {
    const activeStatuses = new Set(["running", "waiting_approval", "waiting_input"])

    const runs = Array.from(this.taskRuns.values()).filter((run) => activeStatuses.has(run.status))
    const matchedRun =
      runs.find((run) => event.runtimeRunId && run.runtimeRunId === event.runtimeRunId) ||
      runs.find((run) => event.runtimeTaskId && run.runtimeTaskId === event.runtimeTaskId) ||
      runs.find((run) => run.messageId && run.messageId === event.sessionId)

    if (!matchedRun) return null

    const task = this.tasks.get(matchedRun.taskId) ?? null
    if (!task) return null
    if (event.agentId && task.agentId !== event.agentId) return null

    return task
  }

  async executeRuntimePlan(params: {
    task: ControlPlaneTask
    event: ControlPlaneRuntimeEventEnvelope
    plan: ControlPlaneRuntimePlan
  }): Promise<void> {
    const taskRun = this.getActiveRunForTask(params.task)
    const runtimeEventId = randomUUID()
    const content =
      typeof params.event.content === "string" ? params.event.content : undefined

    this.runtimeEvents.set(runtimeEventId, {
      id: runtimeEventId,
      probeId: params.event.probeId,
      sessionId: params.event.sessionId,
      agentId: params.event.agentId,
      runtimeRunId: params.event.runtimeRunId,
      runtimeTaskId: params.event.runtimeTaskId,
      runtimeFlowId: params.event.runtimeFlowId,
      eventType: params.event.eventType,
      content,
      eventAt: params.event.eventAt,
      receivedAt: new Date().toISOString(),
      taskId: params.task.id,
      taskRunId: taskRun?.id ?? null,
    })

    for (const action of params.plan.actions) {
      this.applyAction(params.task.id, action)
    }
  }

  private workflowStateFromRunStatus(status: ControlPlaneTaskRun["status"]): ControlPlaneTask["workflowState"] {
    switch (status) {
      case "running":
        return "RUNNING"
      case "waiting_approval":
        return "WAITING_APPROVAL"
      case "waiting_input":
        return "WAITING_INPUT"
      case "completed":
        return "COMPLETED"
      case "failed":
        return "FAILED"
      case "cancelled":
        return "CANCELLED"
    }
  }

  private applyAction(taskId: string, action: ControlPlaneRuntimeAction): void {
    switch (action.kind) {
      case "persist_task_result":
        this.updateTask(taskId, (task) => ({
          ...task,
          result: action.result,
          updatedAt: action.eventAt || new Date().toISOString(),
        }))
        return

      case "set_last_activity":
        this.updateTask(taskId, (task) => ({
          ...task,
          lastActivityAt: action.eventAt || new Date().toISOString(),
          updatedAt: action.eventAt || new Date().toISOString(),
        }))
        return

      case "create_approval_record": {
        const task = this.getTask(taskId)
        const taskRun = task ? this.getActiveRunForTask(task) : null
        const now = new Date().toISOString()
        const approval: ControlPlaneApproval = {
          id: randomUUID(),
          taskId,
          taskRunId: taskRun?.id ?? null,
          type: action.approvalType,
          status: "pending",
          title: action.title,
          resolutionAction: action.resolutionAction,
          createdAt: now,
          updatedAt: now,
          description: action.description ?? null,
          question: action.question ?? null,
          response: null,
          decidedAt: null,
        }
        this.approvals.set(approval.id, approval)
        return
      }

      case "set_active_run_status": {
        const task = this.getTask(taskId)
        if (!task?.activeRunId) return

        const now = new Date().toISOString()
        this.updateTaskRun(task.activeRunId, (run) => ({
          ...run,
          status: action.status,
          updatedAt: now,
          completedAt:
            action.status === "completed" || action.status === "cancelled" || action.status === "failed"
              ? now
              : run.completedAt ?? null,
        }))
        this.updateTask(taskId, (currentTask) => ({
          ...currentTask,
          workflowState: this.workflowStateFromRunStatus(action.status),
          updatedAt: now,
          completedAt:
            action.status === "completed" || action.status === "cancelled" || action.status === "failed"
              ? now
              : currentTask.completedAt ?? null,
        }))
        return
      }

      case "create_browser_task": {
        const now = new Date().toISOString()
        const browserTask: ControlPlaneBrowserTask = {
          id: randomUUID(),
          parentTaskId: action.parentTaskId,
          type: action.browserTaskType,
          status: "pending",
          createdAt: now,
          updatedAt: now,
          startedAt: null,
          completedAt: null,
          params: action.params,
        }
        this.browserTasks.set(browserTask.id, browserTask)
        return
      }

      case "mark_task_completed":
        this.updateTask(taskId, (task) => ({
          ...task,
          workflowState: "COMPLETED",
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }))
        return

      case "unlock_agent_session": {
        const current = this.ensureAgent(action.agentId)
        this.agents.set(action.agentId, {
          ...current,
          sessionState: "idle",
          currentTaskId: null,
        })
        return
      }

      case "emit_signal":
        this.signals.push({
          signal: action.signal,
          payload: action.payload,
        })
        return
    }
  }

  resolveApproval(approvalId: string, input: ResolveApprovalRequest): ControlPlaneApproval {
    const approval = this.approvals.get(approvalId)
    if (!approval) {
      throw new Error(`Approval ${approvalId} not found`)
    }

    const now = new Date().toISOString()
    const next: ControlPlaneApproval = {
      ...approval,
      status: input.status,
      response: input.response ?? null,
      decidedAt: now,
      updatedAt: now,
    }
    this.approvals.set(approvalId, next)

    const task = this.getTask(approval.taskId)
    if (!task) return next

    const run = this.getActiveRunForTask(task)
    if (input.status === "rejected") {
      if (run) {
        this.applyAction(task.id, {
          kind: "set_active_run_status",
          taskId: task.id,
          status: "cancelled",
        })
      }
      this.applyAction(task.id, {
        kind: "unlock_agent_session",
        agentId: task.agentId,
      })
      return next
    }

    if (input.status === "approved" || input.status === "answered") {
      if (approval.resolutionAction === "complete_task") {
        this.applyAction(task.id, {
          kind: "mark_task_completed",
          taskId: task.id,
        })
        if (run) {
          this.applyAction(task.id, {
            kind: "set_active_run_status",
            taskId: task.id,
            status: "completed",
          })
        }
        this.applyAction(task.id, {
          kind: "unlock_agent_session",
          agentId: task.agentId,
        })
        this.signals.push({
          signal: "task:completed",
          payload: {
            taskId: task.id,
            agentId: task.agentId,
            approvalId,
          },
        })
        return next
      }

      if (run) {
        this.applyAction(task.id, {
          kind: "set_active_run_status",
          taskId: task.id,
          status: "running",
        })
      }
      this.signals.push({
        signal: "task:resume-requested",
        payload: {
          taskId: task.id,
          approvalId,
          approvalType: approval.type,
        },
      })
    }

    return next
  }
}

export class InMemoryControlPlaneService {
  readonly runtimeHandler: ControlPlaneRuntimeEventHandlerService

  constructor(readonly store: InMemoryControlPlaneStore = new InMemoryControlPlaneStore()) {
    this.runtimeHandler = new ControlPlaneRuntimeEventHandlerService(
      this.store,
      this.store,
      this.store,
    )
  }

  createTask(input: CreateTaskRequest): ControlPlaneTask {
    return this.store.createTask(input)
  }

  startTaskRun(taskId: string, input: StartTaskRunRequest): ControlPlaneTaskRun {
    return this.store.startTaskRun(taskId, input)
  }

  listTasks(): ControlPlaneTask[] {
    return this.store.listTasks()
  }

  getTask(taskId: string): ControlPlaneTask | null {
    return this.store.getTask(taskId)
  }

  listApprovals(): ControlPlaneApproval[] {
    return this.store.listApprovals()
  }

  listBrowserTasks(): ControlPlaneBrowserTask[] {
    return this.store.listBrowserTasks()
  }

  upsertRuntimeAgent(input: RuntimeAgentRegistration): RuntimeAgentState {
    return this.store.upsertRuntimeAgent(input)
  }

  listRuntimeAgents(probeId?: string): RuntimeAgentState[] {
    return this.store.listRuntimeAgents(probeId)
  }

  async ingestRuntimeEvent(event: ControlPlaneRuntimeEventEnvelope) {
    return await this.runtimeHandler.handleEvent(event)
  }

  recordHeartbeat(input: ProbeHeartbeatRequest): void {
    this.store.recordHeartbeat(input)
  }

  resolveApproval(approvalId: string, input: ResolveApprovalRequest): ControlPlaneApproval {
    return this.store.resolveApproval(approvalId, input)
  }
}
