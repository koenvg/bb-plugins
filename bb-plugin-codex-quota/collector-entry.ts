// A literal keeps the installed code independent of host-bundler helper functions.
// Exercise this exact code through Pi's public loader in the packaged test.
export const COLLECTOR_ENTRY = String.raw`function collectorExtension(pi, configuration) {
  let queue = Promise.resolve();
  let pending = 0;
  const scalar = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value) ? value : null;
  const tokens = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  pi.on("message_end", (event, ctx) => {
    const message = event.message;
    if (!message || message.role !== "assistant" || message.provider !== "openai-codex" || pending >= 128) return;
    const usage = message.usage;
    if (!usage || !usage.cost || !ctx || !ctx.sessionManager || typeof ctx.sessionManager.getSessionId !== "function") return;
    const inputTokens = tokens(usage.input), outputTokens = tokens(usage.output), cacheReadTokens = tokens(usage.cacheRead), cacheWriteTokens = tokens(usage.cacheWrite), totalTokens = tokens(usage.totalTokens), reasoningTokens = tokens(usage.reasoning === undefined ? 0 : usage.reasoning);
    const workspace = scalar(ctx.cwd, 16_384), sessionId = scalar(ctx.sessionManager.getSessionId(), 256), model = scalar(message.model, 128);
    if (!workspace || !sessionId || !model || [inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens, reasoningTokens].includes(null) || !Number.isFinite(message.timestamp) || Math.abs(message.timestamp) > 8.64e15) return;
    const occurredAt = new Date(message.timestamp).toISOString();
    const capturedCost = typeof usage.cost.total === "number" && Number.isFinite(usage.cost.total) && usage.cost.total > 0 && usage.cost.total <= 1e9 ? usage.cost.total : null;
    const claimedThreadId = scalar(process.env.BB_THREAD_ID, 128);
    const sessionFile = scalar(ctx.sessionManager.getSessionFile && ctx.sessionManager.getSessionFile(), 16_384);
    pending++;
    queue = queue.then(async () => {
      const fs = await import("node:fs/promises");
      const { constants } = await import("node:fs");
      const { join, basename, isAbsolute } = await import("node:path");
      const { randomUUID } = await import("node:crypto");
      if (!isAbsolute(workspace)) return;
      const directory = join(configuration.dataDir, "history");
      const parent = await fs.lstat(directory);
      if (!parent.isDirectory() || parent.isSymbolicLink()) return;
      const control = await fs.open(join(directory, "collector-control-v1.json"), constants.O_RDONLY | constants.O_NOFOLLOW);
      let enabled = false;
      try {
        const stat = await control.stat();
        if (!stat.isFile() || stat.size > 1024) return;
        const bytes = Buffer.alloc(1025);
        const { bytesRead } = await control.read(bytes, 0, bytes.length, 0);
        if (bytesRead > 1024) return;
        const value = JSON.parse(bytes.subarray(0, bytesRead).toString("utf8"));
        enabled = value && Object.keys(value).length === 2 && value.protocol === configuration.protocol && value.enabled === true;
      } finally { await control.close(); }
      if (!enabled) return;
      const record = {
        version: 1, eventId: randomUUID(), provenance: "observed", occurredAt, sessionId, workspace,
        providerSessionKey: sessionFile ? scalar(basename(sessionFile), 256) : null,
        claimedThreadId: claimedThreadId && /^thr_[A-Za-z0-9_-]+$/.test(claimedThreadId) ? claimedThreadId : null,
        provider: "openai-codex", model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, totalTokens, capturedCost
      };
      const destination = await fs.open(join(directory, "events-v1.jsonl"), constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
      try { await destination.writeFile(JSON.stringify(record) + "\n", "utf8"); }
      finally { await destination.close(); }
    }).catch(() => { /* Fail closed. No raw error, path, credential or message logging. */ }).finally(() => { pending--; });
    return queue;
  });
  pi.on("session_shutdown", async () => { await queue; });
}`;
