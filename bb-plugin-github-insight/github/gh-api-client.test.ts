import { describe, expect, it } from "vitest";
import { createGhApi, rateLimitResetOf } from "./gh-api-client";
import { classifyGhFailure, ghProcessError, isGithubTimeout } from "./gh-failure";
import { readNotFoundPartial } from "./not-found-partial";
import { overviewPageArgs } from "./overview-query";
import { checkRunDetailsArgs } from "./check-run-details-query";
import { prFilesPageArgs } from "./pr-files-query";

interface SentRequest {
  url: string;
  method: string | undefined;
  authorization: string | null;
  body: unknown;
}

const JSON_TYPE = { "content-type": "application/json; charset=utf-8" };

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_TYPE, ...headers } });
}

function setup({
  responses = [],
  tokens = ["t1"],
  ghOutput = "spawned",
}: {
  responses?: Response[];
  tokens?: (string | Error)[];
  ghOutput?: string;
} = {}) {
  const sent: SentRequest[] = [];
  const spawned: { args: string[]; stdin: string | undefined }[] = [];
  const api = createGhApi({
    fetch: async (url, init) => {
      const headers = new Headers(init.headers);
      const body = typeof init.body === "string" ? init.body : undefined;
      sent.push({
        url,
        method: init.method,
        authorization: headers.get("authorization"),
        body: body?.startsWith("{") === true ? JSON.parse(body) : body,
      });
      init.signal?.throwIfAborted();
      return responses.shift() ?? jsonResponse({ data: {} });
    },
    runGh: async (args, _signal, stdin) => {
      spawned.push({ args, stdin });
      if (args[0] !== "auth") {
        return ghOutput;
      }
      const token = tokens.shift() ?? "t-last";
      if (token instanceof Error) {
        throw token;
      }
      return `${token}\n`;
    },
  });
  const run = (args: string[], stdin?: string, signal = new AbortController().signal) =>
    api(args, signal, stdin);
  return { run, sent, spawned };
}

async function failureOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => expect.fail("expected the call to fail"),
    (error: unknown) => error,
  );
  const stdout =
    typeof error === "object" && error !== null && "stdout" in error ? String(error.stdout) : "";
  return {
    failure: classifyGhFailure(ghProcessError(error)),
    stdout,
    resetAt: rateLimitResetOf(error),
  };
}

