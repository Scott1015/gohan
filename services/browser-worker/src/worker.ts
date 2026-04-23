import type {
  BrowserTaskExecutionRequest,
  BrowserTaskExecutionResult,
  BrowserWorkerArtifact,
  BrowserWorkerLogEntry,
  JsonValue,
} from "@gohan/contracts"

export interface BrowserTaskSourcePort {
  claimNextTask(): Promise<BrowserTaskExecutionRequest | null>
}

export interface BrowserTaskResultPort {
  reportResult(result: BrowserTaskExecutionResult): Promise<void>
}

export interface BrowserTaskHandlerOutput {
  summary?: string
  output?: JsonValue
  logs?: BrowserWorkerLogEntry[]
  artifacts?: BrowserWorkerArtifact[]
}

export type BrowserTaskHandler = (
  task: BrowserTaskExecutionRequest,
) => Promise<BrowserTaskHandlerOutput>

export interface BrowserTaskWorkerResult {
  claimed: boolean
  result?: BrowserTaskExecutionResult
}

export class BrowserTaskWorker {
  constructor(
    private readonly source: BrowserTaskSourcePort,
    private readonly sink: BrowserTaskResultPort,
    private readonly handlers: Record<string, BrowserTaskHandler>,
  ) {}

  async runOnce(): Promise<BrowserTaskWorkerResult> {
    const task = await this.source.claimNextTask()
    if (!task) {
      return { claimed: false }
    }

    const startedAt = new Date().toISOString()
    const handler = this.handlers[task.type]
    let result: BrowserTaskExecutionResult

    if (!handler) {
      result = {
        browserTaskId: task.browserTaskId,
        status: "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        error: `No browser task handler registered for type ${task.type}`,
      }
    } else {
      try {
        const output = await handler(task)
        result = {
          browserTaskId: task.browserTaskId,
          status: "completed",
          startedAt,
          completedAt: new Date().toISOString(),
          ...(output.summary ? { summary: output.summary } : {}),
          ...(output.output !== undefined ? { output: output.output } : {}),
          ...(output.logs ? { logs: output.logs } : {}),
          ...(output.artifacts ? { artifacts: output.artifacts } : {}),
        }
      } catch (error) {
        result = {
          browserTaskId: task.browserTaskId,
          status: "failed",
          startedAt,
          completedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }

    await this.sink.reportResult(result)
    return {
      claimed: true,
      result,
    }
  }
}

export function createMockBrowserTaskHandlers(): Record<string, BrowserTaskHandler> {
  return {
    amazon_search: async (task) => {
      const keyword =
        task.params && typeof task.params.keyword === "string" ? task.params.keyword : "unknown"
      return {
        summary: `Mock browser task completed for ${task.type}`,
        output: {
          keyword,
          items: [
            {
              title: `Mock result for ${keyword}`,
              rank: 1,
            },
          ],
        },
        logs: [
          {
            level: "info",
            message: `Handled ${task.type}`,
            at: new Date().toISOString(),
          },
        ],
      }
    },
  }
}
