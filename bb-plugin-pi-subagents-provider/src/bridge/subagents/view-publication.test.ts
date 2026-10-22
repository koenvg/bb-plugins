import { afterEach, expect, it, vi } from "vitest";
import { createViewStore } from "./view-store.js";
import { restoreViewHistory } from "../../view-history.js";
import { boundedValue, VIEW_BYTES, type ViewState } from "../../subagents-contract.js";

const owner = { sessionId: "pi", sessionFile: "/owned/session", generation: 1 };
const node = { id: "run", kind: "subagent", label: "reviewer", state: "running" } as const;
afterEach(() => vi.useRealTimers());

it("publishes all twenty useful emoji capture summaries inside the complete JSON budget", () => {
  const states: ViewState[] = [];
  const view = createViewStore(
    (state) => states.push(state),
    () => 1,
  );
  for (let i = 0; i < 20; i++) {
    const target = view.background(
      owner,
      [{ ...node, id: `run-${i}`, state: "complete" }],
      false,
    )[0]!;
    view.captureIfCurrent(target, {
      status: "captured",
      capturedAt: 1,
      task: "task 😀".repeat(200),
      finalOutput: "answer 😀".repeat(800),
      messages: Array.from({ length: 20 }, () => ({
        role: "assistant",
        kind: "text",
        text: "detail 😀".repeat(100),
      })),
    });
  }
  const last = states.at(-1)!;
  expect(last.rows).toHaveLength(20);
  expect(last.omitted).toBe(0);
  expect(
    last.rows.every(
      (row) =>
        row.capture?.task?.startsWith("task ") && row.capture?.finalOutput?.includes("answer"),
    ),
  ).toBe(true);
  expect(last.rows.some((row) => row.capture?.truncated?.finalOutput)).toBe(true);
  expect(last.rows.some((row) => (row.capture?.truncated?.messages ?? 0) > 0)).toBe(true);
  for (const state of states)
    expect(Buffer.byteLength(JSON.stringify(state))).toBeLessThanOrEqual(65536);
  expect(restoreViewHistory([last])).toEqual(last);
  expect(restoreViewHistory([restoreViewHistory([last])])).toEqual(last);
});

it("keeps legacy-readable exact boundary and escape-heavy history but fits its replay output", () => {
  const view = createViewStore(
    () => {},
    () => 1,
  );
  const target = view.background(owner, [{ ...node, state: "complete" }], false)[0]!;
  const state = view.snapshot();
  state.rows[0]!.capture = { status: "captured", capturedAt: 1, finalOutput: "" };
  const rows = Array.from({ length: 11 }, (_, i) => ({
    ...state.rows[0]!,
    id: `${target.id}-${i}`,
    capture: { status: "captured" as const, capturedAt: 1, finalOutput: "x".repeat(5500) },
  }));
  const exact = { ...state, rows };
  rows[0]!.capture.finalOutput += "x".repeat(65536 - Buffer.byteLength(JSON.stringify(exact)));
  expect(Buffer.byteLength(JSON.stringify(exact))).toBe(65536);
  expect(boundedValue(exact, VIEW_BYTES)).toBe(true);
  expect(restoreViewHistory([exact])).toEqual(exact);
  rows[0]!.capture.finalOutput += "x";
  expect(Buffer.byteLength(JSON.stringify(exact))).toBe(65537);
  expect(boundedValue(exact, VIEW_BYTES)).toBe(false);
  const replay = restoreViewHistory([exact])!;
  expect(replay.rows).toHaveLength(11);
  expect(Buffer.byteLength(JSON.stringify(replay))).toBeLessThanOrEqual(65536);
  for (const row of rows) row.capture.finalOutput = '\u0000"\\😀'.repeat(1000);
  const escaped = restoreViewHistory([{ ...exact, rows }])!;
  expect(escaped.rows).toHaveLength(11);
  expect(Buffer.byteLength(JSON.stringify(escaped))).toBeLessThanOrEqual(65536);
  expect(JSON.stringify(escaped)).not.toMatch(
    /\\u[dD][89aAbB][0-9a-fA-F]{2}|\\u[dD][c-fC-F][0-9a-fA-F]{2}/,
  );
});

