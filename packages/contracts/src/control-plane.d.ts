import type { ApprovalStatus, ApprovalType, JsonObject, RuntimeEvent, TaskRunStatus, TaskWorkflowState } from "./runtime.js";
export type ApprovalResolutionAction = "resume_run" | "complete_task";
export type BrowserTaskStatus = "pending" | "running" | "completed" | "failed";
export interface ControlPlaneTask {
    id: string;
    title: string;
    agentId: string;
    workflowState: TaskWorkflowState;
    requireApproval: boolean;
    createdAt: string;
    updatedAt: string;
    startedAt?: string | null;
    completedAt?: string | null;
    lastActivityAt?: string | null;
    result?: string | null;
    activeRunId?: string | null;
}
export interface ControlPlaneTaskRun {
    id: string;
    taskId: string;
    status: TaskRunStatus;
    createdAt: string;
    updatedAt: string;
    startedAt: string;
    completedAt?: string | null;
    messageId?: string | null;
    sessionKey?: string | null;
    runtimeRunId?: string | null;
    runtimeTaskId?: string | null;
    runtimeFlowId?: string | null;
}
export interface ControlPlaneApproval {
    id: string;
    taskId: string;
    taskRunId?: string | null;
    type: ApprovalType;
    status: ApprovalStatus;
    title: string;
    resolutionAction: ApprovalResolutionAction;
    createdAt: string;
    updatedAt: string;
    description?: string | null;
    question?: string | null;
    response?: string | null;
    decidedAt?: string | null;
}
export interface ControlPlaneBrowserTask {
    id: string;
    parentTaskId: string;
    type: string;
    status: BrowserTaskStatus;
    createdAt: string;
    updatedAt: string;
    startedAt?: string | null;
    completedAt?: string | null;
    params?: JsonObject;
}
export interface ControlPlaneRuntimeEventRecord extends RuntimeEvent {
    id: string;
    receivedAt: string;
    taskId?: string | null;
    taskRunId?: string | null;
}
export interface CreateTaskRequest {
    taskId?: string;
    title: string;
    agentId: string;
    requireApproval?: boolean;
}
export interface StartTaskRunRequest {
    runId?: string;
    startedAt?: string;
    messageId?: string | null;
    sessionKey?: string | null;
    runtimeRunId?: string | null;
    runtimeTaskId?: string | null;
    runtimeFlowId?: string | null;
}
export interface ResolveApprovalRequest {
    status: ApprovalStatus;
    response?: string;
}
//# sourceMappingURL=control-plane.d.ts.map