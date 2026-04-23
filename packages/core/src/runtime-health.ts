export function computeRuntimeHealth(
  params: {
    sessionState: string
  },
  isAlive: boolean,
): "online" | "busy" | "offline" | "error" {
  if (params.sessionState === "error") {
    return "error"
  }

  if (!isAlive) {
    return "offline"
  }

  if (params.sessionState === "busy") {
    return "busy"
  }

  return "online"
}
