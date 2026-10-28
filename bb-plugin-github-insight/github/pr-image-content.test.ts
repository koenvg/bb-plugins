import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  calls: [] as unknown[][],
  stdout: (_args: string[]): string | Buffer => "",
  error: null as object | null,
}));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  return {
    execFile: Object.assign(() => {}, {
      [promisify.custom]: (...args: unknown[]) => {
        state.calls.push(args);
        return Object.assign(
          state.error
            ? Promise.reject(state.error)
            : Promise.resolve({ stdout: state.stdout(args[1] as string[]) }),
          { child: { stdin: { end: () => undefined } } },
        );
      },
    }),
  };
});
const { default: host } = await import("../host");
const request = {
  owner: "private-owner",
  repo: "private-repo",
  sha: "1111111111111111111111111111111111111111",
  path: "images/a b#?.png",
};
const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
const blobSha = "2222222222222222222222222222222222222222";
const contentsUrl =
  "repos/private-owner/private-repo/contents/images/a%20b%23%3F.png?ref=1111111111111111111111111111111111111111";
function serve(contents: object, blob: object = {}) {
  state.stdout = (args) =>
    JSON.stringify(args[1]!.includes("/git/blobs/") ? blob : { sha: blobSha, ...contents });
}
const readyPng = {
  kind: "ready",
  content: "iVBORw0KGgoAAAAA",
  mime: "image/png",
  sizeBytes: 12,
};
beforeEach(() => {
  state.calls = [];
  state.error = null;
});
describe("authenticated bounded image host", () => {
  it("reads base64 content from the JSON contents response at a literal immutable ref", async () => {
    serve({ size: 12, encoding: "base64", content: `${png.toString("base64")}\n` });
    const signal = new AbortController().signal;
    expect(await host.handlers.readPrImage(request, { signal } as never)).toEqual(readyPng);
    expect(state.calls.map((call) => call[1])).toEqual([["api", contentsUrl]]);
    expect(state.calls[0]?.[2]).toMatchObject({ signal });
  });
  it("reads the blob when the contents response omits content for files over 1 MB", async () => {
    serve(
      { size: 12, encoding: "none", content: "" },
      { sha: blobSha, size: 12, encoding: "base64", content: png.toString("base64") },
    );
    expect(
      await host.handlers.readPrImage(request, { signal: new AbortController().signal } as never),
    ).toEqual(readyPng);
    expect(state.calls.map((call) => call[1])).toEqual([
      ["api", contentsUrl],
      ["api", `repos/private-owner/private-repo/git/blobs/${blobSha}`],
    ]);
  });
  it("does not download content over the preview limit", async () => {
    serve({ size: 4 * 1024 * 1024 + 1, encoding: "none", content: "" });
    expect(
      await host.handlers.readPrImage(request, { signal: new AbortController().signal } as never),
    ).toMatchObject({ kind: "error", code: "too_large" });
    expect(state.calls).toHaveLength(1);
  });
  it("rejects content shorter than the reported size", async () => {
    serve({ size: 13, encoding: "base64", content: png.toString("base64") });
    expect(
      await host.handlers.readPrImage(request, { signal: new AbortController().signal } as never),
    ).toMatchObject({ kind: "error", code: "read" });
  });
  it("rejects repository and path traversal before starting gh", async () => {
    for (const input of [
      { ...request, repo: ".." },
      { ...request, path: "../secret.png" },
    ]) {
      expect(
        await host.handlers.readPrImage(input, { signal: new AbortController().signal } as never),
      ).toMatchObject({ kind: "error", code: "read" });
    }
    expect(state.calls).toEqual([]);
  });
  it("compares pinned fork refs through authenticated gh in the base repository", async () => {
    state.stdout = () =>
      Buffer.from(
        JSON.stringify({ merge_base_commit: { sha: "3333333333333333333333333333333333333333" } }),
      );
    const signal = new AbortController().signal;
    expect(
      await host.handlers.fetchImageMergeBase(
        {
          baseRepo: { owner: "base-owner", repo: "private-repo" },
          headRepo: { owner: "fork-owner", repo: "renamed-fork" },
          baseSha: "1111111111111111111111111111111111111111",
          headSha: "2222222222222222222222222222222222222222",
        },
        { signal } as never,
      ),
    ).toEqual({
      ok: true,
      data: { merge_base_commit: { sha: "3333333333333333333333333333333333333333" } },
    });
    expect(state.calls[0]?.slice(0, 2)).toEqual([
      "gh",
      [
        "api",
        "repos/base-owner/private-repo/compare/1111111111111111111111111111111111111111...fork-owner%3A2222222222222222222222222222222222222222",
      ],
    ]);
  });
  it.each([
    [{ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER", stdout: "partial" }, "too_large"],
    [{ stderr: "secret token HTTP 403", stdout: "partial" }, "auth"],
    [{ stderr: "secret HTTP 404" }, "missing"],
    [{ code: "ABORT_ERR" }, "read"],
    [{ killed: true }, "read"],
  ])("returns sanitized failures without partial data", async (error, code) => {
    state.error = error;
    const result = await host.handlers.readPrImage(request, {
      signal: new AbortController().signal,
    } as never);
    expect(result).toMatchObject({ kind: "error", code });
    expect(JSON.stringify(result)).not.toMatch(/secret|partial|token/);
  });
});
