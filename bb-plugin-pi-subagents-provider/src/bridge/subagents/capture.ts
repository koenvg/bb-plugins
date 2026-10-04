import { randomUUID } from "node:crypto";
import { z } from "zod";
import { boundedValue, type Capture } from "../../subagents-contract.js";

export interface CaptureTarget { id: string; asyncId: string; childId?: string; sessionId: string; sessionFile: string; generation: number; terminal?: boolean; }
const replySchema = z.object({
  kind: z.literal("pi-subagents.inspect-reply"), version: z.literal(1), requestId: z.string(), asyncId: z.string().optional(), childId: z.string().optional(),
  task: z.string().max(2000).optional(), finalOutput: z.string().max(8000).optional(),
  messages: z.array(z.object({ role: z.string().max(80), kind: z.enum(["text", "toolCall", "toolResult"]), text: z.string().max(1000) })).max(200).optional(),
  truncated: z.object({ task: z.boolean(), finalOutput: z.boolean(), messages: z.number().int().nonnegative() }).optional(),
  error: z.object({ code: z.string().max(80), message: z.string().max(1000) }).optional(),
});
export function normalizeCapture(raw: unknown, target: CaptureTarget, requestId: string, now: number): Capture {
  if (!boundedValue(raw, 64 * 1024)) return { status: "unavailable", capturedAt: now, reason: "Inspection exceeds its size or depth limit" };
  const parsed = replySchema.safeParse(raw);
  if (!parsed.success || parsed.data.requestId !== requestId || parsed.data.asyncId !== target.asyncId || parsed.data.childId !== target.childId) return { status: "stale", capturedAt: now, reason: "Malformed or unmatched inspection reply" };
  const r = parsed.data;
  if (r.error) return { status: r.error.code === "stale" ? "stale" : "unavailable", capturedAt: now, reason: r.error.message.slice(0,500) };
  const omitted = Math.max(0, (r.messages?.length ?? 0) - 20);
  return { status: "captured", capturedAt: now, task: r.task, finalOutput: r.finalOutput, messages: r.messages?.slice(-20), truncated: { task: r.truncated?.task ?? false, finalOutput: r.truncated?.finalOutput ?? false, messages: (r.truncated?.messages ?? 0) + omitted } };
}
export function createCaptureQueue(options: {
  inspect(target: CaptureTarget, requestId: string): Promise<unknown>;
  accept(id: string, capture: Capture): void; now?: () => number; rateMs?: number; timeoutMs?: number;
}) {
  const now = options.now ?? Date.now; const queue = new Map<string, CaptureTarget>();
  let nextReadAt = 0;
  function pause(delay: number): Promise<void> {
    return new Promise(resolve => { const finish = () => { clearTimeout(timer); waiting.delete(finish); resolve(); }; const timer = setTimeout(finish,delay); timer.unref?.(); waiting.add(finish); });
  }
  let disposed = false; let inFlight: Promise<void> | undefined;
  const waiting = new Set<() => void>();
  async function run() {
    while (!disposed && queue.size) {
      const remaining = nextReadAt - now();
      if (remaining > 0) await pause(remaining);
      if (disposed) break;
      nextReadAt = now() + (options.rateMs ?? 750);
      const target = [...queue.values()].find(t => t.terminal) ?? queue.values().next().value!;
      queue.delete(target.id); const requestId = randomUUID(); let timeout: ReturnType<typeof setTimeout> | undefined;
      let capture: Capture;
      try {
        const raw = await Promise.race([options.inspect(target, requestId), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Inspection timed out")), options.timeoutMs ?? 5000); timeout.unref?.(); })]);
        capture = normalizeCapture(raw, target, requestId, now());
      } catch (error) {
        const message = error instanceof Error ? error.message : "Inspection unavailable";
        capture = { status: /timed out|in time/i.test(message) ? "timeout" : /unsupported|capability/i.test(message) ? "unsupported" : "unavailable", capturedAt: now(), reason: message.slice(0,500) };
      } finally { clearTimeout(timeout); }
      if (disposed) break;
      options.accept(target.id, capture);
    }
  }
  return {
    enqueue(target: CaptureTarget) {
      if (disposed) return;
      if (queue.size >= 8 && !queue.has(target.id)) {
        if (!target.terminal) { options.accept(target.id, { status: "not-captured", capturedAt: now(), reason: "Inspection queue limit reached" }); return; }
        const optional = [...queue.values()].find(t => !t.terminal);
        if (!optional) { options.accept(target.id, { status: "not-captured", capturedAt: now(), reason: "Inspection queue limit reached" }); return; }
        queue.delete(optional.id); options.accept(optional.id, { status: "not-captured", capturedAt: now(), reason: "Terminal inspection took priority" });
      }
      queue.set(target.id, target);
      if (!inFlight) { const work = run(); inFlight = work; void work.finally(() => { if (inFlight === work) inFlight = undefined; }); }
    },
    async drain() { await inFlight; },
    dispose() { disposed = true; queue.clear(); for (const finish of waiting) finish(); },
  };
}
