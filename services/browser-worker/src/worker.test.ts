import assert from "node:assert/strict"
import test from "node:test"

import type {
  BrowserTaskExecutionRequest,
  BrowserTaskExecutionResult,
} from "@gohan/contracts"

import {
  BrowserTaskWorker,
  createMockBrowserTaskHandlers,
} from "./worker.js"

class InMemoryTaskSource {
  constructor(private readonly tasks: BrowserTaskExecutionRequest[]) {}

  async claimNextTask(): Promise<BrowserTaskExecutionRequest | null> {
    return this.tasks.shift() ?? null
  }
}

class CapturingResultSink {
  readonly results: BrowserTaskExecutionResult[] = []

  async reportResult(result: BrowserTaskExecutionResult): Promise<void> {
    this.results.push(result)
  }
}

test("browser worker returns unclaimed when no task is available", async () => {
  const source = new InMemoryTaskSource([])
  const sink = new CapturingResultSink()
  const worker = new BrowserTaskWorker(source, sink, createMockBrowserTaskHandlers())

  const result = await worker.runOnce()

  assert.deepEqual(result, { claimed: false })
  assert.equal(sink.results.length, 0)
})

test("browser worker executes mock handler and reports completed result", async () => {
  const source = new InMemoryTaskSource([
    {
      browserTaskId: "browser-task-1",
      parentTaskId: "task-1",
      type: "amazon_search",
      createdAt: "2026-04-23T09:00:00.000Z",
      params: {
        keyword: "iPhone 15",
      },
    },
  ])
  const sink = new CapturingResultSink()
  const worker = new BrowserTaskWorker(source, sink, createMockBrowserTaskHandlers())

  const execution = await worker.runOnce()

  assert.equal(execution.claimed, true)
  assert.equal(execution.result?.status, "completed")
  assert.equal(sink.results.length, 1)
  assert.equal(sink.results[0]?.status, "completed")
  assert.deepEqual(sink.results[0]?.output, {
    keyword: "iPhone 15",
    items: [
      {
        title: "Mock result for iPhone 15",
        rank: 1,
      },
    ],
  })
})

test("browser worker reports failed result when handler is missing", async () => {
  const source = new InMemoryTaskSource([
    {
      browserTaskId: "browser-task-2",
      parentTaskId: "task-2",
      type: "unknown_task",
      createdAt: "2026-04-23T09:00:00.000Z",
      params: {},
    },
  ])
  const sink = new CapturingResultSink()
  const worker = new BrowserTaskWorker(source, sink, createMockBrowserTaskHandlers())

  const execution = await worker.runOnce()

  assert.equal(execution.claimed, true)
  assert.equal(execution.result?.status, "failed")
  assert.match(execution.result?.error || "", /No browser task handler registered/)
  assert.equal(sink.results[0]?.status, "failed")
})
