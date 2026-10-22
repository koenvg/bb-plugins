import { expect, it } from "vitest";
import { restoreViewHistory } from "./view-history.js";
const state = (rows: unknown[]) => ({
  kind: "pi-subagents-view",
  version: 1,
  updatedAt: 1,
  availability: "available",
  reason: "",
  omitted: 0,
  rows,
});
const row = {
  id: "owned",
  runId: "r",
  sessionId: "pi",
  generation: 1,
  source: "background",
  kind: "subagent",
  label: "reviewer",
  state: "complete",
  incomplete: false,
  observedAt: 1,
};
it("restores final output and original capture time after refresh, missing artifacts and replacement", () => {
  const before = state([
    { ...row, capture: { status: "captured", capturedAt: 1, finalOutput: "answer" } },
  ]);
  const after = state([
    {
      ...row,
      generation: 2,
      capture: { status: "unavailable", capturedAt: 20, reason: "Missing artifact" },
    },
  ]);
  const restored = restoreViewHistory(JSON.parse(JSON.stringify([after, before])))!;
  expect(restored.rows[0]!.capture).toMatchObject({
    status: "unavailable",
    finalOutput: "answer",
    capturedAt: 1,
    attemptedAt: 20,
  });
  expect(restored.rows[0]!.state).toBe("complete");
});
it("preserves older terminal evidence but does not fabricate survival of an absent live child", () => {
  const restored = restoreViewHistory([state([]), state([{ ...row, state: "running" }])])!;
  expect(restored.rows[0]).toMatchObject({ state: "unknown", incomplete: true });
  expect(restoreViewHistory([{ ...state([]), version: 2 }])).toBeUndefined();
});

it("retains enriched model provenance and tools through failed and successful newer captures", () => {
  const model = { provider: "child-provider", model: "child-model", capturedAt: 2 };
  const messages = [
    { role: "toolResult", kind: "toolResult", text: "failed", name: "bash", isError: true },
  ];
  const old = state([
    {
      ...row,
      capture: {
        status: "captured",
        capturedAt: 2,
        task: "task",
        finalOutput: "answer",
        resolvedModel: model,
        messages,
        truncated: { task: true, finalOutput: true, messages: 3 },
      },
    },
  ]);
  for (const capture of [
    { status: "timeout", capturedAt: 10 },
    {
      status: "captured",
      capturedAt: 10,
      messages: [],
      truncated: { task: false, finalOutput: false, messages: 0 },
    },
  ]) {
    const restored = restoreViewHistory([state([{ ...row, capture }]), old])!.rows[0]!.capture!;
    expect(restored).toMatchObject({
      truncated: { task: true, finalOutput: true, messages: 3 },
      resolvedModel: model,
      messages,
      task: "task",
      finalOutput: "answer",
    });
    expect(restored.capturedAt).toBe(capture.status === "timeout" ? 2 : 10);
    expect(restored.attemptedAt).toBe(capture.status === "timeout" ? 10 : undefined);
  }
  const replacement = { ...model, model: "new-model", capturedAt: 12 };
  expect(
    restoreViewHistory([
      state([
        { ...row, capture: { status: "captured", capturedAt: 12, resolvedModel: replacement } },
      ]),
      old,
    ])!.rows[0]!.capture!.resolvedModel,
  ).toEqual(replacement);
});

it.each(["timeout", "captured"] as const)(
  "keeps the newest accepted capture time across three events with an older %s capture",
  (oldestStatus) => {
    const oldest = state([
      {
        ...row,
        capture: {
          status: oldestStatus,
          capturedAt: 3,
          ...(oldestStatus === "captured" ? { finalOutput: "older answer" } : {}),
        },
      },
    ]);
    const accepted = state([
      {
        ...row,
        capture: {
          status: "captured",
          capturedAt: 10,
          finalOutput: "new answer",
          resolvedModel: { provider: "child-provider", model: "child-model", capturedAt: 10 },
        },
      },
    ]);
    const failed = state([
      {
        ...row,
        label: "newest identity",
        observedAt: 12,
        generation: 2,
        capture: {
          status: "timeout",
          capturedAt: 10,
          attemptedAt: 12,
          finalOutput: "new answer",
          reason: "No reply",
          resolvedModel: { provider: "child-provider", model: "child-model", capturedAt: 10 },
        },
      },
    ]);
    const restored = restoreViewHistory([failed, accepted, oldest])!;
    expect(restored.rows[0]!.capture).toMatchObject({
      status: "timeout",
      capturedAt: 10,
      attemptedAt: 12,
      finalOutput: "new answer",
      reason: "No reply",
      resolvedModel: { provider: "child-provider", model: "child-model", capturedAt: 10 },
    });
    expect(restored.rows[0]).toMatchObject({
      label: "newest identity",
      observedAt: 12,
      generation: 2,
      state: "complete",
    });
  },
);