describe("createGhApi requests", () => {
  it("sends a GraphQL query with -f strings and -F typed values as variables", async () => {
    const { run, sent } = setup();
    const args = overviewPageArgs({ owner: "o", repo: "r", number: 5, after: null });

    await run(args);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      url: "https://api.github.com/graphql",
      method: "POST",
      authorization: "bearer t1",
    });
    expect(sent[0]!.body).toEqual({
      query: expect.stringContaining("query"),
      variables: { owner: "o", repo: "r", number: 5, firstPage: true },
    });
  });

  it.each([
    ["false", false],
    ["null", null],
    ["-7", -7],
    ["abc", "abc"],
  ])("coerces -F %s like gh", async (raw, value) => {
    const { run, sent } = setup();

    await run(["api", "graphql", "-f", "query=q", "-F", `v=${raw}`]);

    expect(sent[0]!.body).toEqual({ query: "q", variables: { v: value } });
  });

  it("keeps a -f number as a string", async () => {
    const { run, sent } = setup();

    await run(["api", "graphql", "-f", "query=q", "-f", "v=5"]);

    expect(sent[0]!.body).toEqual({ query: "q", variables: { v: "5" } });
  });

  it("sends repeated key[] fields as an array", async () => {
    const { run, sent } = setup();

    await run(checkRunDetailsArgs({ ids: ["a", "b"] }));

    expect(sent[0]!.body).toMatchObject({ variables: { ids: ["a", "b"] } });
  });

  it("puts operationName next to the query and omits empty variables", async () => {
    const { run, sent } = setup();

    await run(["api", "graphql", "-f", "query=q", "-f", "operationName=Op"]);

    expect(sent[0]!.body).toEqual({ query: "q", operationName: "Op" });
  });

  it("GETs a REST path and returns the body unchanged", async () => {
    const files = [{ filename: "a.ts", status: "added" }];
    const { run, sent } = setup({ responses: [jsonResponse(files)] });

    const stdout = await run(prFilesPageArgs({ owner: "o", repo: "r", number: 1, page: 2 }));

    expect(JSON.parse(stdout)).toEqual(files);
    expect(sent[0]).toMatchObject({
      url: "https://api.github.com/repos/o/r/pulls/1/files?per_page=100&page=2",
      method: "GET",
      body: undefined,
    });
  });

  it("drops a leading slash from the endpoint", async () => {
    const { run, sent } = setup();

    await run(["api", "/rate_limit"]);

    expect(sent[0]!.url).toBe("https://api.github.com/rate_limit");
  });

  it("POSTs stdin as the body for --input -", async () => {
    const html = "<p>hi</p>\n";
    const { run, sent } = setup({
      responses: [new Response(html, { headers: { "content-type": "text/html" } })],
    });
    const input = JSON.stringify({ text: "hi", mode: "gfm" });

    expect(await run(["api", "markdown", "--input", "-"], input)).toBe(html);
    expect(sent[0]).toMatchObject({
      url: "https://api.github.com/markdown",
      method: "POST",
      body: { text: "hi", mode: "gfm" },
    });
  });

  it("POSTs an empty body for --input - without stdin", async () => {
    const { run, sent } = setup();

    await run(["api", "graphql", "--input", "-"]);

    expect(sent[0]).toMatchObject({ method: "POST", body: "" });
  });

  it.each([
    ["--paginate", ["api", "--paginate", "--slurp", "user/teams?per_page=100"]],
    ["--jq", ["api", "repos/o/r", "--jq", ".id"]],
    ["a non-api command", ["repo", "view"]],
    ["-F @file", ["api", "graphql", "-f", "query=q", "-F", "body=@notes.md"]],
    ["-F placeholder", ["api", "graphql", "-f", "query=q", "-F", "o={owner}"]],
    ["-F unsafe integer", ["api", "graphql", "-f", "query=q", "-F", "n=99999999999999999999"]],
    ["a field without =", ["api", "graphql", "-f", "query"]],
    ["a trailing -f", ["api", "graphql", "-f"]],
    ["a nested key", ["api", "graphql", "-f", "query=q", "-f", "a[b]=1"]],
    ["a malformed array key", ["api", "graphql", "-f", "query=q", "-f", "a][=1"]],
    ["a doubly nested array", ["api", "graphql", "-f", "query=q", "-f", "a[b][]=1"]],
    ["key[] after a scalar key", ["api", "graphql", "-f", "query=q", "-f", "a=1", "-f", "a[]=2"]],
    ["--input from a file", ["api", "markdown", "--input", "body.json"]],
    ["--input with fields", ["api", "graphql", "--input", "-", "-f", "a=1"]],
    ["REST fields", ["api", "repos/o/r/issues", "-f", "title=x"]],
    ["two endpoints", ["api", "rate_limit", "user"]],
    ["no endpoint", ["api"]],
    ["a full URL", ["api", "https://example.com/x"]],
    ["a placeholder path", ["api", "repos/{owner}/{repo}"]],
  ])("falls back to the gh process for %s", async (_name, args) => {
    const { run, sent, spawned } = setup();

    expect(await run(args, "in")).toBe("spawned");
    expect(sent).toEqual([]);
    expect(spawned).toEqual([{ args, stdin: "in" }]);
  });
});

