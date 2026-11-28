import { describe, expect, it } from "vitest";
import { targetKey } from "./changes";

describe("targetKey", () => {
  it.each([
    [{ kind: "all" }, "all"],
    [{ kind: "uncommitted" }, "uncommitted"],
    [{ kind: "branch_committed" }, "branch_committed"],
    [{ kind: "commit", sha: "abc1234def" }, "commit:abc1234def"],
  ] as const)("names target %j as %s", (target, key) => {
    expect(targetKey(target)).toBe(key);
  });
});
