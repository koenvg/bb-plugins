import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { mockPrStatusRpc } from "../test-fixtures.js";
import { lookupPullRequest } from "./pr-status.js";

describe("lookupPullRequest", () => {
  it("preserves available PR metadata for the requested environment", async () => {
    const result = await lookupPullRequest(
      {
        callRpc: mockPrStatusRpc(async ({ environmentId }) => ({
          outcome: "available",
          pullRequest: {
            url: "https://github.com/acme/bb/pull/321",
            number: 321,
            title: environmentId,
            state: "open",
            updatedAt: "2026-10-19T10:00:00.000Z",
            headRefName: "fix/completion",
            checks: { state: "passing", totalCount: 1 },
          },
        })),
      },
      "env_work",
    );

    expect(result).toEqual({
      outcome: "available",
      pullRequest: {
        url: "https://github.com/acme/bb/pull/321",
        number: 321,
        title: "env_work",
        state: "open",
        updatedAt: "2026-10-19T10:00:00.000Z",
        headRefName: "fix/completion",
        checks: { state: "passing", totalCount: 1 },
      },
    });
  });

  it.each([{ outcome: "absent" }, { outcome: "unavailable", message: "GitHub offline" }])(
    "returns the $outcome outcome",
    async (response) => {
      expect(
        await lookupPullRequest({ callRpc: mockPrStatusRpc(async () => response) }, "env_work"),
      ).toEqual(response);
    },
  );

  it("reports unavailable when the response omits the requested environment", async () => {
    expect(
      await lookupPullRequest(
        { callRpc: async ({ outputSchema }) => outputSchema.parse({}) },
        "env_missing",
      ),
    ).toEqual({
      outcome: "unavailable",
      message: "No pull request status returned for environment env_missing",
    });
  });

  it("rejects malformed PR data through the RPC output schema", async () => {
    await expect(
      lookupPullRequest(
        {
          callRpc: mockPrStatusRpc(async () => ({
            outcome: "available",
            pullRequest: { state: "unexpected" },
          })),
        },
        "env_work",
      ),
    ).rejects.toBeInstanceOf(ZodError);
  });
});