describe("createGhApi token", () => {
  it("asks gh for the token once and shares it across concurrent calls", async () => {
    const { run, sent, spawned } = setup({ tokens: ["t1", "t2"] });

    await Promise.all([run(["api", "rate_limit"]), run(["api", "rate_limit"])]);
    await run(["api", "rate_limit"]);

    expect(spawned).toEqual([
      { args: ["auth", "token", "--hostname", "github.com"], stdin: undefined },
    ]);
    expect(sent.map(({ authorization }) => authorization)).toEqual([
      "bearer t1",
      "bearer t1",
      "bearer t1",
    ]);
  });

  it("reads a new token and retries once when GitHub answers 401", async () => {
    const { run, sent } = setup({
      tokens: ["old", "new"],
      responses: [jsonResponse({ message: "Bad credentials" }, 401), jsonResponse({ ok: 1 })],
    });

    expect(JSON.parse(await run(["api", "rate_limit"]))).toEqual({ ok: 1 });
    await run(["api", "rate_limit"]);
    expect(sent.map(({ authorization }) => authorization)).toEqual([
      "bearer old",
      "bearer new",
      "bearer new",
    ]);
  });

  it("reads the token once when concurrent calls both get 401", async () => {
    const { run, spawned } = setup({
      tokens: ["old", "new", "newer"],
      responses: [
        jsonResponse({ message: "Bad credentials" }, 401),
        jsonResponse({ message: "Bad credentials" }, 401),
      ],
    });

    await Promise.all([run(["api", "rate_limit"]), run(["api", "rate_limit"])]);

    expect(spawned).toHaveLength(2);
  });

  it("reports logged out when GitHub rejects the fresh token too", async () => {
    const { run } = setup({
      responses: [
        jsonResponse({ message: "Bad credentials" }, 401),
        jsonResponse({ message: "Bad credentials" }, 401),
      ],
    });

    expect((await failureOf(run(["api", "rate_limit"]))).failure).toEqual({
      kind: "gh_logged_out",
    });
  });

  it("reports gh missing when gh is not installed", async () => {
    const missing = Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" });
    const { run } = setup({ tokens: [missing] });

    expect((await failureOf(run(["api", "rate_limit"]))).failure).toEqual({ kind: "gh_missing" });
  });

  it("reports logged out when gh has no token, and asks again on the next call", async () => {
    const noToken = Object.assign(new Error("Command failed"), {
      code: 1,
      stderr: "no oauth token found for github.com\n",
    });
    const { run, sent } = setup({ tokens: [noToken, "t2"] });

    expect((await failureOf(run(["api", "rate_limit"]))).failure).toEqual({
      kind: "gh_logged_out",
    });
    await run(["api", "rate_limit"]);
    expect(sent.map(({ authorization }) => authorization)).toEqual(["bearer t2"]);
  });

  it("reports logged out when gh prints an empty token", async () => {
    const { run } = setup({ tokens: [""] });

    expect((await failureOf(run(["api", "rate_limit"]))).failure).toEqual({
      kind: "gh_logged_out",
    });
  });
});