it("keeps only task text and its clipping flag from the previous reader snapshot", () => {
  const previous = restoreViewHistory([
    state([
      {
        ...row,
        capture: {
          status: "captured",
          capturedAt: 1,
          task: "Previously captured task",
          finalOutput: "Old output",
          resolvedModel: { provider: "old", model: "old", capturedAt: 1 },
          messages: [{ role: "assistant", kind: "text", text: "Old transcript" }],
          truncated: { task: true, finalOutput: true, messages: 5 },
        },
      },
    ]),
  ])!;
  const current = state([
    {
      ...row,
      observedAt: 20,
      state: "failed",
      capture: {
        status: "timeout",
        capturedAt: 10,
        attemptedAt: 20,
        reason: "No reply",
        truncated: { task: false, finalOutput: false, messages: 2 },
      },
    },
  ]);
  const result = restoreViewHistory([current], previous)!;
  expect(result.rows[0]).toMatchObject({ state: "failed", observedAt: 20 });
  expect(result.rows[0]!.capture).toEqual({
    status: "timeout",
    capturedAt: 10,
    attemptedAt: 20,
    reason: "No reply",
    task: "Previously captured task",
    truncated: { task: true, finalOutput: false, messages: 2 },
  });
  expect(restoreViewHistory([state([{ ...row }])], previous)!.rows[0]!.capture).toEqual({
    status: "not-captured",
    capturedAt: 1,
    task: "Previously captured task",
    truncated: { task: true, finalOutput: false, messages: 0 },
  });
  for (const task of ["New task", ""]) {
    const next = state([{ ...row, capture: { status: "captured", capturedAt: 30, task } }]);
    expect(restoreViewHistory([next], result)!.rows[0]!.capture).toEqual({
      status: "captured",
      capturedAt: 30,
      task,
    });
  }
});

it("drops absent rows and does not attribute repeated local step IDs to another run or session", () => {
  const previous = restoreViewHistory([
    state([{ ...row, capture: { status: "captured", capturedAt: 1, task: "Original task" } }]),
  ])!;
  expect(restoreViewHistory([state([])], previous)!.rows).toEqual([]);
  expect(restoreViewHistory([], previous)).toBeUndefined();
  expect(restoreViewHistory([{ ...state([]), version: 2 }], previous)).toBeUndefined();
  for (const identity of [
    { id: "other-run/step:0" },
    { sessionId: "other-session" },
    { runId: "other-run" },
  ]) {
    const result = restoreViewHistory([state([{ ...row, ...identity }])], previous)!;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.capture).toBeUndefined();
  }
  const removed = restoreViewHistory([state([])], previous)!;
  expect(restoreViewHistory([state([row])], removed)!.rows[0]!.capture).toBeUndefined();
});

it("preserves row metadata and useful excerpts within the publication budget after retaining attribution", () => {
  const rows = Array.from({ length: 64 }, (_, index) => ({ ...row, id: `row-${index}` }));
  const previous = restoreViewHistory([
    state(
      rows.map((item) => ({
        ...item,
        capture: { status: "captured", capturedAt: 1, task: "t".repeat(2000) },
      })),
    ),
  ])!;
  const current = state(
    rows.map((item) => ({
      ...item,
      capture: { status: "captured", capturedAt: 2, finalOutput: "o".repeat(3000) },
    })),
  );
  expect(previous.rows).toHaveLength(64);
  expect(restoreViewHistory([current])!.rows).toHaveLength(64);
  const retained = restoreViewHistory([current], previous)!;
  expect(retained.rows).toHaveLength(64);
  expect(retained.omitted).toBe(0);
  expect(Buffer.byteLength(JSON.stringify(retained))).toBeLessThanOrEqual(65536);
  expect(retained.rows[0]!.capture).toMatchObject({
    task: "t".repeat(128),
    finalOutput: "o".repeat(512),
    truncated: { task: true, finalOutput: true, messages: 0 },
  });
  expect(restoreViewHistory([retained], retained)).toEqual(retained);
  const large = restoreViewHistory(
    [
      state(Array.from({ length: 128 }, (_, index) => ({ ...row, id: `new-${index}` }))),
      state([row]),
    ],
    previous,
  )!;
  expect(large.rows).toHaveLength(128);
  expect(large.omitted).toBe(1);
});
