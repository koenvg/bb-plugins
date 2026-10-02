import { describe, expect, it } from "vitest";
import { overviewPageArgs } from "./overview-query";

const pr = { owner: "collibra", repo: "frontend", number: 25337 };

function queryOf(args: string[]): string {
  return args.find((arg) => arg.startsWith("query="))!;
}

describe("overviewPageArgs", () => {
  it("asks the review state only on the first page", () => {
    expect(overviewPageArgs({ ...pr, after: null })).toContain("firstPage=true");
    expect(overviewPageArgs({ ...pr, after: "MTAw" })).toEqual(
      expect.arrayContaining(["firstPage=false", "after=MTAw"]),
    );
  });

  it("asks the merge queue entry on the first page", () => {
    const query = overviewPageArgs({ ...pr, after: null }).find((arg) =>
      arg.startsWith("query="),
    );

    expect(query).toMatch(/@include\(if: \$firstPage\) \{[^}]*mergeQueueEntry \{ position state \}/);
  });

  it.each([
    "viewerDefaultMergeMethod",
    "mergeCommitAllowed",
    "squashMergeAllowed",
    "rebaseMergeAllowed",
    "id",
    "headRefOid",
    "isMergeQueueEnabled",
  ])("asks %s only on the first page", (field) => {
    const firstPageBlocks = queryOf(overviewPageArgs({ ...pr, after: null }))
      .split("... @include(if: $firstPage) {")
      .slice(1)
      .map((block) => block.slice(0, block.indexOf("}")));

    expect(firstPageBlocks.some((block) => new RegExp(`^\\s*${field}$`, "m").test(block))).toBe(true);
  });
});