describe("createGhApi failures", () => {
  const notFound = {
    data: { repository: { pullRequest: null } },
    errors: [
      { type: "NOT_FOUND", path: ["repository", "pullRequest"], message: "Could not resolve" },
    ],
  };

  it("fails a GraphQL response with errors like gh and keeps the body on stdout", async () => {
    const { run } = setup({ responses: [jsonResponse(notFound)] });

    const { failure, stdout } = await failureOf(run(["api", "graphql", "-f", "query=q"]));

    expect(failure).toEqual({ kind: "failed", message: "gh: Could not resolve" });
    expect(readNotFoundPartial(stdout)).toEqual(notFound);
  });

  it("joins several GraphQL error messages, string errors included", async () => {
    const { run } = setup({
      responses: [jsonResponse({ errors: [{ message: "one" }, "two", { type: "X" }] })],
    });

    expect((await failureOf(run(["api", "graphql", "-f", "query=q"]))).failure).toEqual({
      kind: "failed",
      message: "gh: one\ntwo",
    });
  });

  it("returns a GraphQL body with an empty errors list", async () => {
    const body = { data: { viewer: null }, errors: [] };
    const { run } = setup({ responses: [jsonResponse(body)] });

    expect(JSON.parse(await run(["api", "graphql", "-f", "query=q"]))).toEqual(body);
  });

  it("returns a GraphQL body that is not a JSON object", async () => {
    const { run } = setup({ responses: [jsonResponse("plain")] });

    expect(JSON.parse(await run(["api", "graphql", "-f", "query=q"]))).toBe("plain");
  });

  it("fails a REST error with the GitHub message and status", async () => {
    const { run } = setup({ responses: [jsonResponse({ message: "Not Found" }, 404)] });

    expect((await failureOf(run(["api", "repos/o/r/pulls/9/files"]))).failure).toEqual({
      kind: "failed",
      message: "gh: Not Found (HTTP 404)",
    });
  });

  it("fails a non-JSON error with the status, which reads as a GitHub timeout", async () => {
    const { run } = setup({
      responses: [
        new Response("<html>", { status: 504, headers: { "content-type": "text/html" } }),
      ],
    });

    const { failure } = await failureOf(run(["api", "graphql", "-f", "query=q"]));

    expect(failure).toEqual({ kind: "failed", message: "gh: HTTP 504" });
    expect(isGithubTimeout(failure)).toBe(true);
  });

  it("fails a truncated JSON body as a GitHub timeout", async () => {
    const { run } = setup({
      responses: [new Response('{"data":', { headers: JSON_TYPE })],
    });

    const { failure } = await failureOf(run(["api", "graphql", "-f", "query=q"]));

    expect(isGithubTimeout(failure)).toBe(true);
  });

  it("returns a successful REST body without reading it as JSON", async () => {
    const { run } = setup({ responses: [new Response("{not json", { headers: JSON_TYPE })] });

    expect(await run(["api", "rate_limit"])).toBe("{not json");
  });

  it("reports a primary rate limit with the reset time from the headers", async () => {
    const { run } = setup({
      responses: [
        jsonResponse({ message: "API rate limit exceeded for user ID 1." }, 403, {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1790000000",
        }),
      ],
    });

    const { failure, resetAt } = await failureOf(run(["api", "rate_limit"]));

    expect(failure).toEqual({ kind: "rate_limited", resetAt: null });
    expect(resetAt).toBe(1_790_000_000_000);
  });

  it("reports a GraphQL RATE_LIMITED error as rate limited", async () => {
    const { run } = setup({
      responses: [
        jsonResponse(
          { errors: [{ type: "RATE_LIMITED", message: "API rate limit already exceeded" }] },
          200,
          { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1790000000" },
        ),
      ],
    });

    const { failure, resetAt } = await failureOf(run(["api", "graphql", "-f", "query=q"]));

    expect(failure.kind).toBe("rate_limited");
    expect(resetAt).toBe(1_790_000_000_000);
  });

  it("leaves the reset time unknown for a secondary rate limit", async () => {
    const { run } = setup({
      responses: [
        jsonResponse({ message: "You have exceeded a secondary rate limit." }, 403, {
          "x-ratelimit-remaining": "4000",
          "x-ratelimit-reset": "1790000000",
        }),
      ],
    });

    const { failure, resetAt } = await failureOf(run(["api", "rate_limit"]));

    expect(failure.kind).toBe("rate_limited");
    expect(resetAt).toBeNull();
  });

  it("passes the abort signal to the request", async () => {
    const { run } = setup();
    const controller = new AbortController();
    controller.abort();

    await expect(run(["api", "rate_limit"], undefined, controller.signal)).rejects.toThrow();
  });
});

describe("rateLimitResetOf", () => {
  it("has no reset time for a gh process error", () => {
    expect(rateLimitResetOf(Object.assign(new Error("x"), { stderr: "rate limit" }))).toBeNull();
  });
});
