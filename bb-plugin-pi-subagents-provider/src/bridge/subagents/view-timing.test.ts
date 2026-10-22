import { afterEach, expect, it, vi } from "vitest";
import { createViewStore } from "./view-store.js";
import type { ViewState } from "../../subagents-contract.js";
const owner = { sessionId: "pi", sessionFile: "/owned/session", generation: 1 };
const node = { id: "r", label: "reader", kind: "subagent", state: "running" } as const;
afterEach(() => vi.useRealTimers());

it("ignores timestamp-only receipt floods without postponing changed progress", () => {
  vi.useFakeTimers();
  let now = 1;
  const states: ViewState[] = [];
  const view = createViewStore(
    (state) => states.push(state),
    () => now++,
  );
  view.background(owner, [node], false);
  for (let i = 0; i < 1000; i++) view.background(owner, [node], false);
  expect(states).toHaveLength(1);
  for (let wave = 0; wave < 3; wave++) {
    for (let i = 0; i < 25; i++) {
      view.background(owner, [{ ...node, label: `wave-${wave}-${i}` }], false);
      vi.advanceTimersByTime(10);
    }
    expect(states).toHaveLength(wave + 2);
    expect(states.at(-1)!.rows[0]!.label).toBe(`wave-${wave}-24`);
  }
  expect(states[0]!.rows[0]!.label).toBe("reader");
  view.dispose(owner, "exit");
});

it("flushes foreground final receipts and changed unavailable assessments immediately", () => {
  vi.useFakeTimers();
  const states: ViewState[] = [];
  const view = createViewStore(
    (state) => states.push(state),
    () => 1,
  );
  const details = (text: string) => ({
    mode: "single",
    runId: "fg",
    results: [{ index: 0, agent: "reader", task: "task", finalOutput: text, exitCode: 0 }],
  });
  view.foreground(owner, details("partial"), false);
  view.foreground(owner, details("more partial"), false);
  expect(states).toHaveLength(1);
  view.foreground(owner, details("final answer"), true);
  expect(states).toHaveLength(2);
  expect(states.at(-1)!.rows[0]).toMatchObject({
    state: "complete",
    capture: { finalOutput: "final answer" },
  });
  view.background(owner, [node], false);
  view.availability("unavailable", "Current read failed", owner);
  expect(states.at(-1)).toMatchObject({
    availability: "unavailable",
    reason: "Current read failed",
  });
  expect(states.at(-1)!.rows.map((row) => row.runId)).toEqual(["fg", "r"]);
  const count = states.length;
  view.availability("unavailable", "Current read failed", owner);
  vi.advanceTimersByTime(1000);
  expect(states).toHaveLength(count);
});

it("retains capture, attempt and model timestamps in meaningful-change deduplication", () => {
  const states: ViewState[] = [];
  const view = createViewStore(
    (state) => states.push(state),
    () => 1,
  );
  const target = view.background(owner, [{ ...node, state: "complete" }], false)[0]!;
  const capture = {
    status: "captured" as const,
    capturedAt: 2,
    finalOutput: "answer",
    resolvedModel: { provider: "p", model: "m", capturedAt: 2 },
  };
  view.captureIfCurrent(target, capture);
  view.captureIfCurrent(target, capture);
  expect(states).toHaveLength(2);
  view.captureIfCurrent(target, {
    ...capture,
    resolvedModel: { ...capture.resolvedModel, capturedAt: 3 },
  });
  expect(states).toHaveLength(3);
  view.captureIfCurrent(target, { status: "timeout", capturedAt: 4 });
  view.captureIfCurrent(target, { status: "timeout", capturedAt: 5 });
  expect(states).toHaveLength(5);
  expect(states.at(-1)!.rows[0]!.capture).toMatchObject({
    status: "timeout",
    capturedAt: 2,
    attemptedAt: 5,
    finalOutput: "answer",
    resolvedModel: { capturedAt: 3 },
  });
});

it("retires an evicted store and blocks its timer, late captures, disposal and owner callbacks", () => {
  vi.useFakeTimers();
  const states: ViewState[] = [];
  const old = createViewStore(
    (state) => states.push(state),
    () => 1,
  );
  const target = old.background(owner, [node], false)[0]!;
  old.background(owner, [{ ...node, label: "pending old" }], false);
  old.retire();
  const replacement = createViewStore(
    (state) => states.push(state),
    () => 2,
  );
  replacement.background({ ...owner, generation: 2 }, [{ ...node, label: "replacement" }], false);
  old.captureIfCurrent(target, { status: "captured", capturedAt: 3, finalOutput: "late" });
  old.capture(target.id, { status: "captured", capturedAt: 3, finalOutput: "late" });
  old.availability("unavailable", "late", owner);
  old.dispose(owner, "exit");
  old.background(owner, [{ ...node, state: "complete" }], false);
  vi.advanceTimersByTime(1000);
  expect(states).toHaveLength(2);
  expect(states[1]!).toMatchObject({
    availability: "available",
    rows: [{ generation: 2, label: "replacement" }],
  });
  replacement.dispose({ ...owner, generation: 2 }, "exit");
});

it("scopes disposal and late availability to the exact owner, including session identity", () => {
  vi.useFakeTimers();
  const states: ViewState[] = [];
  const view = createViewStore(
    (state) => states.push(state),
    () => 1,
  );
  const other = { ...owner, sessionId: "other" };
  const target = view.background(owner, [node], false)[0]!;
  view.background(other, [node], false);
  view.dispose(owner, "replacement");
  view.availability("unavailable", "late old failure", owner);
  view.captureIfCurrent(target, { status: "captured", capturedAt: 2, finalOutput: "late" });
  expect(states.at(-1)).toMatchObject({ availability: "available", reason: "" });
  expect(
    view.snapshot().rows.map((row) => [row.sessionId, row.state, row.capture?.finalOutput]),
  ).toEqual([
    ["pi", "unknown", undefined],
    ["other", "running", undefined],
  ]);
  view.dispose(other, "exit");
  const count = states.length;
  vi.advanceTimersByTime(1000);
  expect(states).toHaveLength(count);
});
