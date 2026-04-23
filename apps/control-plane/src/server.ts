import http, { type IncomingMessage, type ServerResponse } from "node:http"
import { URL } from "node:url"
import { gunzipSync } from "node:zlib"

import { InMemoryControlPlaneService } from "./in-memory-control-plane.js"
import { parseProbeRawEventBatch } from "./probe-runtime-events.js"

type JsonBody = Record<string, unknown>

async function readJsonBody(request: IncomingMessage): Promise<JsonBody> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (chunks.length === 0) return {}
  const buffer = Buffer.concat(chunks)
  const rawBuffer =
    request.headers["content-encoding"] === "gzip" ? gunzipSync(buffer) : buffer
  const raw = rawBuffer.toString("utf-8").trim()
  if (!raw) return {}
  return JSON.parse(raw) as JsonBody
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  })
  response.end(body)
}

export function createControlPlaneServer(
  service: InMemoryControlPlaneService = new InMemoryControlPlaneService(),
) {
  const server = http.createServer(async (request, response) => {
    try {
      const method = request.method || "GET"
      const requestUrl = new URL(request.url || "/", "http://localhost")

      if (method === "GET" && requestUrl.pathname === "/health") {
        sendJson(response, 200, {
          status: "ok",
          tasks: service.listTasks().length,
          approvals: service.listApprovals().length,
          browserTasks: service.listBrowserTasks().length,
        })
        return
      }

      if (method === "GET" && requestUrl.pathname === "/tasks") {
        sendJson(response, 200, { tasks: service.listTasks() })
        return
      }

      if (method === "POST" && requestUrl.pathname === "/tasks") {
        const body = await readJsonBody(request)
        const task = service.createTask({
          taskId: typeof body.taskId === "string" ? body.taskId : undefined,
          title: String(body.title || ""),
          agentId: String(body.agentId || ""),
          requireApproval: body.requireApproval === true,
        })
        sendJson(response, 201, { task })
        return
      }

      const taskRunMatch = requestUrl.pathname.match(/^\/tasks\/([^/]+)\/runs$/)
      if (method === "POST" && taskRunMatch) {
        const body = await readJsonBody(request)
        const run = service.startTaskRun(taskRunMatch[1], {
          runId: typeof body.runId === "string" ? body.runId : undefined,
          startedAt: typeof body.startedAt === "string" ? body.startedAt : undefined,
          messageId: typeof body.messageId === "string" ? body.messageId : null,
          sessionKey: typeof body.sessionKey === "string" ? body.sessionKey : null,
          runtimeRunId: typeof body.runtimeRunId === "string" ? body.runtimeRunId : null,
          runtimeTaskId: typeof body.runtimeTaskId === "string" ? body.runtimeTaskId : null,
          runtimeFlowId: typeof body.runtimeFlowId === "string" ? body.runtimeFlowId : null,
        })
        sendJson(response, 201, { run })
        return
      }

      const taskMatch = requestUrl.pathname.match(/^\/tasks\/([^/]+)$/)
      if (method === "GET" && taskMatch) {
        const task = service.getTask(taskMatch[1])
        if (!task) {
          sendJson(response, 404, { error: "Task not found" })
          return
        }
        sendJson(response, 200, { task })
        return
      }

      if (method === "GET" && requestUrl.pathname === "/approvals") {
        sendJson(response, 200, { approvals: service.listApprovals() })
        return
      }

      const approvalResolveMatch = requestUrl.pathname.match(/^\/approvals\/([^/]+)\/resolve$/)
      if (method === "POST" && approvalResolveMatch) {
        const body = await readJsonBody(request)
        const approval = service.resolveApproval(approvalResolveMatch[1], {
          status: String(body.status || "pending") as never,
          response: typeof body.response === "string" ? body.response : undefined,
        })
        sendJson(response, 200, { approval })
        return
      }

      if (method === "GET" && requestUrl.pathname === "/browser-tasks") {
        sendJson(response, 200, { browserTasks: service.listBrowserTasks() })
        return
      }

      if (method === "GET" && requestUrl.pathname === "/runtime/agents") {
        const probeId = requestUrl.searchParams.get("probeId") || undefined
        sendJson(response, 200, {
          agents: service.listRuntimeAgents(probeId),
        })
        return
      }

      if (method === "POST" && requestUrl.pathname === "/runtime/agents") {
        const body = await readJsonBody(request)
        const agent = service.upsertRuntimeAgent({
          agentId: String(body.agentId || ""),
          slug: String(body.slug || body.agentId || ""),
          probeId: String(body.probeId || ""),
          sessionsDir: typeof body.sessionsDir === "string" ? body.sessionsDir : null,
        })
        sendJson(response, 201, { agent })
        return
      }

      if (method === "POST" && requestUrl.pathname === "/runtime/heartbeats") {
        const body = await readJsonBody(request)
        service.recordHeartbeat({
          probeId: String(body.probeId || ""),
          timestamp: String(body.timestamp || new Date().toISOString()),
          status: String(body.status || "alive"),
          agents: Array.isArray(body.agents)
            ? body.agents
                .filter((agent): agent is Record<string, unknown> => Boolean(agent) && typeof agent === "object")
                .map((agent) => ({
                  agentId: String(agent.agentId || ""),
                  agentSlug: typeof agent.agentSlug === "string" ? agent.agentSlug : undefined,
                  sessionFile: typeof agent.sessionFile === "string" ? agent.sessionFile : null,
                  hasSession: agent.hasSession === true,
                }))
            : [],
        })
        sendJson(response, 202, { accepted: true })
        return
      }

      if (method === "POST" && requestUrl.pathname === "/runtime-events") {
        const body = await readJsonBody(request)
        const result = await service.ingestRuntimeEvent({
          probeId: String(body.probeId || ""),
          sessionId: String(body.sessionId || ""),
          agentId: typeof body.agentId === "string" ? body.agentId : undefined,
          runtimeRunId: typeof body.runtimeRunId === "string" ? body.runtimeRunId : undefined,
          runtimeTaskId: typeof body.runtimeTaskId === "string" ? body.runtimeTaskId : undefined,
          runtimeFlowId: typeof body.runtimeFlowId === "string" ? body.runtimeFlowId : undefined,
          eventType: String(body.eventType || "assistant") as never,
          content: body.content,
          eventAt: String(body.eventAt || new Date().toISOString()),
        })
        sendJson(response, result.handled ? 202 : 404, { result })
        return
      }

      if (method === "POST" && requestUrl.pathname === "/runtime-events/batch") {
        const body = await readJsonBody(request)
        const events = parseProbeRawEventBatch({
          probeId: String(body.probeId || ""),
          sessionFile: typeof body.sessionFile === "string" ? body.sessionFile : undefined,
          rawDataList: Array.isArray(body.rawDataList)
            ? body.rawDataList.filter((item): item is string => typeof item === "string")
            : [],
          timestamp: typeof body.timestamp === "string" ? body.timestamp : undefined,
          agentId: typeof body.agentId === "string" ? body.agentId : undefined,
          agentSlug: typeof body.agentSlug === "string" ? body.agentSlug : undefined,
        })

        let handled = 0
        for (const event of events) {
          const result = await service.ingestRuntimeEvent(event)
          if (result.handled) handled += 1
        }

        sendJson(response, 202, {
          accepted: Array.isArray(body.rawDataList) ? body.rawDataList.length : 0,
          parsed: events.length,
          handled,
        })
        return
      }

      sendJson(response, 404, { error: "Not found" })
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  return { server, service }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 3100)
  const { server } = createControlPlaneServer()
  server.listen(port, () => {
    console.log(`Gohan control plane listening on http://localhost:${port}`)
  })
}
