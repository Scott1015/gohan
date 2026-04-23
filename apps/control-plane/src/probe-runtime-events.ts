import { basename } from "node:path"

import type { ProbeRawEventBatchRequest } from "@gohan/contracts"

import type { ControlPlaneRuntimeEventEnvelope } from "./runtime-event-handler-service.js"

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function extractTextParts(content: unknown): string[] {
  if (!Array.isArray(content)) return []

  return content
    .flatMap((item) => {
      if (!item || typeof item !== "object") return []

      const record = item as Record<string, unknown>
      if (record.type === "text" && typeof record.text === "string" && record.text.trim()) {
        return [record.text.trim()]
      }
      if (
        record.type === "tool_result" &&
        typeof record.text === "string" &&
        record.text.trim()
      ) {
        return [record.text.trim()]
      }
      return []
    })
}

function deriveSessionId(sessionFile?: string): string | undefined {
  const normalized = normalizeString(sessionFile)
  if (!normalized) return undefined

  const name = basename(normalized)
  const suffix = ".jsonl"
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name
}

function extractRuntimeRef(event: Record<string, unknown>, message?: Record<string, unknown>) {
  const details =
    message?.details && typeof message.details === "object" && !Array.isArray(message.details)
      ? (message.details as Record<string, unknown>)
      : undefined
  const data =
    event.data && typeof event.data === "object" && !Array.isArray(event.data)
      ? (event.data as Record<string, unknown>)
      : undefined

  return {
    runtimeRunId:
      normalizeString(event.runId) ??
      normalizeString(message?.runId) ??
      normalizeString(details?.runId) ??
      normalizeString(data?.runId),
    runtimeTaskId:
      normalizeString(event.taskId) ??
      normalizeString(message?.taskId) ??
      normalizeString(details?.taskId) ??
      normalizeString(data?.taskId),
    runtimeFlowId:
      normalizeString(event.flowId) ??
      normalizeString(message?.flowId) ??
      normalizeString(details?.flowId) ??
      normalizeString(data?.flowId),
  }
}

export function parseProbeRawEvent(params: {
  probeId: string
  defaultSessionId?: string
  defaultAgentId?: string
  defaultEventAt?: string
  rawLine: string
}): ControlPlaneRuntimeEventEnvelope | null {
  let event: Record<string, unknown>
  try {
    event = JSON.parse(params.rawLine) as Record<string, unknown>
  } catch {
    return null
  }

  const eventType = normalizeString(event.type)
  const eventAt =
    normalizeString(event.timestamp) ?? params.defaultEventAt ?? new Date().toISOString()
  const sessionId =
    normalizeString(event.sessionId) ??
    normalizeString(event.sessionKey) ??
    params.defaultSessionId
  const agentId = normalizeString(event.agentId) ?? params.defaultAgentId

  if (!eventType || !sessionId) {
    return null
  }

  if (eventType === "message") {
    const message =
      event.message && typeof event.message === "object" && !Array.isArray(event.message)
        ? (event.message as Record<string, unknown>)
        : undefined
    const role = normalizeString(message?.role)
    if (!message || !role) return null

    const content = extractTextParts(message.content).join("\n\n")
    const runtimeRefs = extractRuntimeRef(event, message)

    if (role === "assistant") {
      return {
        probeId: params.probeId,
        sessionId,
        ...(agentId ? { agentId } : {}),
        ...runtimeRefs,
        eventType: "assistant",
        content,
        eventAt,
      }
    }

    if (role === "user") {
      return {
        probeId: params.probeId,
        sessionId,
        ...(agentId ? { agentId } : {}),
        ...runtimeRefs,
        eventType: "user",
        content,
        eventAt,
      }
    }

    if (role === "toolResult") {
      return {
        probeId: params.probeId,
        sessionId,
        ...(agentId ? { agentId } : {}),
        ...runtimeRefs,
        eventType: "tool_result",
        content,
        eventAt,
      }
    }

    return null
  }

  if (eventType === "session") {
    const runtimeRefs = extractRuntimeRef(event)
    return {
      probeId: params.probeId,
      sessionId,
      ...(agentId ? { agentId } : {}),
      ...runtimeRefs,
      eventType: "session",
      content: `Session started: ${sessionId}`,
      eventAt,
    }
  }

  return null
}

export function parseProbeRawEventBatch(
  batch: ProbeRawEventBatchRequest,
): ControlPlaneRuntimeEventEnvelope[] {
  const defaultSessionId = deriveSessionId(batch.sessionFile)

  return batch.rawDataList
    .map((rawLine) =>
      parseProbeRawEvent({
        probeId: batch.probeId,
        defaultSessionId,
        defaultAgentId: batch.agentId,
        defaultEventAt: batch.timestamp,
        rawLine,
      }),
    )
    .filter((event): event is ControlPlaneRuntimeEventEnvelope => event !== null)
}
