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

it("preserves mixed block order and captures only the child's latest assistant model pair", () => {
  const capture = foregroundRows(
    owner,
    {
      mode: "single",
      runId: "r",
      model: "parent-model",
      results: [
        {
          index: 0,
          agent: "a",
          model: "requested-model",
          exitCode: 0,
          messages: [
            {
              role: "assistant",
              provider: "old-provider",
              model: "old-model",
              content: [
                { type: "text", text: "before" },
                { type: "toolCall", name: "bash", arguments: { command: "pwd" } },
                { type: "text", text: "after" },
              ],
            },
            {
              role: "toolResult",
              toolName: "bash",
              isError: true,
              content: [{ type: "text", text: "denied" }],
            },
            {
              role: "assistant",
              provider: "child-provider",
              model: "child-model",
              content: "finished",
            },
            {
              role: "user",
              provider: "parent-provider",
              model: "parent-model",
              content: "ignored model",
            },
          ],
        },
      ],
    },
    true,
    42,
  )[0]!;
  expect(capture.state).toBe("complete");
  expect(capture.capture!.resolvedModel).toEqual({
    provider: "child-provider",
    model: "child-model",
    capturedAt: 42,
  });
  expect(capture.capture!.messages).toMatchObject([
    { kind: "text", text: "before" },
    { kind: "toolCall", name: "bash", text: '{"command":"pwd"}' },
    { kind: "text", text: "after" },
    { kind: "toolResult", name: "bash", isError: true, text: "denied" },
    { kind: "text", text: "finished" },
    { kind: "text", text: "ignored model" },
  ]);
});
it("bounds entries after expansion, retains clipping, and never infers missing model data", () => {
  const capture = (messages: unknown[]) =>
    foregroundRows(
      owner,
      {
        mode: "single",
        runId: "r",
        model: "parent-model",
        results: [{ index: 0, agent: "a", model: "requested-model", messages }],
      },
      true,
      42,
    )[0]!.capture!;
  const expanded = capture([
    {
      role: "assistant",
      content: Array.from({ length: 25 }, (_, i) => ({
        type: "text",
        text: `${i}:` + "x".repeat(1001),
      })),
    },
  ]);
  expect(expanded.messages).toHaveLength(20);
  expect(expanded.messages![0]!.text).toMatch(/^5:/);
  expect(expanded.messages!.every((m) => m.text.length === 1000 && m.textTruncated)).toBe(true);
  expect(expanded.truncated!.messages).toBe(5);
  expect(expanded.resolvedModel).toBeUndefined();
  for (const fields of [
    { model: "alias" },
    { provider: "p" },
    { provider: "p".repeat(161), model: "m" },
    { provider: "p", model: "m".repeat(257) },
  ]) {
    expect(
      capture([{ role: "assistant", content: "text", ...fields }]).resolvedModel,
    ).toBeUndefined();
  }
});
