import { randomUUID } from "node:crypto";
import { z } from "zod";
import { boundedValue, type Capture } from "../../subagents-contract.js";

export interface CaptureTarget {
  id: string;
  kind: "subagent" | "workflow" | "step" | "host-step";
  asyncId: string;
  childId?: string;
  sessionId: string;
  sessionFile: string;
  generation: number;
  terminal?: boolean;
}
const replySchema = z.object({
  kind: z.literal("pi-subagents.inspect-reply"),
  version: z.literal(1),
  requestId: z.string(),
  asyncId: z.string().optional(),
  childId: z.string().optional(),
  task: z.string().max(2000).optional(),
  finalOutput: z.string().max(8000).optional(),
  messages: z
    .array(
      z.object({
        role: z.string().max(80),
        kind: z.enum(["text", "toolCall", "toolResult"]),
        text: z.string().max(1000),
        name: z.string().min(1).max(160).optional(),
        isError: z.boolean().optional(),
      }),
    )
    .max(200)
    .optional(),
  truncated: z
    .object({
      task: z.boolean(),
      finalOutput: z.boolean(),
      messages: z.number().int().nonnegative(),
    })
    .optional(),
  error: z.object({ code: z.string().max(80), message: z.string().max(1000) }).optional(),
});
export function normalizeCapture(
  raw: unknown,
  target: CaptureTarget,
  requestId: string,
  now: number,
): Capture {
  if (!boundedValue(raw, 64 * 1024))
    return {
      status: "unavailable",
      capturedAt: now,
      reason: "Inspection exceeds its size or depth limit",
    };
  const parsed = replySchema.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.requestId !== requestId ||
    parsed.data.asyncId !== target.asyncId ||
    parsed.data.childId !== target.childId
  )
    return { status: "stale", capturedAt: now, reason: "Malformed or unmatched inspection reply" };
  const r = parsed.data;
  if (r.error)
    return {
      status: r.error.code === "stale" ? "stale" : "unavailable",
      capturedAt: now,
      reason: r.error.message.slice(0, 500),
    };
  const omitted = Math.max(0, (r.messages?.length ?? 0) - 20);
  return {
    status: "captured",
    capturedAt: now,
    task: r.task,
    finalOutput: r.finalOutput,
    messages: r.messages?.slice(-20),
    truncated: {
      task: r.truncated?.task ?? false,
      finalOutput: r.truncated?.finalOutput ?? false,
      messages: (r.truncated?.messages ?? 0) + omitted,
    },
  };
}
export function createCaptureQueue(options: {
  inspect: (target: CaptureTarget, requestId: string) => Promise<unknown>;
  resolveModel?: (target: CaptureTarget, signal: AbortSignal) => Promise<Capture["resolvedModel"]>;
  current?: (target: CaptureTarget) => boolean;
  accept: (id: string, capture: Capture, target: CaptureTarget) => void;
  now?: () => number;
  rateMs?: number;
  timeoutMs?: number;
}) {
  const now = options.now ?? Date.now;
  const queue = new Map<string, CaptureTarget>();
  let nextReadAt = 0;
  function pause(delay: number): Promise<void> {
    {
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      try {
        const finish = () => {
          clearTimeout(timer);
          waiting.delete(finish);
          resolve();
        };
        const timer = setTimeout(finish, delay);
        timer.unref?.();
        waiting.add(finish);
      } catch (setupError) {
        reject(setupError);
      }
      return promise;
    }
  }
  let disposed = false;
  let inFlight: Promise<void> | undefined;
  const waiting = new Set<() => void>();
  let activeAbort: AbortController | undefined;
  const current = (target: CaptureTarget) => !disposed && options.current?.(target) !== false;

  async function modelWithinBudget(
    target: CaptureTarget,
    controller: AbortController,
    budget: number,
  ): Promise<Capture["resolvedModel"]> {
    const deadline = performance.now() + budget;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const lookup = options.resolveModel?.(target, controller.signal);
      const expired = Promise.withResolvers<undefined>();
      timer = setTimeout(() => {
        controller.abort();
        expired.resolve(undefined);
      }, budget);
      timer.unref?.();
      const model = await Promise.race([lookup, expired.promise]);
      if (model && current(target) && !controller.signal.aborted && performance.now() <= deadline) {
        return model;
      }
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
    return undefined;
  }
  function start() {
    const work = Promise.withResolvers<void>();
    inFlight = work.promise;
    const advance = async () => {
      try {
        if (disposed || queue.size === 0) {
          inFlight = undefined;
          work.resolve();
          return;
        }
        const remaining = nextReadAt - now();
        if (remaining > 0) await pause(remaining);
        if (disposed) {
          inFlight = undefined;
          work.resolve();
          return;
        }
        nextReadAt = now() + (options.rateMs ?? 750);
        const target = [...queue.values()].find((t) => t.terminal) ?? queue.values().next().value;
        if (!target) {
          inFlight = undefined;
          work.resolve();
          return;
        }
        queue.delete(target.id);
        if (current(target)) {
          const startedAt = performance.now();
          const controller = new AbortController();
          activeAbort = controller;
          const requestId = randomUUID();
          let timeout: ReturnType<typeof setTimeout> | undefined;
          let capture: Capture;
          try {
            const raw = await Promise.race([
              options.inspect(target, requestId),
              (() => {
                const { promise, reject } = Promise.withResolvers<never>();
                try {
                  timeout = setTimeout(
                    () => reject(new Error("Inspection timed out")),
                    options.timeoutMs ?? 5000,
                  );
                  timeout.unref?.();
                } catch (setupError) {
                  reject(setupError);
                }
                return promise;
              })(),
            ]);
            capture = normalizeCapture(raw, target, requestId, now());
            if (capture.status === "captured" && options.resolveModel && current(target)) {
              const budget = Math.min(
                250,
                (options.timeoutMs ?? 5000) - (performance.now() - startedAt),
              );
              if (budget > 0) {
                const model = await modelWithinBudget(target, controller, budget);
                if (model) capture = { ...capture, resolvedModel: model };
              }
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "Inspection unavailable";
            capture = {
              status: /timed out|in time/i.test(message)
                ? "timeout"
                : /unsupported|capability/i.test(message)
                  ? "unsupported"
                  : "unavailable",
              capturedAt: now(),
              reason: message.slice(0, 500),
            };
          } finally {
            clearTimeout(timeout);
            controller.abort();
            activeAbort = undefined;
          }
          if (current(target)) options.accept(target.id, capture, target);
        }
        void advance();
      } catch (error) {
        inFlight = undefined;
        work.reject(error);
      }
    };
    void advance();
  }
  return {
    enqueue(target: CaptureTarget) {
      if (!current(target)) return;
      if (queue.size >= 8 && !queue.has(target.id)) {
        if (!target.terminal) {
          options.accept(
            target.id,
            {
              status: "not-captured",
              capturedAt: now(),
              reason: "Inspection queue limit reached",
            },
            target,
          );
          return;
        }
        const optional = [...queue.values()].find((t) => !t.terminal);
        if (!optional) {
          options.accept(
            target.id,
            {
              status: "not-captured",
              capturedAt: now(),
              reason: "Inspection queue limit reached",
            },
            target,
          );
          return;
        }
        queue.delete(optional.id);
        options.accept(
          optional.id,
          {
            status: "not-captured",
            capturedAt: now(),
            reason: "Terminal inspection took priority",
          },
          optional,
        );
      }
      queue.set(target.id, target);
      if (!inFlight) start();
    },
    async drain() {
      await inFlight;
    },
    dispose() {
      disposed = true;
      activeAbort?.abort();
      queue.clear();
      for (const finish of waiting) finish();
    },
  };
}
