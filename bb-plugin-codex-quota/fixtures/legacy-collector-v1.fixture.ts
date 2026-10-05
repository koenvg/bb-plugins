// A literal keeps installed code independent of host-bundler helpers.
// Bounded object-identity confirmation adapted from MIT OpenForge Codex Usage. See LICENSE.collector.
export const COLLECTOR_ENTRY = String.raw`/*
MIT License. Copyright (c) OpenForge Codex Usage contributors.
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/ function collectorExtension(pi, configuration) {
  let queue = Promise.resolve(), pending = 0;
  const confirmations = new Map();
  const scalar = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;
  const tokens = value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const diagnostic = () => console.error("[bb-codex-usage] Collector work incomplete");
  const enqueue = work => { pending++; queue = queue.then(work).catch(diagnostic).finally(() => { pending--; }); return queue; };
  async function enabled(fs, constants, directory) {
    const parent = await fs.lstat(directory);
    if (!parent.isDirectory() || parent.isSymbolicLink()) return false;
    const control = await fs.open(directory + "/collector-control-v1.json", constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await control.stat(); if (!stat.isFile() || stat.size > 1024) return false;
      const bytes = Buffer.alloc(1025), result = await control.read(bytes, 0, bytes.length, 0);
      if (result.bytesRead > 1024) return false;
      const value = JSON.parse(bytes.subarray(0, result.bytesRead).toString("utf8"));
      return value && Object.keys(value).length === 2 && value.protocol === configuration.protocol && value.enabled === true;
    } finally { await control.close(); }
  }
  async function append(name, record) {
    const fs = await import("node:fs/promises"), { constants } = await import("node:fs"), { join } = await import("node:path");
    const directory = join(configuration.dataDir, "history");
    if (!await enabled(fs, constants, directory)) return false;
    const text = JSON.stringify(record) + "\n";
    if (Buffer.byteLength(text) > 64 * 1024) return false;
    const destination = await fs.open(join(directory, name), constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    try { if (!(await destination.stat()).isFile()) return false; await destination.writeFile(text, "utf8"); }
    finally { await destination.close(); }
    return true;
  }
  pi.on("message_end", (event, ctx) => {
    try {
      const message = event.message;
      if (!message || message.role !== "assistant" || message.provider !== "openai-codex") return;
      if (pending >= 128) { diagnostic(); return; }
      const usage = message.usage;
      if (!usage || !ctx || !ctx.sessionManager || typeof ctx.sessionManager.getSessionId !== "function") return;
      const inputTokens = tokens(usage.input), outputTokens = tokens(usage.output), cacheReadTokens = tokens(usage.cacheRead), cacheWriteTokens = tokens(usage.cacheWrite), totalTokens = tokens(usage.totalTokens), reasoningTokens = tokens(usage.reasoning === undefined ? 0 : usage.reasoning);
      const workspace = scalar(ctx.cwd, 16_384), sessionId = scalar(ctx.sessionManager.getSessionId(), 256), model = scalar(message.model, 128);
      if (!workspace || !sessionId || !model || [inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens, reasoningTokens].includes(null) || !Number.isFinite(message.timestamp) || Math.abs(message.timestamp) > 8.64e15) return;
      const occurredAt = new Date(message.timestamp).toISOString();
      if (!/^\d{4}-/.test(occurredAt)) return;
      const capturedCost = usage.cost && typeof usage.cost.total === "number" && Number.isFinite(usage.cost.total) && usage.cost.total > 0 && usage.cost.total <= 1e9 ? usage.cost.total : null;
      const claim = scalar(process.env.BB_THREAD_ID, 128);
      const sessionFile = scalar(ctx.sessionManager.getSessionFile && ctx.sessionManager.getSessionFile(), 16_384);
      return enqueue(async () => {
        const fs = await import("node:fs/promises"), { basename, isAbsolute, normalize } = await import("node:path"), { randomUUID } = await import("node:crypto");
        if (!isAbsolute(workspace)) return;
        let path = normalize(workspace); try { path = await fs.realpath(path); } catch {}
        const key = sessionFile ? scalar(basename(sessionFile), 256) : null;
        const record = { version: 1, eventId: randomUUID(), provenance: "observed", occurredAt, sessionId, workspace: path,
          providerSessionKey: key && key.endsWith(".jsonl") && key !== ".jsonl" ? key : null,
          claimedThreadId: claim && /^thr_[A-Za-z0-9_-]{1,124}$/.test(claim) ? claim : null,
          provider: "openai-codex", model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, totalTokens, capturedCost };
        if (await append("events-v1.jsonl", record)) {
          confirmations.set(message, { version: 1, eventId: record.eventId, sessionId });
          while (confirmations.size > 128) confirmations.delete(confirmations.keys().next().value);
        }
      });
    } catch { diagnostic(); }
  });
  async function confirm(_event, ctx) {
    await queue;
    try {
      const session = ctx.sessionManager;
      let id = session.getLeafId && session.getLeafId();
      for (let reads = 0; id && reads < 128; reads++) {
        const entry = session.getEntry(id); if (!entry) break;
        const evidence = entry.type === "message" && confirmations.get(entry.message);
        const entryId = scalar(entry.id, 256);
        if (evidence && entryId && evidence.sessionId === session.getSessionId()) {
          const binding = { ...evidence, entryId };
          // Only a persisted entry containing the exact captured object confirms identity.
          await enqueue(async () => { if (await append("confirmations-v1.jsonl", binding)) confirmations.delete(entry.message); });
        }
        id = entry.parentId;
      }
    } catch { diagnostic(); }
  }
  pi.on("turn_end", confirm);
  pi.on("agent_end", confirm);
  pi.on("session_shutdown", async (event, ctx) => { await confirm(event, ctx); await queue; confirmations.clear(); });
}`;
