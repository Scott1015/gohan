import type { JsonObject } from "@gohan/contracts"

import {
  normalizeRuntimeContent,
  planAssistantRuntimeEvent,
  planUserRuntimeEvent,
} from "./runtime-event-decisions.js"

export type RuntimeEventPlanAction =
  | {
      kind: "update_task_result"
      result: string
      eventAt?: string
    }
  | {
      kind: "refresh_last_activity"
      eventAt?: string
    }
  | {
      kind: "request_approval"
      title: string
      description: string
    }
  | {
      kind: "request_input"
      question: string
    }
  | {
      kind: "enqueue_browser_task"
      browserTaskType: string
      params: JsonObject
    }
  | {
      kind: "complete_task"
    }

export interface RuntimeEventPlan {
  normalizedContent: string
  actions: RuntimeEventPlanAction[]
}

function parseIsoDate(value?: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function computeMillisBetween(start?: string | null, end?: string | null): number | null {
  const startDate = parseIsoDate(start)
  const endDate = parseIsoDate(end)
  if (!startDate || !endDate) return null
  return endDate.getTime() - startDate.getTime()
}

export function planRuntimeEvent(params: {
  eventType: string
  content?: unknown
  eventAt?: string | null
  taskStartedAt?: string | null
  lastActivityAt?: string | null
  timeoutMs?: number
}): RuntimeEventPlan {
  const normalizedContent = normalizeRuntimeContent(params.content)
  const actions: RuntimeEventPlanAction[] = []

  if (params.eventType === "assistant") {
    const eventAt = params.eventAt ?? undefined
    const taskStartedAt = params.taskStartedAt ?? undefined
    const startedAtMs =
      taskStartedAt && eventAt ? computeMillisBetween(taskStartedAt, eventAt) : null

    if (startedAtMs == null || startedAtMs >= 0) {
      actions.push({
        kind: "update_task_result",
        result: normalizedContent,
        ...(eventAt ? { eventAt } : {}),
      })
      actions.push({
        kind: "refresh_last_activity",
        ...(eventAt ? { eventAt } : {}),
      })
    }

    const decision = planAssistantRuntimeEvent(normalizedContent)

    if (decision.approvalRequest) {
      actions.push({
        kind: "request_approval",
        title: decision.approvalRequest.title,
        description: decision.approvalRequest.description,
      })
    }

    if (decision.inputRequest) {
      actions.push({
        kind: "request_input",
        question: decision.inputRequest.question,
      })
    }

    if (decision.browserTask) {
      actions.push({
        kind: "enqueue_browser_task",
        browserTaskType: decision.browserTask.type,
        params: decision.browserTask.params,
      })
    }

    if (decision.shouldCompleteTask) {
      actions.push({ kind: "complete_task" })
    }

    return { normalizedContent, actions }
  }

  if (params.eventType === "user") {
    const inactivityMs = computeMillisBetween(params.lastActivityAt ?? undefined, params.eventAt ?? undefined)
    const decision = planUserRuntimeEvent({
      content: normalizedContent,
      millisSinceLastActivity: inactivityMs,
      timeoutMs: params.timeoutMs,
    })

    if (decision.shouldRefreshLastActivity) {
      actions.push({
        kind: "refresh_last_activity",
        ...(params.eventAt ? { eventAt: params.eventAt } : {}),
      })
    }

    if (decision.shouldAutoCompleteAfterInactivity) {
      actions.push({ kind: "complete_task" })
    }
  }

  return { normalizedContent, actions }
}
