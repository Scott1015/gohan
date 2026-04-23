import assert from "node:assert/strict"
import test from "node:test"

import {
  isRuntimeResumeControlMessage,
  parseApprovalRequestMarker,
  parseBrowserTaskMarker,
  parseInputRequestMarker,
  planAssistantRuntimeEvent,
  planUserRuntimeEvent,
} from "./runtime-event-decisions.js"

test("parseApprovalRequestMarker parses title and description", () => {
  assert.deepEqual(
    parseApprovalRequestMarker("[APPROVAL_REQUEST] Review proposal | Approve budget increase"),
    {
      title: "Review proposal",
      description: "Approve budget increase",
    },
  )
})

test("parseInputRequestMarker parses question", () => {
  assert.deepEqual(
    parseInputRequestMarker("[HUMAN_INPUT_REQUEST] Which store should I use?"),
    {
      question: "Which store should I use?",
    },
  )
})

test("parseBrowserTaskMarker parses browser task payload", () => {
  assert.deepEqual(
    parseBrowserTaskMarker('[BROWSER_TASK:amazon_search:{"keyword":"iPhone 15"}]'),
    {
      type: "amazon_search",
      params: { keyword: "iPhone 15" },
    },
  )
})

test("planAssistantRuntimeEvent defers completion when approval is requested", () => {
  const decision = planAssistantRuntimeEvent(
    "[APPROVAL_REQUEST] Confirm publish | Post this campaign\n[TASK_COMPLETE]",
  )

  assert.equal(decision.hasTaskCompleteMarker, true)
  assert.equal(decision.shouldCompleteTask, false)
  assert.deepEqual(decision.approvalRequest, {
    title: "Confirm publish",
    description: "Post this campaign",
  })
})

test("planUserRuntimeEvent recognizes resume messages", () => {
  const decision = planUserRuntimeEvent({
    content: "[APPROVAL_RESULT] approved | proceed",
    millisSinceLastActivity: 90_000,
  })

  assert.equal(decision.isResumeControlMessage, true)
  assert.equal(decision.shouldRefreshLastActivity, true)
  assert.equal(decision.shouldAutoCompleteAfterInactivity, false)
  assert.equal(isRuntimeResumeControlMessage("[HUMAN_INPUT_RESULT] use store A"), true)
})

test("planUserRuntimeEvent triggers inactivity completion for normal user messages", () => {
  const decision = planUserRuntimeEvent({
    content: "继续帮我处理",
    millisSinceLastActivity: 31_000,
    timeoutMs: 30_000,
  })

  assert.equal(decision.isResumeControlMessage, false)
  assert.equal(decision.shouldAutoCompleteAfterInactivity, true)
})
