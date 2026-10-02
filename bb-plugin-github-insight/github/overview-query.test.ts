import { describe, expect, it } from "vitest";
import { overviewPageArgs } from "./overview-query";

const pr = { owner: "collibra", repo: "frontend", number: 25337 };

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
});
