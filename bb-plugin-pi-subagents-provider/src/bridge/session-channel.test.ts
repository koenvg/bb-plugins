import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PiSessionChannel } from "./session-channel.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("correlates out-of-order replies and clears their timeouts", async () => {
  const send = vi.fn();
  const channel = new PiSessionChannel(send);
  const first = channel.request({ method: "leaf" });
  const second = channel.request({ method: "fork" });
  const [firstMessage, secondMessage] = send.mock.calls.map(([message]) => message);
  channel.handle({ kind: "reply", id: "unknown", result: "ignored" });
  channel.handle({ kind: "reply", id: secondMessage.id, result: "forked" });
  channel.handle({ kind: "reply", id: firstMessage.id, error: "missing leaf" });
  await expect(second).resolves.toBe("forked");
  await expect(first).rejects.toThrow("missing leaf");
  expect(vi.getTimerCount()).toBe(0);
});

it("times out unanswered requests and ignores late replies", async () => {
  const send = vi.fn();
  const channel = new PiSessionChannel(send);
  const reply = expect(channel.request({ method: "leaf" }, 100)).rejects.toThrow(
    "pi extension did not answer leaf",
  );
  await vi.advanceTimersByTimeAsync(100);
  await reply;
  channel.handle({ kind: "reply", id: send.mock.calls[0]![0].id, result: "late" });
  const next = channel.request({ method: "leaf" });
  channel.handle({ kind: "reply", id: send.mock.calls[1]![0].id, result: "current" });
  await expect(next).resolves.toBe("current");
  expect(vi.getTimerCount()).toBe(0);
});

it("clears request ownership if sending throws", async () => {
  const channel = new PiSessionChannel(() => {
    throw new Error("write failed");
  });
  await expect(channel.request({ method: "leaf" })).rejects.toThrow("write failed");
  expect(vi.getTimerCount()).toBe(0);
});

it("waits for readiness, including a ready report received before the wait", async () => {
  const channel = new PiSessionChannel(() => undefined);
  const ready = channel.awaitReady(100);
  channel.handle({ kind: "ready" });
  await ready;
  await channel.awaitReady(100);
  expect(vi.getTimerCount()).toBe(0);
});

it("times out readiness without leaving its timer active", async () => {
  const channel = new PiSessionChannel(() => undefined);
  const ready = expect(channel.awaitReady(100)).rejects.toThrow(
    "pi extension did not report ready in time",
  );
  await vi.advanceTimersByTimeAsync(100);
  await ready;
  channel.dispose(new Error("closed"));
  expect(vi.getTimerCount()).toBe(0);
});

it("preserves leaf report order whether reports precede or follow events", async () => {
  const channel = new PiSessionChannel(() => undefined);
  channel.handle({ kind: "agent-end-leaf", leafId: "first" });
  channel.handle({ kind: "agent-end-leaf", leafId: null });
  await expect(channel.takeAgentEndLeaf()).resolves.toBe("first");
  await expect(channel.takeAgentEndLeaf()).resolves.toBeNull();
  const leaf = channel.takeAgentEndLeaf();
  channel.handle({ kind: "agent-end-leaf", leafId: "third" });
  await expect(leaf).resolves.toBe("third");
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds a missing leaf wait and accepts the next event's report", async () => {
  const channel = new PiSessionChannel(() => undefined);
  const leaf = channel.takeAgentEndLeaf();
  await vi.advanceTimersByTimeAsync(5000);
  await expect(leaf).resolves.toBeNull();
  const next = channel.takeAgentEndLeaf();
  channel.handle({ kind: "agent-end-leaf", leafId: "next" });
  await expect(next).resolves.toBe("next");
  expect(vi.getTimerCount()).toBe(0);
});

it("disposes all waits and isolates a replacement child generation", async () => {
  const old = new PiSessionChannel(() => undefined);
  const error = new Error("child exited");
  const request = expect(old.request({ method: "fork" })).rejects.toBe(error);
  const ready = expect(old.awaitReady(100)).rejects.toBe(error);
  const leaf = old.takeAgentEndLeaf();
  old.dispose(error);
  old.dispose(new Error("duplicate exit"));
  await request;
  await ready;
  await expect(leaf).resolves.toBeNull();
  await expect(old.request({ method: "leaf" })).rejects.toBe(error);
  await expect(old.awaitReady(100)).rejects.toBe(error);
  await expect(old.takeAgentEndLeaf()).resolves.toBeNull();
  expect(vi.getTimerCount()).toBe(0);

  const send = vi.fn();
  const current = new PiSessionChannel(send);
  const result = current.request({ method: "leaf" });
  old.handle({ kind: "reply", id: send.mock.calls[0]![0].id, result: "stale" });
  current.handle({ kind: "reply", id: send.mock.calls[0]![0].id, result: "current" });
  await expect(result).resolves.toBe("current");
});
