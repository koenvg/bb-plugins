import { expect, it, vi } from "vitest";
import { createCaptureQueue, normalizeCapture } from "./capture.js";
const target = (id = "run") => ({
  id,
  asyncId: id,
  sessionId: "pi",
  sessionFile: "/owned/session",
  generation: 1,
});
const reply = (t: ReturnType<typeof target>, requestId: string) => ({
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
