export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

export interface JsonObject {
  [key: string]: JsonValue
}

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"

export type TaskRunStatus =
  | "running"
  | "waiting_approval"
  | "waiting_input"
  | "completed"
  | "failed"
  | "cancelled"

export type TaskWorkflowState =
  | "PENDING"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "WAITING_INPUT"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "answered"

export type ApprovalType = "approval" | "input"

export type RuntimeEventType =
  | "session"
  | "user"
  | "assistant"
  | "tool"
  | "tool_result"
  | "heartbeat"

export type RuntimeHealth = "online" | "busy" | "offline" | "error"

export interface RuntimeDispatchResult {
  sessionId: string | null
  sessionKey: string | null
  runId: string | null
  runtimeTaskId: string | null
  runtimeFlowId: string | null
  runtimeStatus: string | null
  fallbackMode: string | null
  runtimePayload?: JsonValue
}

export interface ResolvedRuntimeIdentity {
  sessionId: string | null
  sessionKey: string | null
  runtimeRunId: string | null
  runtimeTaskId: string | null
  runtimeFlowId: string | null
  runtimeStatus: string | null
  runtimePayload?: JsonValue
  fallbackMode: string | null
}

export interface TaskRuntimeMetadata {
  sessionKey?: string
  ownerKey?: string
  runtimeRunId?: string
  runtimeTaskId?: string
  runtimeFlowId?: string
}

export interface RuntimeFlowLink {
  platformTaskId: string
  ownerKey: string
  flowId: string
  controllerId?: string
  syncMode?: string
  runtimeStatus?: string
  stateJson?: JsonValue
  waitJson?: JsonValue
  lastRuntimeTaskId?: string
}

export interface RuntimeEvent {
  probeId: string
  sessionId: string
  agentId?: string
  runtimeRunId?: string
  runtimeTaskId?: string
  runtimeFlowId?: string
  eventType: RuntimeEventType
  content?: string | JsonValue
  eventAt: string
}

export interface ProbeHeartbeatRecord {
  probeId: string
  agentId: string
  agentSlug?: string
  sessionFile?: string
  hasSession?: boolean
  lastHeartbeat: string
  status: string
  receivedAt: string
}
