import { expect, it } from "vitest";
import { parseViewState, viewSchema } from "./subagents-contract.js";
it("validates bounded versioned persisted view state", () => {
  const state = { kind: "pi-subagents-view", version: 1, updatedAt: 1, availability: "available", reason: "", omitted: 0, rows: [] };
  expect(parseViewState(state)).toEqual(state);
  expect(parseViewState({ ...state, version: 2 })).toBeUndefined();
  expect(parseViewState({ ...state, unknown: "x".repeat(256 * 1024) })).toBeUndefined();
  expect(viewSchema.safeParse({ ...state, omitted: -1 }).success).toBe(false);
});
