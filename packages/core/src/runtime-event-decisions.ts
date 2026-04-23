import type { JsonObject, JsonValue } from "@gohan/contracts"

export interface ApprovalRequestMarker {
  title: string
  description: string
}

export interface InputRequestMarker {
  question: string
}

export interface BrowserTaskMarker {
  type: string
  params: JsonObject
}

export interface AssistantRuntimeEventDecision {
  normalizedContent: string
  shouldUpdateTaskResult: boolean
  shouldRefreshLastActivity: boolean
  approvalRequest?: ApprovalRequestMarker
  inputRequest?: InputRequestMarker
  browserTask?: BrowserTaskMarker
  hasTaskCompleteMarker: boolean
  shouldCompleteTask: boolean
}

export interface UserRuntimeEventDecision {
  normalizedContent: string
  isResumeControlMessage: boolean
  shouldRefreshLastActivity: boolean
  shouldAutoCompleteAfterInactivity: boolean
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value == null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item))
  }

  return isJsonObject(value)
}

function isJsonObject(value: unknown): value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  return Object.values(value).every((entry) => isJsonValue(entry))
}

function normalizeNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function normalizeRuntimeContent(content: unknown): string {
  if (typeof content === "string") return content.trim()
  if (content == null) return ""

  try {
    return JSON.stringify(content).trim()
  } catch {
    return String(content).trim()
  }
}

export function parseApprovalRequestMarker(content: string): ApprovalRequestMarker | null {
  const match = content.match(/\[APPROVAL_REQUEST\]\s*(.+?)\s*\|\s*(.+)/m)
  if (!match) return null

  const title = normalizeNonEmptyString(match[1])
  const description = normalizeNonEmptyString(match[2])
  if (!title || !description) return null

  return { title, description }
}

export function parseInputRequestMarker(content: string): InputRequestMarker | null {
  const match = content.match(/\[HUMAN_INPUT_REQUEST\]\s*(.+)/m)
  if (!match) return null

  const question = normalizeNonEmptyString(match[1])
  if (!question) return null

  return { question }
}

export function parseBrowserTaskMarker(content: string): BrowserTaskMarker | null {
  const match = content.match(/\[BROWSER_TASK:(\w+):(\{.*?\})\]/)
  if (!match) return null

  const type = normalizeNonEmptyString(match[1])
  if (!type) return null

  try {
    const params = JSON.parse(match[2]) as unknown
    if (!isJsonObject(params)) return null
    return { type, params }
  } catch {
    return null
  }
}

export function isRuntimeResumeControlMessage(content: unknown): boolean {
  const normalized = normalizeRuntimeContent(content)
  return (
    normalized.startsWith("[APPROVAL_RESULT]") ||
    normalized.startsWith("[HUMAN_INPUT_RESULT]")
  )
}

export function planAssistantRuntimeEvent(content: unknown): AssistantRuntimeEventDecision {
  const normalizedContent = normalizeRuntimeContent(content)
  const approvalRequest = parseApprovalRequestMarker(normalizedContent) ?? undefined
  const inputRequest = parseInputRequestMarker(normalizedContent) ?? undefined
  const browserTask = parseBrowserTaskMarker(normalizedContent) ?? undefined
  const hasTaskCompleteMarker = normalizedContent.includes("[TASK_COMPLETE]")
  const shouldCompleteTask = hasTaskCompleteMarker && !approvalRequest && !inputRequest

  return {
    normalizedContent,
    shouldUpdateTaskResult: true,
    shouldRefreshLastActivity: true,
    ...(approvalRequest ? { approvalRequest } : {}),
    ...(inputRequest ? { inputRequest } : {}),
    ...(browserTask ? { browserTask } : {}),
    hasTaskCompleteMarker,
    shouldCompleteTask,
  }
}

export function planUserRuntimeEvent(params: {
  content: unknown
  millisSinceLastActivity?: number | null
  timeoutMs?: number
}): UserRuntimeEventDecision {
  const normalizedContent = normalizeRuntimeContent(params.content)
  const isResumeControlMessage = isRuntimeResumeControlMessage(normalizedContent)
  const millisSinceLastActivity =
    typeof params.millisSinceLastActivity === "number" ? params.millisSinceLastActivity : 0
  const timeoutMs = typeof params.timeoutMs === "number" ? params.timeoutMs : 30_000

  return {
    normalizedContent,
    isResumeControlMessage,
    shouldRefreshLastActivity: isResumeControlMessage,
    shouldAutoCompleteAfterInactivity:
      !isResumeControlMessage && millisSinceLastActivity > timeoutMs,
  }
}
