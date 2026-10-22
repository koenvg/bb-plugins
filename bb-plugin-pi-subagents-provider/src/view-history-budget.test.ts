import { expect, it } from "vitest";
import { restoreViewHistory } from "./view-history.js";
import type { ViewRow, ViewState } from "./subagents-contract.js";
const row = (id: string): ViewRow => ({
  id,
  runId: id,
  sessionId: "pi",
  generation: 1,
  source: "background",
  label: "reader",
  kind: "subagent",
  state: "complete",
  incomplete: false,
  observedAt: 1,
});
const state = (rows: ViewRow[], omitted: number): ViewState => ({
  kind: "pi-subagents-view",
  version: 1,
  updatedAt: 1,
  availability: "available",
  reason: "",
  omitted,
  rows,
});

it("counts only rows excluded by this replay on top of the latest cumulative omissions", () => {
  const latest = state(
    Array.from({ length: 128 }, (_, i) => row(`latest-${i}`)),
    7,
  );
  const older = state([row("historical")], 90);
  const result = restoreViewHistory([latest, older], state([], 200))!;
  expect(result.rows).toEqual(latest.rows);
  expect(result.omitted).toBe(8);
  expect(restoreViewHistory([latest, older], result)).toEqual(result);
  expect(restoreViewHistory([result])).toEqual(result);
});

it("retains older terminal output when newer failed captures and mounted task attribution merge", () => {
  const latest = state(
    [{ ...row("r"), capture: { status: "timeout", capturedAt: 2, reason: "No reply" } }],
    7,
  );
  const older = state(
    [
      {
        ...row("r"),
        capture: { status: "captured", capturedAt: 1, finalOutput: "accepted answer" },
      },
    ],
    90,
  );
  const mounted = state(
    [
      {
        ...row("r"),
        capture: {
          status: "captured",
          capturedAt: 1,
          task: "original task",
          truncated: { task: true, finalOutput: false, messages: 0 },
        },
      },
    ],
    200,
  );
  const result = restoreViewHistory([latest, older], mounted)!;
  expect(result.omitted).toBe(7);
  expect(result.rows[0]!.capture).toMatchObject({
    status: "timeout",
    capturedAt: 1,
    attemptedAt: 2,
    finalOutput: "accepted answer",
    task: "original task",
    truncated: { task: true, finalOutput: false, messages: 0 },
  });
  expect(restoreViewHistory([result], result)).toEqual(result);
});
