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
