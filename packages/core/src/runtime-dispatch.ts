import crypto from "node:crypto"

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

interface JsonObject {
  [key: string]: JsonValue
}

export type NormalizedRuntimeDispatchResult = {
  sessionId: string | null
  sessionKey: string | null
  runId: string | null
  runtimeTaskId: string | null
  runtimeFlowId: string | null
  runtimeStatus: string | null
  fallbackMode: string | null
  runtimePayload?: JsonValue
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function createRuntimeDispatchId(scope: string, runId: string = crypto.randomUUID()): string {
  return `${scope}:run:${runId}`
}

export function normalizeRuntimeDispatchResult(payload: unknown): NormalizedRuntimeDispatchResult {
  const topLevel = isJsonObject(payload) ? payload : {}
  const result = isJsonObject(topLevel.data) ? topLevel.data : topLevel

  return {
    sessionId: normalizeString(result.transcriptId ?? topLevel.transcriptId ?? result.sessionId ?? topLevel.sessionId),
    sessionKey: normalizeString(result.sessionKey ?? topLevel.sessionKey),
    runId: normalizeString(result.runId ?? topLevel.runId),
    runtimeTaskId: normalizeString(result.taskId ?? topLevel.taskId),
    runtimeFlowId: normalizeString(result.flowId ?? topLevel.flowId),
    runtimeStatus: normalizeString(result.status ?? topLevel.status),
    fallbackMode: normalizeString(result.fallbackMode ?? topLevel.fallbackMode),
    ...(isJsonObject(result) ? { runtimePayload: result } : {}),
  }
}

export function resolveDispatchedRuntime(params: {
  dispatchResult: NormalizedRuntimeDispatchResult
  defaultSessionKey?: string | null
  fallbackRunId?: string | null
}) {
  const isLegacyFallback = Boolean(params.dispatchResult.fallbackMode)

  return {
    sessionId: params.dispatchResult.sessionId,
    sessionKey: params.dispatchResult.sessionKey ?? normalizeString(params.defaultSessionKey),
    runtimeRunId: isLegacyFallback
      ? null
      : params.dispatchResult.runId ?? normalizeString(params.fallbackRunId),
    runtimeTaskId: isLegacyFallback ? null : params.dispatchResult.runtimeTaskId,
    runtimeFlowId: isLegacyFallback ? null : params.dispatchResult.runtimeFlowId,
    runtimeStatus: isLegacyFallback ? null : params.dispatchResult.runtimeStatus ?? "accepted",
    runtimePayload: params.dispatchResult.runtimePayload,
    fallbackMode: params.dispatchResult.fallbackMode,
  }
}

export function assertRuntimeSession(params: {
  runtime: ReturnType<typeof resolveDispatchedRuntime>
  expectedSessionKey?: string | null
}) {
  const expectedSessionKey =
    typeof params.expectedSessionKey === "string" && params.expectedSessionKey.trim()
      ? params.expectedSessionKey.trim()
      : null

  if (!expectedSessionKey) {
    return
  }

  if (params.runtime.fallbackMode) {
    throw new Error(
      `runtime session fallback is not allowed (expected ${expectedSessionKey}, got fallback=${params.runtime.fallbackMode})`,
    )
  }

  if (params.runtime.sessionKey !== expectedSessionKey) {
    throw new Error(
      `runtime session mismatch (expected ${expectedSessionKey}, got ${params.runtime.sessionKey ?? "null"})`,
    )
  }

  if (!params.runtime.runtimeRunId) {
    throw new Error(`runtimeRunId missing for ${expectedSessionKey}`)
  }
}

export function buildRuntimeIdentityFields(params: {
  sessionKey?: string | null
  runtimeRunId?: string | null
  runtimeTaskId?: string | null
  runtimeFlowId?: string | null
  runtimeStatus?: string | null
  runtimePayload?: JsonValue
}): {
  sessionKey?: string
  runtimeRunId?: string
  runtimeTaskId?: string
  runtimeFlowId?: string
  runtimeStatus?: string
  runtimePayload?: JsonValue
} {
  const data: {
    sessionKey?: string
    runtimeRunId?: string
    runtimeTaskId?: string
    runtimeFlowId?: string
    runtimeStatus?: string
    runtimePayload?: JsonValue
  } = {}

  const sessionKey = normalizeString(params.sessionKey)
  const runtimeRunId = normalizeString(params.runtimeRunId)
  const runtimeTaskId = normalizeString(params.runtimeTaskId)
  const runtimeFlowId = normalizeString(params.runtimeFlowId)
  const runtimeStatus = normalizeString(params.runtimeStatus)

  if (sessionKey) data.sessionKey = sessionKey
  if (runtimeRunId) data.runtimeRunId = runtimeRunId
  if (runtimeTaskId) data.runtimeTaskId = runtimeTaskId
  if (runtimeFlowId) data.runtimeFlowId = runtimeFlowId
  if (runtimeStatus) data.runtimeStatus = runtimeStatus
  if (params.runtimePayload !== undefined) data.runtimePayload = params.runtimePayload

  return data
}
