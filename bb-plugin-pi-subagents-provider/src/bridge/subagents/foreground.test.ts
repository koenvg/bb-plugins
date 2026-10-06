import { expect, it } from "vitest";
import { foregroundRows } from "./foreground.js";
const owner = { sessionId: "pi", sessionFile: "/owned", generation: 1 };
it("matches root progress by published index through reordered parallel results", () => {
  const rows = foregroundRows(
    owner,
    {
      mode: "parallel",
      runId: "r",
      results: [
        { index: 8, agent: "a" },
        { index: 2, agent: "b" },
      ],
      progress: [
        { index: 2, currentTool: "read", durationMs: 500, status: "running" },
        { index: 8, currentTool: "bash", durationMs: 900, status: "completed" },
      ],
    },
    false,
    1,
  );
  expect(rows[0]).toMatchObject({ index: 8, state: "complete", activity: "bash", durationMs: 900 });
  expect(rows[1]).toMatchObject({ index: 2, state: "running", activity: "read" });
});
it("rejects missing/duplicate identity, omits absent fields and never counts async launch receipts", () => {
  expect(foregroundRows(owner, { mode: "single", results: [] }, true, 1)).toEqual([]);
  const r = { mode: "single", runId: "r", results: [{ index: 0, agent: "a" }] };
  expect(foregroundRows(owner, { ...r, background: true }, true, 1)).toEqual([]);
  expect(foregroundRows(owner, { ...r, results: [...r.results, ...r.results] }, true, 1)).toEqual(
    [],
  );
  expect(foregroundRows(owner, r, true, 1)[0]).toMatchObject({ state: "unknown" });
});
it("discloses structured transcript and recent-output text clipping and entry loss", () => {
  const common = {
    mode: "single",
    runId: "r",
    results: [
      { index: 0, agent: "a", messages: [{ role: "assistant", content: "x".repeat(1200) }] },
    ],
  };
  expect(foregroundRows(owner, common, false, 1)[0]!.capture!.messages![0]).toMatchObject({
    textTruncated: true,
  });
  const fallback = {
    ...common,
    results: [
      {
        index: 0,
        agent: "a",
        progress: { recentOutput: Array.from({ length: 12 }, () => "x".repeat(1200)) },
      },
    ],
  };
  const capture = foregroundRows(owner, fallback, false, 1)[0]!.capture!;
  expect(capture.messages).toHaveLength(10);
  expect(capture.messages![0]).toMatchObject({ textTruncated: true });
  expect(capture.truncated!.messages).toBe(2);
});
