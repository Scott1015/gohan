export type TaskWorkflowState =
  | "PENDING"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "WAITING_INPUT"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"

type TaskRunLike = {
  status?: string | null
}

type TaskLike = {
  status?: string | null
  workflowState?: string | null
  runs?: TaskRunLike[] | null
}

function normalizeWorkflowState(value: string | null | undefined): TaskWorkflowState | null {
  if (!value) return null

  switch (value) {
    case "PENDING":
    case "RUNNING":
    case "WAITING_APPROVAL":
    case "WAITING_INPUT":
    case "COMPLETED":
    case "FAILED":
    case "CANCELLED":
      return value
    case "running":
      return "RUNNING"
    case "waiting_approval":
      return "WAITING_APPROVAL"
    case "waiting_input":
      return "WAITING_INPUT"
    case "completed":
      return "COMPLETED"
    case "failed":
      return "FAILED"
    case "cancelled":
      return "CANCELLED"
    default:
      return null
  }
}

export function getTaskWorkflowState(task: TaskLike): TaskWorkflowState {
  const explicitState = normalizeWorkflowState(task.workflowState)
  if (explicitState) return explicitState

  const latestRunState = normalizeWorkflowState(task.runs?.[0]?.status)
  if (latestRunState) return latestRunState

  return normalizeWorkflowState(task.status) ?? "PENDING"
}

export function isTaskActivelyRunning(state: string): boolean {
  return state === "PENDING" || state === "RUNNING"
}
