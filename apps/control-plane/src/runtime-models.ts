import type {
  ApprovalResolutionAction,
  ControlPlaneApproval,
  ControlPlaneBrowserTask,
  ControlPlaneTask,
  ControlPlaneTaskRun,
  ApprovalType,
  JsonObject,
  RuntimeEventType,
  TaskRunStatus,
} from "@gohan/contracts"

export type ControlPlaneTaskRecord = ControlPlaneTask
export type ControlPlaneTaskRunRecord = ControlPlaneTaskRun
export type ControlPlaneApprovalRecord = ControlPlaneApproval
export type ControlPlaneBrowserTaskRecord = ControlPlaneBrowserTask

export interface ControlPlaneRuntimeEvent {
  eventType: RuntimeEventType
  content?: unknown
  eventAt?: string | null
}

export type ControlPlaneSignal =
  | "task:approval:requested"
  | "task:input:requested"
  | "task:resume-requested"
  | "task:completed"
  | "task:check-pending-work"

export type ControlPlaneRuntimeAction =
  | {
      kind: "persist_task_result"
      taskId: string
      result: string
      eventAt?: string
    }
  | {
      kind: "set_last_activity"
      taskId: string
      eventAt?: string
    }
  | {
      kind: "create_approval_record"
      taskId: string
      approvalType: ApprovalType
      title: string
      resolutionAction: ApprovalResolutionAction
      description?: string
      question?: string
      targetRunStatus: TaskRunStatus
    }
  | {
      kind: "set_active_run_status"
      taskId: string
      status: TaskRunStatus
    }
  | {
      kind: "create_browser_task"
      parentTaskId: string
      browserTaskType: string
      params: JsonObject
    }
  | {
      kind: "mark_task_completed"
      taskId: string
    }
  | {
      kind: "unlock_agent_session"
      agentId: string
    }
  | {
      kind: "emit_signal"
      signal: ControlPlaneSignal
      payload: Record<string, unknown>
    }

export interface ControlPlaneRuntimePlan {
  normalizedContent: string
  actions: ControlPlaneRuntimeAction[]
}
