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
