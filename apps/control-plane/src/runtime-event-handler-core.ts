import { planRuntimeEvent } from "@gohan/core"

import type {
  ControlPlaneRuntimeAction,
  ControlPlaneRuntimeEvent,
  ControlPlaneRuntimePlan,
  ControlPlaneTaskRecord,
} from "./runtime-models.js"

function buildCompletionApprovalTitle(task: ControlPlaneTaskRecord): string {
  const label = task.title?.trim() || task.id
  return `Confirm completion: ${label}`
}

function buildCompletionApprovalDescription(
  task: ControlPlaneTaskRecord,
  normalizedContent: string,
): string {
  const preferred = normalizedContent || task.result || "Task finished and is waiting for approval."
  return preferred.slice(0, 500)
}

export function planControlPlaneRuntimeEvent(params: {
  task: ControlPlaneTaskRecord
  event: ControlPlaneRuntimeEvent
  timeoutMs?: number
}): ControlPlaneRuntimePlan {
  const runtimePlan = planRuntimeEvent({
    eventType: params.event.eventType,
    content: params.event.content,
    eventAt: params.event.eventAt,
    taskStartedAt: params.task.startedAt,
    lastActivityAt: params.task.lastActivityAt,
    timeoutMs: params.timeoutMs,
  })

  const actions: ControlPlaneRuntimeAction[] = []

  for (const action of runtimePlan.actions) {
    switch (action.kind) {
      case "update_task_result":
        actions.push({
          kind: "persist_task_result",
          taskId: params.task.id,
          result: action.result,
          ...(action.eventAt ? { eventAt: action.eventAt } : {}),
        })
        break
      case "refresh_last_activity":
        actions.push({
          kind: "set_last_activity",
          taskId: params.task.id,
          ...(action.eventAt ? { eventAt: action.eventAt } : {}),
        })
        break
      case "request_approval":
        actions.push({
          kind: "create_approval_record",
          taskId: params.task.id,
          approvalType: "approval",
          title: action.title,
          resolutionAction: "resume_run",
          description: action.description,
          targetRunStatus: "waiting_approval",
        })
        actions.push({
          kind: "set_active_run_status",
          taskId: params.task.id,
          status: "waiting_approval",
        })
        actions.push({
          kind: "emit_signal",
          signal: "task:approval:requested",
          payload: {
            taskId: params.task.id,
            agentId: params.task.agentId,
            title: action.title,
            description: action.description,
          },
        })
        break
      case "request_input":
        actions.push({
          kind: "create_approval_record",
          taskId: params.task.id,
          approvalType: "input",
          title: "Need more information",
          resolutionAction: "resume_run",
          question: action.question,
          targetRunStatus: "waiting_input",
        })
        actions.push({
          kind: "set_active_run_status",
          taskId: params.task.id,
          status: "waiting_input",
        })
        actions.push({
          kind: "emit_signal",
          signal: "task:input:requested",
          payload: {
            taskId: params.task.id,
            agentId: params.task.agentId,
            question: action.question,
          },
        })
        break
      case "enqueue_browser_task":
        actions.push({
          kind: "create_browser_task",
          parentTaskId: params.task.id,
          browserTaskType: action.browserTaskType,
          params: action.params,
        })
        break
      case "complete_task":
        if (params.task.requireApproval) {
          actions.push({
            kind: "create_approval_record",
            taskId: params.task.id,
            approvalType: "approval",
            title: buildCompletionApprovalTitle(params.task),
            resolutionAction: "complete_task",
            description: buildCompletionApprovalDescription(
              params.task,
              runtimePlan.normalizedContent,
            ),
            targetRunStatus: "waiting_approval",
          })
          actions.push({
            kind: "set_active_run_status",
            taskId: params.task.id,
            status: "waiting_approval",
          })
          break
        }

        actions.push({
          kind: "mark_task_completed",
          taskId: params.task.id,
        })
        actions.push({
          kind: "set_active_run_status",
          taskId: params.task.id,
          status: "completed",
        })
        actions.push({
          kind: "unlock_agent_session",
          agentId: params.task.agentId,
        })
        actions.push({
          kind: "emit_signal",
          signal: "task:completed",
          payload: {
            taskId: params.task.id,
            agentId: params.task.agentId,
          },
        })
        actions.push({
          kind: "emit_signal",
          signal: "task:check-pending-work",
          payload: {
            agentId: params.task.agentId,
          },
        })
        break
    }
  }

  return {
    normalizedContent: runtimePlan.normalizedContent,
    actions,
  }
}
