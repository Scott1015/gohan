import type { JsonObject, JsonValue } from "./runtime.js"

export type BrowserWorkerTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"

export interface BrowserTaskExecutionRequest {
  browserTaskId: string
  parentTaskId: string
  type: string
  createdAt: string
  params: JsonObject
  timeoutMs?: number
  agentId?: string | null
  taskRunId?: string | null
  sessionKey?: string | null
  runtimeRunId?: string | null
  runtimeTaskId?: string | null
}

export interface BrowserWorkerLogEntry {
  level: "info" | "warning" | "error"
  message: string
  at: string
  data?: JsonValue
}

export interface BrowserWorkerArtifact {
  kind: "screenshot" | "html" | "trace" | "download" | "other"
  name: string
  path?: string
  url?: string
  metadata?: JsonObject
}

export interface BrowserTaskExecutionResult {
  browserTaskId: string
  status: Exclude<BrowserWorkerTaskStatus, "pending" | "running">
  startedAt: string
  completedAt: string
  summary?: string
  error?: string
  output?: JsonValue
  logs?: BrowserWorkerLogEntry[]
  artifacts?: BrowserWorkerArtifact[]
}
