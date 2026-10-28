import { beforeEach, describe, expect, it, vi } from "vitest";
const mp4 = Buffer.from("000000186674797069736f6d0000000069736f6d6d703432", "hex");
const state = vi.hoisted(() => ({
  calls: [] as unknown[][],
  contents: {} as object,
  error: null as object | null,
}));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  return {
    execFile: Object.assign(() => {}, {
      [promisify.custom]: (...args: unknown[]) => {
        state.calls.push(args);
        return state.error
          ? Promise.reject(state.error)
          : Promise.resolve({ stdout: JSON.stringify(state.contents) });
      },
    }),
  };
});
const { default: host } = await import("../host");
const request = {
  owner: "private-owner",
  repo: "private-fork",
  sha: "1111111111111111111111111111111111111111",
  path: "videos/a b#?.mp4",
};
function serve(size: number) {
  state.contents = {
    sha: "2222222222222222222222222222222222222222",
    size,
    encoding: "base64",
    content: mp4.toString("base64"),
  };
}
beforeEach(() => {
  state.calls = [];
  state.error = null;
  serve(24);
});
describe("authenticated bounded video host", () => {
  it("reads base64 content at an encoded immutable revision", async () => {
    const signal = new AbortController().signal;
    expect(await host.handlers.readPrVideo(request, { signal } as never)).toMatchObject({
      kind: "ready",
      mime: "video/mp4",
      sizeBytes: 24,
    });
    expect(state.calls.map((call) => call[1])).toEqual([
      [
        "api",
        "repos/private-owner/private-fork/contents/videos/a%20b%23%3F.mp4?ref=1111111111111111111111111111111111111111",
      ],
    ]);
    expect(state.calls[0]?.[2]).toMatchObject({ signal });
  });
  it("does not download content over the preview limit", async () => {
    serve(8 * 1024 * 1024 + 1);
    expect(
      await host.handlers.readPrVideo(request, { signal: new AbortController().signal } as never),
    ).toMatchObject({ kind: "error", code: "too_large" });
    expect(state.calls).toHaveLength(1);
  });
  it("rejects unsafe input before spawning gh and rejects partial content", async () => {
    expect(
      await host.handlers.readPrVideo({ ...request, path: "../secret.mp4" }, {
        signal: new AbortController().signal,
      } as never),
    ).toMatchObject({ kind: "error", code: "read" });
    expect(state.calls).toHaveLength(0);
    serve(25);
    expect(
      await host.handlers.readPrVideo(request, { signal: new AbortController().signal } as never),
    ).toMatchObject({ kind: "error", code: "read" });
  });
  it.each([
    [{ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER", stdout: "partial" }, "too_large"],
    [{ stderr: "secret token HTTP 403" }, "auth"],
    [{ stderr: "secret token HTTP 404" }, "missing"],
    [{ code: "ABORT_ERR" }, "read"],
  ])(
    "sanitizes host failures without leaking partial bytes or credentials",
    async (error, code) => {
      state.error = error;
      const result = await host.handlers.readPrVideo(request, {
        signal: new AbortController().signal,
      } as never);
      expect(result).toMatchObject({ kind: "error", code });
      expect(JSON.stringify(result)).not.toMatch(/secret|partial/);
    },
  );
});
