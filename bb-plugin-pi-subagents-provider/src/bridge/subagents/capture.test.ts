import { expect, it, vi } from "vitest";
import { createCaptureQueue, normalizeCapture, type CaptureTarget } from "./capture.js";
const target = (id = "run") => ({
  id,
  kind: "subagent" as const,
  asyncId: id,
  sessionId: "pi",
  sessionFile: "/owned/session",
  generation: 1,
});
const reply = (t: CaptureTarget, requestId: string) => ({
  kind: "pi-subagents.inspect-reply",
  version: 1,
  requestId,
  asyncId: t.asyncId,
  task: "read files",
  finalOutput: "answer",
  messages: [],
  truncated: { task: false, finalOutput: false, messages: 0 },
});
it("serializes, coalesces and correlates bounded capture without owning execution", async () => {
  let release!: () => void;
  const first = new Promise<void>((r) => {
    release = r;
  });
  const captures: unknown[] = [];
  const inspect = vi.fn(async (t, id) => {
    if (inspect.mock.calls.length === 1) await first;
    return reply(t, id);
  });
  const q = createCaptureQueue({
    inspect,
    accept: (_id, result) => captures.push(result),
    now: () => 1,
    rateMs: 0,
  });
  q.enqueue(target());
  q.enqueue(target("next"));
  q.enqueue(target("next"));
  expect(inspect).toHaveBeenCalledTimes(1);
  release();
  await q.drain();
  expect(inspect).toHaveBeenCalledTimes(2);
  expect(captures).toHaveLength(2);
  q.dispose();
});
it("rejects foreign and malformed captures and invalidates callbacks on disposal", async () => {
  const accepted = vi.fn();
  let release!: (v: unknown) => void;
  const q = createCaptureQueue({
    inspect: () =>
      new Promise((r) => {
        release = r;
      }),
    accept: accepted,
    rateMs: 0,
  });
  q.enqueue(target());
  q.dispose();
  release(reply(target(), "wrong"));
  await q.drain();
  expect(accepted).not.toHaveBeenCalled();
});
it("times out unavailable captures without accepting a late replacement payload", async () => {
  vi.useFakeTimers();
  try {
    const accepted = vi.fn();
    const q = createCaptureQueue({
      inspect: () => new Promise(() => {}),
      accept: accepted,
      timeoutMs: 20,
      rateMs: 0,
    });
    q.enqueue(target());
    await vi.advanceTimersByTimeAsync(21);
    await q.drain();
    expect(accepted.mock.calls[0]![1].status).toBe("timeout");
    q.dispose();
  } finally {
    vi.useRealTimers();
  }
});

it("retains supported inspection tool metadata without inferring a background model", () => {
  const raw = {
    ...reply(target(), "req"),
    messages: [
      { role: "assistant", kind: "toolCall", text: "<script>unsafe</script>", name: "bash" },
      { role: "toolResult", kind: "toolResult", text: "denied", name: "bash", isError: true },
    ],
  };
  const capture = normalizeCapture(raw, target(), "req", 10);
  expect(capture.status).toBe("captured");
  expect(capture.messages).toEqual(raw.messages);
  expect(capture.resolvedModel).toBeUndefined();
  expect(normalizeCapture(reply(target(), "req"), target(), "req", 10).status).toBe("captured");
  for (const foreign of [{ requestId: "foreign" }, { asyncId: "other" }, { childId: "other" }]) {
    expect(normalizeCapture({ ...raw, ...foreign }, target(), "req", 10).status).toBe("stale");
  }
  for (const metadata of [{ name: "x".repeat(161) }, { isError: "true" }]) {
    expect(
      normalizeCapture(
        { ...raw, messages: [{ ...raw.messages[0], ...metadata }] },
        target(),
        "req",
        10,
      ).status,
    ).toBe("stale");
  }
  expect(
    normalizeCapture({ ...raw, unknown: "x".repeat(64 * 1024) }, target(), "req", 10).status,
  ).toBe("unavailable");
  const bounded = normalizeCapture(
    {
      ...raw,
      messages: Array.from({ length: 25 }, () => raw.messages[1]),
      truncated: { task: false, finalOutput: false, messages: 3 },
    },
    target(),
    "req",
    10,
  );
  expect(bounded.messages).toHaveLength(20);
  expect(bounded.messages!.every((m) => m.name === "bash" && m.isError)).toBe(true);
  expect(bounded.truncated!.messages).toBe(8);
});

