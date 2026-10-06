import { expect, it, vi } from "vitest";
import { createInspectionChannel, INSPECTION_PREFIX } from "./inspection-channel.js";
const target = {
  id: "row",
  asyncId: "owned-run",
  sessionId: "pi",
  sessionFile: "/owned/session",
  generation: 1,
};
const context = { sessionId: "pi", sessionFile: "/owned/session", command: true, guard: true };
it("checks capability and session before command dispatch without a prompt fallback", async () => {
  const command = vi.fn(async () => ({ disposition: "handled" }));
  const q = createInspectionChannel({
    context: async () => ({ ...context, command: false }),
    command,
    current: () => true,
  });
  await expect(q.inspect(target, "req")).rejects.toThrow("capability");
  expect(command).not.toHaveBeenCalled();
});
it("requires handled acknowledgement and a correlated widget in the same session", async () => {
  const q = createInspectionChannel({
    context: async () => context,
    command: async () => {
      q.widget({
        method: "setWidget",
        widgetKey: "subagent-inspect",
        widgetLines: [
          INSPECTION_PREFIX + JSON.stringify({ requestId: "req", asyncId: "owned-run" }),
        ],
      });
      q.widget({ method: "setWidget", widgetKey: "subagent-inspect" });
      return { disposition: "handled" };
    },
    current: () => true,
  });
  await expect(q.inspect(target, "req")).resolves.toMatchObject({ requestId: "req" });
  expect(q.widget({ method: "confirm" })).toBe(false);
  q.dispose();
  await expect(q.inspect(target, "req2")).rejects.toThrow("unavailable");
});
it("ignores foreign request IDs, rejects started prompts and invalidates replacement replies", async () => {
  let current = context;
  const q = createInspectionChannel({
    context: async () => current,
    command: async () => {
      q.widget({
        method: "setWidget",
        widgetKey: "subagent-inspect",
        widgetLines: [INSPECTION_PREFIX + JSON.stringify({ requestId: "foreign" })],
      });
      q.widget({
        method: "setWidget",
        widgetKey: "subagent-inspect",
        widgetLines: [
          INSPECTION_PREFIX + JSON.stringify({ requestId: "req", asyncId: "owned-run" }),
        ],
      });
      current = { ...context, sessionId: "replacement" };
      return { disposition: "handled" };
    },
    current: () => true,
  });
  await expect(q.inspect(target, "req")).rejects.toThrow("replaced");
  const wrong = createInspectionChannel({
    context: async () => context,
    command: async () => ({ disposition: "started" }),
    current: () => true,
  });
  await expect(wrong.inspect(target, "r")).rejects.toThrow("not confirmed handled");
  wrong.dispose();
});
it("bounds timeout and concurrent preflights, and cancels an awaiting widget on disposal", async () => {
  vi.useFakeTimers();
  try {
    const q = createInspectionChannel({
      context: async () => context,
      command: async () => ({ disposition: "handled" }),
      current: () => true,
    });
    const first = q.inspect(target, "r");
    const rejected = expect(first).rejects.toThrow("timed out");
    await expect(q.inspect(target, "other")).rejects.toThrow("unavailable");
    await vi.advanceTimersByTimeAsync(2501);
    await rejected;
    q.dispose();
    const next = createInspectionChannel({
      context: async () => context,
      command: async () => ({ disposition: "handled" }),
      current: () => true,
    });
    const p = next.inspect(target, "x");
    const canceled = expect(p).rejects.toThrow("disposed");
    await Promise.resolve();
    await Promise.resolve();
    next.dispose();
    await canceled;
  } finally {
    vi.useRealTimers();
  }
});
