type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

interface JsonObject {
  [key: string]: JsonValue
}

type RuntimeMetadataParams = {
  sessionKey?: string | null
  ownerKey?: string | null
  runtimeRunId?: string | null
  runtimeTaskId?: string | null
  runtimeFlowId?: string | null
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function withOptionalString(target: JsonObject, key: string, value?: string | null) {
  const normalized = value?.trim()
  if (normalized) {
    target[key] = normalized
  }
}

export function mergeRuntimeMetadata(
  metadata: unknown,
  params: RuntimeMetadataParams,
): JsonObject | undefined {
  const base = isJsonObject(metadata) ? metadata : {}
  const next: JsonObject = { ...base }

  withOptionalString(next, "sessionKey", params.sessionKey)
  withOptionalString(next, "ownerKey", params.ownerKey)
  withOptionalString(next, "runtimeRunId", params.runtimeRunId)
  withOptionalString(next, "runtimeTaskId", params.runtimeTaskId)
  withOptionalString(next, "runtimeFlowId", params.runtimeFlowId)

  return Object.keys(next).length > 0 ? next : undefined
}

export function mergeRuntimeSessionMetadata(
  metadata: unknown,
  sessionKey: string | null,
): JsonObject | undefined {
  return mergeRuntimeMetadata(metadata, { sessionKey })
}
