import { describe, expect, it } from "vitest";
import { repoImageRef } from "./repo-image";

const sha = "dffbecff4ed7e07f585558fe80a74ce684f9aae8";

describe("repoImageRef", () => {
  it("reads the repo, revision and path of a raw repo file URL", () => {
    expect(
      repoImageRef(`https://github.com/collibra/frontend/raw/${sha}/ac-image-AC-1-1-top.png`),
    ).toEqual({ owner: "collibra", repo: "frontend", sha, path: "ac-image-AC-1-1-top.png" });
  });

  it("decodes each path segment", () => {
    expect(repoImageRef(`https://github.com/o/r/raw/${sha}/docs/my%20shot%231.png`)).toEqual({
      owner: "o",
      repo: "r",
      sha,
      path: "docs/my shot#1.png",
    });
  });

  it.each([
    ["a branch name", "https://github.com/o/r/raw/main/a.png"],
    ["a short sha", "https://github.com/o/r/raw/dffbecf/a.png"],
    ["a blob URL", `https://github.com/o/r/blob/${sha}/a.png`],
    ["another host", `https://example.com/o/r/raw/${sha}/a.png`],
    ["plain http", `http://github.com/o/r/raw/${sha}/a.png`],
    ["a query", `https://github.com/o/r/raw/${sha}/a.png?raw=true`],
    ["no path", `https://github.com/o/r/raw/${sha}/`],
    ["a parent segment", `https://github.com/o/r/raw/${sha}/a/%2E%2E/b.png`],
    ["an encoded slash", `https://github.com/o/r/raw/${sha}/a%2Fb.png`],
    ["a bad escape", `https://github.com/o/r/raw/${sha}/a%zz.png`],
    ["an attachment", "https://github.com/user-attachments/assets/1bc7aa19"],
    ["not a URL", "a.png"],
  ])("ignores %s", (_name, url) => {
    expect(repoImageRef(url)).toBeNull();
  });
});
