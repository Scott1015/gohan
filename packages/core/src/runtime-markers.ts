import type {
  ApprovalRequestMarker,
  BrowserTaskMarker,
  InputRequestMarker,
} from "./runtime-event-decisions.js"
import {
  parseApprovalRequestMarker,
  parseBrowserTaskMarker,
  parseInputRequestMarker,
} from "./runtime-event-decisions.js"

export interface RuntimeControlMarkers {
  hasTaskComplete: boolean
  approvalRequest?: ApprovalRequestMarker
  inputRequest?: InputRequestMarker
  browserTask?: BrowserTaskMarker
}

export function parseRuntimeControlMarkers(content: string): RuntimeControlMarkers {
  const approvalRequest = parseApprovalRequestMarker(content) ?? undefined
  const inputRequest = parseInputRequestMarker(content) ?? undefined
  const browserTask = parseBrowserTaskMarker(content) ?? undefined

  return {
    hasTaskComplete: content.includes("[TASK_COMPLETE]"),
    ...(approvalRequest ? { approvalRequest } : {}),
    ...(inputRequest ? { inputRequest } : {}),
    ...(browserTask ? { browserTask } : {}),
  }
}

export function stripRuntimeControlMarkers(text: string): string {
  return text
    .replace(/\[PROGRESS\][^\n]*\n?/g, "")
    .replace(/\[TASK_COMPLETE\]/g, "")
    .replace(/\[APPROVAL_REQUEST\][^\n]*\n?/g, "")
    .replace(/\[HUMAN_INPUT_REQUEST\][^\n]*\n?/g, "")
    .replace(/\[BROWSER_TASK:(\w+):(\{.*?\})\]/g, "")
    .trim()
}
