import { expect, it } from "vitest";
import { fitViewState } from "./view-budget.js";
import { parseViewState, type ViewRow, type ViewState } from "./subagents-contract.js";

const row: ViewRow = {
  id: "run",
  runId: "run",
  sessionId: "pi",
  generation: 1,
  source: "background",
  label: "reader",
  kind: "subagent",
  state: "complete",
  incomplete: false,
  observedAt: 1,
};
const state = (rows: ViewRow[]): ViewState => ({
  kind: "pi-subagents-view",
  version: 1,
  availability: "available",
  reason: "",
  omitted: 3,
  updatedAt: 1,
  rows,
});

it("fits nonmutating and idempotently with task prefixes, output tails and error evidence", () => {
  const candidate = state(
    Array.from({ length: 20 }, (_, i) => ({
      ...row,
      id: `run-${i}`,
      capture: {
        status: "captured",
        capturedAt: 7,
        attemptedAt: 8,
        task: `TASK-${i} ` + "😀".repeat(990),
        finalOutput: "😀".repeat(3900) + ` RESULT-${i}`,
        messages: Array.from({ length: 20 }, (_, index) => ({
          role: "toolResult",
          kind: "toolResult",
          text: `message-${index} ` + "😀".repeat(480),
          ...(index === 0 ? { isError: true } : {}),
        })),
        truncated: { task: false, finalOutput: false, messages: 5 },
      },
    })),
  );
  const before = structuredClone(candidate);
  const fitted = fitViewState(candidate);
  expect(candidate).toEqual(before);
  expect(fitted.rows).toHaveLength(20);
  expect(fitted.omitted).toBe(3);
  expect(Buffer.byteLength(JSON.stringify(fitted))).toBeLessThanOrEqual(65536);
  expect(parseViewState(fitted)).toEqual(fitted);
  expect(fitViewState(fitted)).toEqual(fitted);
  for (const [i, item] of fitted.rows.entries()) {
    expect(item.capture?.task?.startsWith(`TASK-${i} `)).toBe(true);
    expect(item.capture?.finalOutput?.endsWith(` RESULT-${i}`)).toBe(true);
    expect(item.capture).toMatchObject({
      capturedAt: 7,
      attemptedAt: 8,
      truncated: { task: true, finalOutput: true },
    });
    expect(item.capture?.messages?.[0]).toMatchObject({ isError: true, textTruncated: true });
    expect(item.capture?.truncated?.messages).toBe(25 - item.capture!.messages!.length);
  }
});

it("enforces the row count without destroying detail that already fits the byte budget", () => {
  const fitted = fitViewState(
    state(
      Array.from({ length: 129 }, (_, i) => ({
        ...row,
        id: `run-${i}`,
        capture: { status: "captured", capturedAt: 1, finalOutput: "useful answer" },
      })),
    ),
  );
  expect(fitted.rows).toHaveLength(128);
  expect(fitted.rows[0]!.capture?.finalOutput).toBe("useful answer");
  expect(fitted.rows[127]!.id).toBe("run-127");
  expect(fitted.omitted).toBe(4);
  expect(fitViewState(fitted)).toEqual(fitted);
});

it("evicts metadata deterministically without clipping identities or dangling parents", () => {
  const candidate = state(
    Array.from({ length: 128 }, (_, i) => ({
      ...row,
      id: `${i}-` + "i".repeat(1790),
      sessionId: "s".repeat(4096),
      ...(i === 0 ? { parentId: "127-" + "i".repeat(1790) } : {}),
      capture: {
        status: "captured",
        capturedAt: 1,
        task: "task",
        finalOutput: "answer",
        messages: [{ role: "assistant", kind: "text", text: "text" }],
      },
    })),
  );
  const fitted = fitViewState(candidate);
  expect(fitted.rows[0]!.id).toBe(candidate.rows[0]!.id);
  expect(fitted.rows[0]!.sessionId).toBe("s".repeat(4096));
  expect(fitted.rows[0]!.parentId).toBeUndefined();
  expect(fitted.rows[0]!.capture).toMatchObject({
    task: "task",
    finalOutput: "answer",
    messages: [],
    truncated: { task: false, finalOutput: false, messages: 1 },
  });
  expect(fitted.omitted).toBe(3 + 128 - fitted.rows.length);
  expect(Buffer.byteLength(JSON.stringify(fitted))).toBeLessThanOrEqual(65536);
  expect(parseViewState(fitted)).toEqual(fitted);
  expect(fitViewState(fitted)).toEqual(fitted);
});

it("keeps useful excerpts for a larger retained history rather than clearing all results", () => {
  const fitted = fitViewState(
    state(
      Array.from({ length: 100 }, (_, index) => ({
        ...row,
        id: `run-${index}`,
        capture: {
          status: "captured",
          capturedAt: 1,
          task: `Review ${index}`,
          finalOutput: "😀".repeat(3990) + ` RESULT-${index}`,
        },
      })),
    ),
  );
  expect(fitted.rows).toHaveLength(100);
  expect(fitted.omitted).toBe(3);
  expect(Buffer.byteLength(JSON.stringify(fitted))).toBeLessThanOrEqual(65536);
  for (const [index, item] of fitted.rows.entries()) {
    expect(item.capture?.task).toBe(`Review ${index}`);
    expect(item.capture?.finalOutput?.endsWith(` RESULT-${index}`)).toBe(true);
    expect(item.capture?.truncated?.finalOutput).toBe(true);
  }
  expect(parseViewState(fitted)).toEqual(fitted);
  expect(fitViewState(fitted)).toEqual(fitted);
});
