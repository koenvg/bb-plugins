import { describe, expect, it } from "vitest";
import recordedHead from "../test/fixtures/pr-43-head.json";
import { parsePrHead } from "./pr-head";

describe("parsePrHead", () => {
  it("reads the recorded response", () => {
    expect(parsePrHead(recordedHead)).toEqual({
      prNodeId: "PR_kwDOUoz3mM8AAAABGSCovQ",
      oid: "04b72695435c99fa6191dabebcd37de55730d7c1",
      state: "MERGED",
      viewerIsAuthor: true,
    });
  });

  it("rejects a response without a pull request", () => {
    expect(() => parsePrHead({ data: { repository: { pullRequest: null } } })).toThrow();
  });
});
