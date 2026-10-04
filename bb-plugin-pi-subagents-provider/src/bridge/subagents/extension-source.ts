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
      const unsubscribe = pi.events.on(event, () => { if (!closed) hint(); });
      if (typeof unsubscribe === "function") unsubscribes.push(unsubscribe);
    }
  }
  pi.on("session_shutdown", () => {
    closed = true;
    for (const cancel of pending) cancel();
    for (const unsubscribe of unsubscribes) unsubscribe();
  });
  return async () => {
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
}
`;
