import assert from "node:assert/strict"
import test from "node:test"
import { gzipSync } from "node:zlib"

import { createControlPlaneServer } from "./server.js"

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const { server } = createControlPlaneServer()
  await new Promise<void>((resolve) => server.listen(0, resolve))

  try {
    const address = server.address()
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address")
    }

    return await fn(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

test("control-plane server handles create task and list tasks", async () => {
  await withServer(async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Analyze campaign",
        agentId: "agent-1",
        requireApproval: true,
      }),
    })
    assert.equal(createResponse.status, 201)
    const createPayload = (await createResponse.json()) as {
      task: {
        title: string
      }
    }
    assert.equal(createPayload.task.title, "Analyze campaign")

    const listResponse = await fetch(`${baseUrl}/tasks`)
    assert.equal(listResponse.status, 200)
    const listPayload = (await listResponse.json()) as {
      tasks: unknown[]
    }
    assert.equal(listPayload.tasks.length, 1)
  })
})

test("control-plane server runs completion approval flow end to end", async () => {
  await withServer(async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Publish weekly report",
        agentId: "agent-7",
        requireApproval: true,
      }),
    })
    const createPayload = (await createResponse.json()) as {
      task: {
        id: string
      }
    }
    const taskId = createPayload.task.id

    const runResponse = await fetch(`${baseUrl}/tasks/${taskId}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        runtimeRunId: "run-7",
        messageId: "session-7",
      }),
    })
    assert.equal(runResponse.status, 201)

    const eventResponse = await fetch(`${baseUrl}/runtime-events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        probeId: "probe-1",
        sessionId: "session-7",
        agentId: "agent-7",
        runtimeRunId: "run-7",
        eventType: "assistant",
        content: "Weekly report is ready\n[TASK_COMPLETE]",
        eventAt: "2026-04-22T10:05:00.000Z",
      }),
    })
    assert.equal(eventResponse.status, 202)

    const approvalsResponse = await fetch(`${baseUrl}/approvals`)
    assert.equal(approvalsResponse.status, 200)
    const approvalsPayload = (await approvalsResponse.json()) as {
      approvals: Array<{
        id: string
        resolutionAction: string
      }>
    }
    assert.equal(approvalsPayload.approvals.length, 1)
    assert.equal(approvalsPayload.approvals[0]?.resolutionAction, "complete_task")

    const approvalId = approvalsPayload.approvals[0]!.id
    const resolveResponse = await fetch(`${baseUrl}/approvals/${approvalId}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "approved",
        response: "Publish it",
      }),
    })
    assert.equal(resolveResponse.status, 200)

    const taskResponse = await fetch(`${baseUrl}/tasks/${taskId}`)
    assert.equal(taskResponse.status, 200)
    const taskPayload = (await taskResponse.json()) as {
      task: {
        workflowState: string
      }
    }
    assert.equal(taskPayload.task.workflowState, "COMPLETED")

    const healthResponse = await fetch(`${baseUrl}/health`)
    assert.equal(healthResponse.status, 200)
    const healthPayload = (await healthResponse.json()) as {
      status: string
      tasks: number
      approvals: number
    }
    assert.equal(healthPayload.status, "ok")
    assert.equal(healthPayload.tasks, 1)
    assert.equal(healthPayload.approvals, 1)
  })
})

test("control-plane server supports probe-style runtime agent, heartbeat, and raw batch ingest", async () => {
  await withServer(async (baseUrl) => {
    const registerResponse = await fetch(`${baseUrl}/runtime/agents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agentId: "agent-probe-1",
        slug: "demo-agent",
        probeId: "probe-1",
        sessionsDir: "/tmp/demo-agent/sessions",
      }),
    })
    assert.equal(registerResponse.status, 201)

    const agentsResponse = await fetch(`${baseUrl}/runtime/agents?probeId=probe-1`)
    assert.equal(agentsResponse.status, 200)
    const agentsPayload = (await agentsResponse.json()) as {
      agents: Array<{
        agentId: string
        slug: string
      }>
    }
    assert.equal(agentsPayload.agents.length, 1)
    assert.equal(agentsPayload.agents[0]?.slug, "demo-agent")

    const heartbeatResponse = await fetch(`${baseUrl}/runtime/heartbeats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        probeId: "probe-1",
        timestamp: "2026-04-23T08:10:00.000Z",
        status: "alive",
        agents: [
          {
            agentId: "agent-probe-1",
            agentSlug: "demo-agent",
            sessionFile: "/tmp/demo-agent/sessions/session-probe-1.jsonl",
            hasSession: true,
          },
        ],
      }),
    })
    assert.equal(heartbeatResponse.status, 202)

    const taskResponse = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Check probe batch flow",
        agentId: "agent-probe-1",
        requireApproval: true,
      }),
    })
    const taskPayload = (await taskResponse.json()) as {
      task: {
        id: string
      }
    }

    const runResponse = await fetch(`${baseUrl}/tasks/${taskPayload.task.id}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        runtimeRunId: "run-probe-1",
        messageId: "session-probe-1",
      }),
    })
    assert.equal(runResponse.status, 201)

    const batchPayload = gzipSync(
      JSON.stringify({
        probeId: "probe-1",
        sessionFile: "/tmp/demo-agent/sessions/session-probe-1.jsonl",
        agentId: "agent-probe-1",
        timestamp: "2026-04-23T08:11:00.000Z",
        rawDataList: [
          JSON.stringify({
            type: "message",
            timestamp: "2026-04-23T08:11:00.000Z",
            runId: "run-probe-1",
            message: {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Ready for approval\n[APPROVAL_REQUEST] Review output | Approve publish",
                },
              ],
            },
          }),
        ],
      }),
    )

    const batchResponse = await fetch(`${baseUrl}/runtime-events/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
      },
      body: batchPayload,
    })
    assert.equal(batchResponse.status, 202)
    const batchResult = (await batchResponse.json()) as {
      accepted: number
      parsed: number
      handled: number
    }
    assert.deepEqual(batchResult, {
      accepted: 1,
      parsed: 1,
      handled: 1,
    })

    const approvalsResponse = await fetch(`${baseUrl}/approvals`)
    const approvalsPayload = (await approvalsResponse.json()) as {
      approvals: unknown[]
    }
    assert.equal(approvalsPayload.approvals.length, 1)
  })
})
