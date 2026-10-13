import { describe, expect, it, vi } from "vitest";

const ghStdout = vi.hoisted(() => ({ value: "" }));

vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const execFile = Object.assign(vi.fn(), {
    [promisify.custom]: () =>
      Object.assign(Promise.resolve({ stdout: ghStdout.value }), {
        child: { stdin: { end: () => undefined } },
      }),
  });
  return { execFile };
});

const { default: host } = await import("./host");

function rateLimitResponse(remaining: number) {
  return JSON.stringify({ resources: { graphql: { remaining, reset: 1_790_000_000 } } });
}

async function readRateLimitReset() {
  const context = { signal: new AbortController().signal } as Parameters<
    typeof host.handlers.readRateLimitReset
  >[1];
  return host.handlers.readRateLimitReset({}, context);
}

describe("readRateLimitReset", () => {
  it("returns the GraphQL reset time when the quota is used up", async () => {
    ghStdout.value = rateLimitResponse(0);
    expect(await readRateLimitReset()).toEqual({ resetAt: 1_790_000_000_000 });
  });

  it("returns null while quota remains", async () => {
    ghStdout.value = rateLimitResponse(12);
    expect(await readRateLimitReset()).toEqual({ resetAt: null });
  });
});

describe("fetchPrFiles", () => {
  it("returns less than the 8 MiB host output cap when the patches add up to more", async () => {
    const files = Array.from({ length: 100 }, (_, index) => ({
      filename: `src/file-${index}.ts`,
      status: "modified",
      patch: "+".repeat(200 * 1024),
    }));
    ghStdout.value = JSON.stringify(files);
    const context = { signal: new AbortController().signal } as Parameters<
      typeof host.handlers.fetchPrFiles
    >[1];

    const result = await host.handlers.fetchPrFiles(
      { owner: "o", repo: "r", number: 1, page: 1 },
      context,
    );

    expect(result).toMatchObject({ ok: true });
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(8 * 1024 * 1024);
  });
});
