import { beforeEach, describe, expect, it, vi } from "vitest";

const github = vi.hoisted(() => ({
  body: "",
  failures: [] as Response[],
  requests: [] as { url: string; body: unknown }[],
}));

vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const execFile = Object.assign(vi.fn(), {
    [promisify.custom]: () =>
      Object.assign(Promise.resolve({ stdout: "token\n" }), {
        child: { stdin: { end: () => undefined } },
      }),
  });
  return { execFile };
});

vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
  github.requests.push({ url, body: init.body });
  return github.failures.shift() ?? new Response(github.body);
});

const httpError = (status: number) => new Response("", { status });

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
    github.body = rateLimitResponse(0);
    expect(await readRateLimitReset()).toEqual({ resetAt: 1_790_000_000_000 });
  });

  it("returns null while quota remains", async () => {
    github.body = rateLimitResponse(12);
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
    github.body = JSON.stringify(files);
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

describe("fetchReviewQueue", () => {
  const queueResponse = JSON.stringify({
    data: { viewer: { login: "me" }, reviewRequests: { issueCount: 0, nodes: [] } },
  });
  const tracked = (count: number) =>
    Array.from({ length: count }, (_, number) => ({ owner: "acme", repo: "api", number }));

  beforeEach(() => {
    github.requests.length = 0;
    github.failures.length = 0;
    github.body = queueResponse;
  });

  async function fetchReviewQueue(count: number) {
    const context = { signal: new AbortController().signal } as Parameters<
      typeof host.handlers.fetchReviewQueue
    >[1];
    return host.handlers.fetchReviewQueue({ tracked: tracked(count) }, context);
  }

  it("asks GitHub in one request per 8 tracked PRs", async () => {
    expect(await fetchReviewQueue(17)).toMatchObject({ ok: true });
    expect(github.requests).toHaveLength(3);
  });

  it("returns the failure of a batch when the other batches succeed", async () => {
    github.failures.push(httpError(502));

    expect(await fetchReviewQueue(17)).toEqual({
      ok: false,
      failure: { kind: "failed", message: "gh: HTTP 502" },
    });
  });

  it("returns a rate limit before a plain failure", async () => {
    github.failures.push(
      httpError(502),
      Response.json({ message: "API rate limit exceeded for user ID 1." }, { status: 403 }),
    );

    expect(await fetchReviewQueue(9)).toMatchObject({
      ok: false,
      failure: { kind: "rate_limited" },
    });
  });

  it("takes the rate limit reset time from the GitHub response headers", async () => {
    github.failures.push(
      Response.json(
        { message: "API rate limit exceeded for user ID 1." },
        {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1790000000" },
        },
      ),
    );

    expect(await fetchReviewQueue(0)).toEqual({
      ok: false,
      failure: { kind: "rate_limited", resetAt: 1_790_000_000_000 },
    });
    expect(github.requests).toHaveLength(1);
  });

  it("retries a request once when GitHub times out", async () => {
    github.failures.push(httpError(504));

    expect(await fetchReviewQueue(0)).toEqual({ ok: true, data: [JSON.parse(queueResponse)] });
    expect(github.requests).toHaveLength(2);
  });

  it("fails when GitHub times out twice", async () => {
    github.failures.push(httpError(504), httpError(504));

    expect(await fetchReviewQueue(0)).toEqual({
      ok: false,
      failure: { kind: "failed", message: "gh: HTTP 504" },
    });
    expect(github.requests).toHaveLength(2);
  });
});

describe("renderMarkdown", () => {
  const context = { signal: new AbortController().signal } as Parameters<
    typeof host.handlers.renderMarkdown
  >[1];

  beforeEach(() => {
    github.requests.length = 0;
    github.failures.length = 0;
  });

  it("renders the text in the repository's context and returns the HTML", async () => {
    github.body = '<p><img src="https://private-user-images.githubusercontent.com/x"></p>\n';

    const result = await host.handlers.renderMarkdown(
      { owner: "octo", repo: "app", text: "<img src=x>" },
      context,
    );

    expect(result).toEqual({ ok: true, html: github.body });
    expect(github.requests).toHaveLength(1);
    expect(github.requests[0]!.url).toBe("https://api.github.com/markdown");
    expect(JSON.parse(String(github.requests[0]!.body))).toEqual({
      text: "<img src=x>",
      mode: "gfm",
      context: "octo/app",
    });
  });

  it("returns the gh failure", async () => {
    github.failures.push(httpError(502));

    expect(
      await host.handlers.renderMarkdown({ owner: "octo", repo: "app", text: "x" }, context),
    ).toEqual({ ok: false, failure: { kind: "failed", message: "gh: HTTP 502" } });
  });
});
