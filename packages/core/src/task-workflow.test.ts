import assert from "node:assert/strict"
import test from "node:test"

import {
  getTaskWorkflowState,
  isTaskActivelyRunning,
} from "./task-workflow.js"

test("getTaskWorkflowState prefers explicit workflow state", () => {
  assert.equal(
    getTaskWorkflowState({
      status: "RUNNING",
      workflowState: "WAITING_INPUT",
    }),
    "WAITING_INPUT",
  )
})

test("getTaskWorkflowState normalizes latest run status", () => {
  assert.equal(
    getTaskWorkflowState({
      status: "RUNNING",
      runs: [{ status: "waiting_approval" }],
    }),
    "WAITING_APPROVAL",
  )
})

test("isTaskActivelyRunning matches pending and running only", () => {
  assert.equal(isTaskActivelyRunning("PENDING"), true)
  assert.equal(isTaskActivelyRunning("RUNNING"), true)
  assert.equal(isTaskActivelyRunning("WAITING_APPROVAL"), false)
})