it("uses a fixed progress deadline without starvation and flushes terminal and late capture changes", () => {
  vi.useFakeTimers();
  const states: ViewState[] = [];
  const view = createViewStore(
    (state) => states.push(state),
    () => 1,
  );
  view.background(owner, [node], false);
  expect(states).toHaveLength(1);
  for (let i = 0; i < 10; i++) {
    view.background(owner, [{ ...node, label: `progress-${i}` }], false);
    vi.advanceTimersByTime(24);
  }
  expect(states).toHaveLength(1);
  vi.advanceTimersByTime(10);
  expect(states).toHaveLength(2);
  expect(states[1]!.rows[0]!.label).toBe("progress-9");
  const target = view.background(owner, [{ ...node, state: "complete" }], false)[0]!;
  expect(states).toHaveLength(3);
  view.captureIfCurrent(target, { status: "captured", capturedAt: 2, finalOutput: "final answer" });
  expect(states.at(-1)!.rows[0]!.capture?.finalOutput).toBe("final answer");
  expect(states).toHaveLength(4);
  view.captureIfCurrent(target, { status: "captured", capturedAt: 2, finalOutput: "final answer" });
  vi.advanceTimersByTime(1000);
  expect(states).toHaveLength(4);
  view.captureIfCurrent(target, { status: "captured", capturedAt: 3, finalOutput: "final answer" });
  expect(states).toHaveLength(5);
});

it("flushes current progress on old disposal without overwriting the replacement assessment", () => {
  vi.useFakeTimers();
  const states: ViewState[] = [];
  const view = createViewStore(
    (state) => states.push(state),
    () => 1,
  );
  view.background(owner, [node], false);
  const replacement = { ...owner, generation: 2 };
  view.background(replacement, [{ ...node, label: "replacement" }], false);
  view.dispose(owner, "replacement");
  expect(states.at(-1)).toMatchObject({
    availability: "available",
    reason: "",
    rows: [{ generation: 2, state: "running", label: "replacement" }],
  });
  view.dispose(replacement, "exit");
  expect(states.at(-1)).toMatchObject({
    availability: "unavailable",
    rows: [{ state: "unknown", incomplete: true }],
  });
  const count = states.length;
  vi.advanceTimersByTime(1000);
  expect(states).toHaveLength(count);
});

it("retries an identical receipt after a thrown publication instead of remembering an undelivered state", () => {
  let reject = true;
  const states: ViewState[] = [];
  const view = createViewStore(
    (state) => {
      if (reject) throw Error("offline");
      states.push(state);
    },
    () => 1,
  );
  expect(() => view.background(owner, [{ ...node, state: "complete" }], false)).toThrow("offline");
  reject = false;
  view.background(owner, [{ ...node, state: "complete" }], false);
  expect(states).toHaveLength(1);
  expect(states[0]!.rows[0]!.state).toBe("complete");
});

it("does not revive budget-omitted messages or empty task and output excerpts during history merges", () => {
  const view = createViewStore(
    () => {},
    () => 1,
  );
  view.background(owner, [{ ...node, state: "complete" }], false);
  const newer = view.snapshot();
  newer.rows[0]!.capture = {
    status: "captured",
    capturedAt: 2,
    task: "",
    finalOutput: "",
    messages: [],
    truncated: { task: true, finalOutput: true, messages: 2 },
  };
  const older = structuredClone(newer);
  older.rows[0]!.capture = {
    status: "captured",
    capturedAt: 1,
    task: "old task",
    finalOutput: "old output",
    messages: [{ role: "assistant", kind: "text", text: "old message" }],
  };
  expect(restoreViewHistory([newer, older])!.rows[0]!.capture).toEqual(newer.rows[0]!.capture);
});
