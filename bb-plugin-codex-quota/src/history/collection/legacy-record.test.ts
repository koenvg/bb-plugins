import { expect, it } from "vitest";
import { parseCompact } from "./usage-record.js";

const usage = {
  version: 1,
  eventId: "12345678-1234-4234-8234-123456789abc",
  provenance: "observed",
  occurredAt: "2026-09-16T12:00:00.000Z",
  sessionId: "session",
  workspace: "/synthetic",
  providerSessionKey: null,
  claimedThreadId: null,
  provider: "openai-codex",
  model: "synthetic",
  inputTokens: 200,
  outputTokens: 100,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  totalTokens: 300,
  capturedCost: 0.03,
};

it("reads v1 scalar usage and strips only legacy serviceTier from v2 metadata", () => {
  expect(parseCompact(JSON.stringify(usage), false)).toEqual(usage);
  for (const serviceTier of ["fast", "ultrafast", { malformed: true }, null]) {
    expect(
      parseCompact(
        JSON.stringify({ version: 2, usage, metadata: { responseId: "resp_one", serviceTier } }),
        false,
      ),
    ).toEqual({ ...usage, metadata: { responseId: "resp_one" } });
  }
  expect(
    parseCompact(
      JSON.stringify({ version: 2, usage, metadata: { responseId: "resp_one", unexpected: true } }),
      false,
    ),
  ).toBeNull();
  expect(parseCompact(JSON.stringify({ ...usage, totalTokens: -1 }), false)).toBeNull();
});
