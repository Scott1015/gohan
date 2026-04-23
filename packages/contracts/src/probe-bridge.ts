export interface RuntimeAgentRegistration {
  agentId: string
  slug: string
  probeId: string
  sessionsDir?: string | null
}

export interface RuntimeAgentState extends RuntimeAgentRegistration {
  sessionState?: "idle" | "busy" | "error"
  currentTaskId?: string | null
  lastHeartbeatAt?: string | null
  lastProbeId?: string | null
  sessionFile?: string | null
  hasSession?: boolean
}

export interface ProbeHeartbeatAgent {
  agentId: string
  agentSlug?: string
  sessionFile?: string | null
  hasSession?: boolean
}

export interface ProbeHeartbeatRequest {
  probeId: string
  timestamp: string
  status: string
  agents: ProbeHeartbeatAgent[]
}

export interface ProbeRawEventBatchRequest {
  probeId: string
  sessionFile?: string
  rawDataList: string[]
  timestamp?: string
  agentId?: string
  agentSlug?: string
}
