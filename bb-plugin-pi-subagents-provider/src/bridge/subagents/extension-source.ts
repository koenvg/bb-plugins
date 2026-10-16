/** Injected only into this provider's Pi process. No subagents import or activation. */
export const SUBAGENT_STATUS_SOURCE = String.raw`
function installSubagentStatusChannel(pi, getContext, hint) {
  let sequence = 0;
  let closed = false;
  const pending = new Set();
  const unsubscribes = [];
  const session = () => {
    const manager = getContext()?.sessionManager;
    return { sessionId: manager?.getSessionId?.(), sessionFile: manager?.getSessionFile?.() };
  };
  function rpc(method) {
    if (closed || !pi.events?.on || !pi.events?.emit) return Promise.reject(new Error("Subagent RPC unavailable"));
    const requestId = "bb-observe-" + process.pid + "-" + (++sequence);
    return new Promise((resolve, reject) => {
      let unsubscribe;
      let finished = false;
      const finish = (error, data) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (typeof unsubscribe === "function") unsubscribe();
        pending.delete(cancel);
        if (error) reject(error); else resolve(data);
      };
      const cancel = () => finish(new Error("Subagent observation disposed"));
      const timer = setTimeout(() => finish(new Error("Subagent RPC timed out")), 1000);
      timer.unref?.();
      pending.add(cancel);
      unsubscribe = pi.events.on("subagents:rpc:v1:reply:" + requestId, (reply) => {
        if (reply?.requestId !== requestId || reply?.version !== 1 || reply?.method !== method) return;
        if (reply.success !== true) return finish(new Error("Subagent RPC failed"));
        finish(null, reply.data);
      });
      try { pi.events.emit("subagents:rpc:v1:request", { version: 1, requestId, method, source: { extension: "bb-pi-subagents-observer" } }); }
      catch (error) { finish(error); }
    });
  }
  if (pi.events?.on) {
    for (const event of ["subagents:rpc:v1:ready", "subagent:async-started", "subagent:async-complete", "subagent:child-status", "subagent:process-terminal"]) {
      const unsubscribe = pi.events.on(event, (raw) => {
        if (closed) return;
        if (event !== "subagent:async-started" && event !== "subagent:async-complete") return hint();
        const text = (v) => typeof v === "string" && v.length <= 4096 ? v : undefined;
        const unsupported = (v) => !v || typeof v !== "object" || ["parentWorkflowRunId", "workflowKey", "workflowGraph", "nestedSelf", "isNested", "nestedChildren", "runner", "externalProcess", "externalJob", "machine", "placement", "revivalLease", "revivalLeaseToken", "children", "error", "interrupted", "timedOut", "stopped", "skipped", "processSignal"].some((key) => v[key] !== undefined && v[key] !== false && v[key] !== null);
        const route = raw?.nestedRoute;
        const routeValid = route !== null && typeof route === "object" && !Array.isArray(route) && ["rootRunId", "eventSink", "controlInbox", "capabilityToken"].every((key) => typeof route[key] === "string" && route[key].length > 0 && route[key].length <= 4096);
        const child = Array.isArray(raw?.results) && raw.results.length === 1 ? raw.results[0] : undefined;
        const evidence = { ...session(), event, id: text(event === "subagent:async-started" ? raw?.id : raw?.runId), owner: text(raw?.sessionId), mode: text(raw?.mode), unsupported: unsupported(raw) || (route !== undefined && !routeValid) || (event === "subagent:async-complete" && (unsupported(child) || child?.nestedRoute !== undefined)), sessionRoot: text(raw?.sessionRoot), routeRootId: routeValid ? text(route.rootRunId) : undefined };
        if (event === "subagent:async-complete") Object.assign(evidence, {
          success: raw?.success === true, state: text(raw?.state), timestamp: Number.isSafeInteger(raw?.timestamp) ? raw.timestamp : undefined, durationMs: Number.isSafeInteger(raw?.durationMs) ? raw.durationMs : undefined,
          count: Array.isArray(raw?.results) ? raw.results.length : undefined,
          child: child ? { index: child.index === 0 ? 0 : undefined, context: text(child.context), success: child.success === true, sessionFile: text(child.sessionFile), sessionPath: text(child.sessionPath) } : undefined,
        });
        hint(evidence);
      });
      if (typeof unsubscribe === "function") unsubscribes.push(unsubscribe);
    }
  }
  // Block fallback if the reserved command disappears before Pi handles it.
  pi.on("input", (event) => {
    if (event.source === "rpc" && /^\/subagents-inspect-rpc(?:\s|$)/.test(event.text)) return { action: "handled" };
  });
  pi.on("session_shutdown", () => {
    closed = true;
    for (const cancel of pending) cancel();
    for (const unsubscribe of unsubscribes) unsubscribe();
  });
  const read = async () => {
    const before = session();
    if (!before.sessionId || !before.sessionFile) throw new Error("Subagent session identity unavailable");
    const ping = await rpc("ping");
    if (ping?.version !== 1 || ping?.session?.sessionId !== before.sessionId || ping?.session?.sessionFile !== before.sessionFile || ping?.capabilities?.asyncStatusSnapshot?.version !== 1 || ping?.capabilities?.statusProjection?.version !== 1 || !ping?.methods?.includes("status")) throw new Error("Subagent status capability unavailable");
    const status = await rpc("status");
    const after = session();
    if (after.sessionId !== before.sessionId || after.sessionFile !== before.sessionFile) throw new Error("Subagent session replaced during read");
    const result = { ...before, ping, status };
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > 128 * 1024) throw new Error("Subagent status exceeds byte limit");
    return result;
  };
  read.inspectionContext = () => ({ ...session(), guard: !closed, command: !closed && pi.getCommands?.().some((command) => command.name === "subagents-inspect-rpc" && command.source === "extension") === true });
  return read;
}
`;
