import type { RuntimeEventType } from "@gohan/contracts"

import { planControlPlaneRuntimeEvent } from "./runtime-event-handler-core.js"
import type {
  ControlPlaneRuntimeAction,
  ControlPlaneRuntimePlan,
  ControlPlaneTaskRecord,
} from "./runtime-models.js"

export interface ControlPlaneRuntimeEventEnvelope {
  probeId: string
  sessionId: string
  agentId?: string
  runtimeRunId?: string
  runtimeTaskId?: string
  runtimeFlowId?: string
  eventType: RuntimeEventType
  content?: unknown
  eventAt: string
}

export interface ActiveTaskResolverPort {
  findActiveTaskForEvent(
    event: ControlPlaneRuntimeEventEnvelope,
  ): Promise<ControlPlaneTaskRecord | null>
}

export interface RuntimeActionExecutorPort {
  executeRuntimePlan(params: {
    task: ControlPlaneTaskRecord
    event: ControlPlaneRuntimeEventEnvelope
    plan: ControlPlaneRuntimePlan
  }): Promise<void>
}

export interface RuntimeHeartbeatPort {
  refreshAgentHeartbeat?(params: {
    probeId: string
    agentId: string
    eventAt: string
  }): Promise<void>
}

export interface RuntimeEventHandlerResult {
  handled: boolean
  taskId?: string
  actionCount?: number
  actions?: ControlPlaneRuntimeAction[]
}

export class ControlPlaneRuntimeEventHandlerService {
  constructor(
    private readonly resolver: ActiveTaskResolverPort,
    private readonly executor: RuntimeActionExecutorPort,
    private readonly heartbeat?: RuntimeHeartbeatPort,
  ) {}

  async handleEvent(
    event: ControlPlaneRuntimeEventEnvelope,
  ): Promise<RuntimeEventHandlerResult> {
    if (event.agentId && this.heartbeat?.refreshAgentHeartbeat) {
      await this.heartbeat.refreshAgentHeartbeat({
        probeId: event.probeId,
        agentId: event.agentId,
        eventAt: event.eventAt,
      })
    }

    const task = await this.resolver.findActiveTaskForEvent(event)
    if (!task) {
      return { handled: false }
    }

    const plan = planControlPlaneRuntimeEvent({
      task,
      event: {
        eventType: event.eventType,
        content: event.content,
        eventAt: event.eventAt,
      },
    })

    await this.executor.executeRuntimePlan({
      task,
      event,
      plan,
    })

    return {
      handled: true,
      taskId: task.id,
      actionCount: plan.actions.length,
      actions: plan.actions,
    }
  }
}