it.each(["throw", "timeout", "absent"])(
  "preserves the normalized inspection when optional evidence is %s",
  async (mode) => {
    const accepted: unknown[] = [];
    const q = createCaptureQueue({
      inspect: async (t, id) => ({
        ...reply(t, id),
        resolvedModel: { provider: "untrusted", model: "untrusted", capturedAt: 0 },
      }),
      resolveModel: async () => {
        if (mode === "throw") throw new Error("Owned optional read failed");
        if (mode === "timeout") return new Promise(() => {});
        return undefined;
      },
      accept: (_id, capture) => accepted.push(capture),
      now: () => 10,
      rateMs: 0,
      timeoutMs: 30,
    });
    q.enqueue(target());
    await q.drain();
    expect(accepted).toEqual([normalizeCapture(reply(target(), "req"), target(), "req", 10)]);
    q.dispose();
  },
);
it("enriches only after normalization and retains inspection fields and capture time", async () => {
  const accepted: unknown[] = [];
  const model = { provider: "actual", model: "child", capturedAt: 12 };
  const q = createCaptureQueue({
    inspect: async (t, id) => reply(t, id),
    resolveModel: async () => model,
    accept: (_id, capture) => accepted.push(capture),
    now: () => 10,
    rateMs: 0,
  });
  q.enqueue(target());
  await q.drain();
  expect(accepted).toEqual([
    { ...normalizeCapture(reply(target(), "req"), target(), "req", 10), resolvedModel: model },
  ]);
  q.dispose();
  const resolveModel = vi.fn();
  const malformed = createCaptureQueue({
    inspect: async () => ({}),
    resolveModel,
    accept() {},
    rateMs: 0,
  });
  malformed.enqueue(target());
  await malformed.drain();
  expect(resolveModel).not.toHaveBeenCalled();
  malformed.dispose();
});
it.each(["dispose", "replace"])(
  "suppresses an entire late enriched capture after %s",
  async (mode) => {
    let release!: () => void;
    const waiting = new Promise<void>((r) => {
      release = r;
    });
    let current = true;
    const accepted = vi.fn();
    const q = createCaptureQueue({
      inspect: async (t, id) => reply(t, id),
      resolveModel: async () => {
        await waiting;
        return { provider: "old", model: "old", capturedAt: 1 };
      },
      current: () => current,
      accept: accepted,
      rateMs: 0,
    });
    q.enqueue(target());
    await Promise.resolve();
    await Promise.resolve();
    if (mode === "dispose") q.dispose();
    else current = false;
    release();
    await q.drain();
    expect(accepted).not.toHaveBeenCalled();
    q.dispose();
  },
);
it("keeps optional work inside the remaining outer deadline", async () => {
  vi.useFakeTimers();
  try {
    const accepted = vi.fn();
    let signal: AbortSignal | undefined;
    const q = createCaptureQueue({
      inspect: async (t, id) => {
        await new Promise((r) => setTimeout(r, 40));
        return reply(t, id);
      },
      resolveModel: async (_t, s) => {
        signal = s;
        return new Promise(() => {});
      },
      accept: accepted,
      timeoutMs: 50,
      rateMs: 0,
    });
    q.enqueue(target());
    await vi.advanceTimersByTimeAsync(51);
    expect(accepted).toHaveBeenCalledTimes(1);
    expect(accepted.mock.calls[0]![1]).toMatchObject({ status: "captured", finalOutput: "answer" });
    expect(signal?.aborted).toBe(true);
    q.dispose();
  } finally {
    vi.useRealTimers();
  }
});
it("skips stale generation targets before inspection", async () => {
  const inspect = vi.fn();
  const accept = vi.fn();
  const q = createCaptureQueue({ inspect, accept, current: () => false });
  q.enqueue(target());
  await q.drain();
  expect(inspect).not.toHaveBeenCalled();
  expect(accept).not.toHaveBeenCalled();
  q.dispose();
});

it("preserves the eight-entry cap, terminal priority, coalescing and 750 ms spacing with enrichment", async () => {
  vi.useFakeTimers();
  try {
    const reads: { id: string; at: number }[] = [];
    const accepted: { id: string; status: string }[] = [];
    const q = createCaptureQueue({
      inspect: async (t, id) => {
        reads.push({ id: t.id, at: Date.now() });
        return reply(t, id);
      },
      resolveModel: async () => ({ provider: "actual", model: "actual", capturedAt: Date.now() }),
      accept: (id, capture) => accepted.push({ id, status: capture.status }),
    });
    q.enqueue(target("first"));
    for (let i = 0; i < 8; i++) q.enqueue(target(String(i)));
    q.enqueue(target("7"));
    q.enqueue(target("dropped"));
    q.enqueue({ ...target("terminal"), terminal: true });
    await vi.advanceTimersByTimeAsync(750 * 10);
    await q.drain();
    expect(reads.map((r) => r.id)).toEqual([
      "first",
      "terminal",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
    ]);
    expect(reads.slice(1).every((r, i) => r.at - reads[i]!.at >= 750)).toBe(true);
    expect(accepted.filter((r) => r.status === "not-captured")).toEqual([
      { id: "dropped", status: "not-captured" },
      { id: "0", status: "not-captured" },
    ]);
    q.dispose();
  } finally {
    vi.useRealTimers();
  }
});
