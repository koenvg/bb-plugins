import { describe, expect, it, vi } from "vitest";
import { checkUpstream, runOutput, type Transport } from "./checker.ts";
import { githubTransport } from "./transport.ts";

const base = "a".repeat(40);
const head = "b".repeat(40);
const tree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const baseline = {
  schemaVersion: 1,
  repository: "https://github.com/get-bb/bb.git",
  branch: "main",
  revision: base,
  sourcePath: "plugins/provider-pi",
  watchedContractPaths: ["packages/plugin-sdk"],
};
const malicious =
  "https://user:password@evil.test/?token=secret /private/operator/file remote-message";
const responses = [
  { commit: { sha: head } },
  {
    base_commit: { sha: base },
    merge_base_commit: { sha: base },
    status: "ahead",
    total_commits: 1,
    ahead_by: 1,
    commits: [{ sha: head }],
  },
  { sha: head, parents: [{ sha: base }], commit: { tree: { sha: tree } }, files: [] },
  { sha: base, commit: { tree: { sha: tree } } },
];
const stages = ["branch", "comparison", "commit-files", "tree-coverage", "tree-coverage"] as const;

const failures: {
  label: string;
  reason: string;
  respond: () => Response | Promise<Response>;
  bytes?: "response" | "total";
}[] = [
  {
    label: "per-response byte limit",
    reason: "Upstream response bound exhausted",
    respond: () => new Response(JSON.stringify({ malicious: malicious.repeat(20) })),
    bytes: "response",
  },
  {
    label: "cumulative byte limit",
    reason: "Upstream response bound exhausted",
    respond: () => new Response(JSON.stringify({ malicious })),
    bytes: "total",
  },
  { label: "missing body", reason: "Missing upstream body", respond: () => new Response(null) },
  {
    label: "malformed UTF-8",
    reason: "Invalid upstream UTF-8",
    respond: () => new Response(Buffer.concat([Buffer.from(malicious), Buffer.from([0xc3, 0x28])])),
  },
  {
    label: "malformed JSON",
    reason: "Invalid upstream JSON",
    respond: () => new Response(`{"remote":"${malicious}"`),
  },
  {
    label: "invalid data shape",
    reason: "Invalid upstream data",
    respond: () => new Response(JSON.stringify([malicious])),
  },
  {
    label: "foreign pagination",
    reason: "Invalid upstream pagination",
    respond: () => new Response("{}", { headers: { link: `<${malicious}>; rel="next"` } }),
  },
  {
    label: "invalid pagination URL",
    reason: "Invalid upstream pagination",
    respond: () => new Response("{}", { headers: { link: '<https://[invalid>; rel="next"' } }),
  },
  {
    label: "network rejection",
    reason: "Upstream network failure",
    respond: async () => {
      throw new Error(malicious);
    },
  },
  {
    label: "untrusted SyntaxError",
    reason: "Upstream network failure",
    respond: async () => {
      throw new SyntaxError(malicious);
    },
  },
  {
    label: "stream read failure",
    reason: "Upstream network failure",
    respond: () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(Buffer.from(malicious));
            controller.error(new Error(malicious));
          },
        }),
      ),
  },
  ...([403, 429, 500] as const).map((status) => ({
    label: `HTTP ${status}`,
    reason: status === 500 ? "Upstream unavailable" : "Upstream access refused or rate limited",
    respond: () => new Response(malicious, { status, headers: { link: malicious } }),
  })),
];

describe.each(stages.map((stage, index) => ({ stage, index })))(
  "safe failures at $stage request $index",
  ({ stage, index }) => {
    it.each(failures)("reports $label without remote text or a retry", async (failure) => {
      const fetcher = vi.fn<typeof fetch>();
      for (const response of responses.slice(0, index))
        fetcher.mockResolvedValueOnce(new Response(JSON.stringify(response)));
      fetcher.mockImplementationOnce(async () => failure.respond());
      const priorBytes = responses
        .slice(0, index)
        .reduce((total, response) => total + Buffer.byteLength(JSON.stringify(response)), 0);
      const transport = githubTransport(fetcher, {
        responseBytes: failure.bytes === "response" ? 1024 : 4 * 1024 * 1024,
        totalBytes: failure.bytes === "total" ? priorBytes + 1 : 32 * 1024 * 1024,
      });
      const result = await checkUpstream(baseline, { transport, now: () => 0 });
      const expected = {
        status: "inconclusive",
        reason: failure.reason,
        stage,
        baseline: base,
        ...(index > 0 ? { head } : {}),
      };
      // Exact output also rules out raw errors, stacks, headers, bodies and request paths.
      expect(result).toEqual(expected);
      expect(runOutput(result)).toEqual({
        exitCode: 1,
        stdout: "",
        stderr: `${JSON.stringify(expected)}\n`,
      });
      expect(fetcher).toHaveBeenCalledTimes(index + 1);
      for (const [, options] of fetcher.mock.calls)
        expect(options).toMatchObject({ method: "GET", redirect: "error", credentials: "omit" });
    });
  },
);

it.each([
  [
    '<https://api.github.com/repos/get-bb/bb/compare/RANGE?per_page=100&page=3>; rel="next"',
    "Incomplete upstream pagination",
  ],
  [
    '<https://api.github.com/repos/get-bb/bb/compare/RANGE?per_page=100&page=2>; rel="last"',
    "Incomplete upstream pagination",
  ],
  [`<${malicious}>; rel="next"`, "Invalid upstream pagination"],
  ['<https://[invalid>; rel="next"', "Invalid upstream pagination"],
])("reports rejected comparison pagination %s", async (link, reason) => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify(responses[0])))
    .mockResolvedValueOnce(
      new Response("{}", { headers: { link: link.replace("RANGE", `${base}...${head}`) } }),
    );
  const result = await checkUpstream(baseline, {
    transport: githubTransport(fetcher),
    now: () => 0,
  });
  expect(result).toEqual({
    status: "inconclusive",
    reason,
    stage: "comparison",
    baseline: base,
    head,
  });
  expect(runOutput(result).exitCode).toBe(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("reports baseline-stage failures without making requests", async () => {
  const transport = vi.fn();
  const result = await checkUpstream(
    { ...baseline, revision: malicious },
    { transport, now: () => 0 },
  );
  expect(result).toEqual({
    status: "inconclusive",
    reason: "Missing or invalid baseline or upstream data",
    stage: "baseline",
  });
  expect(transport).not.toHaveBeenCalled();
});

it("retains the request-timeout category and stage", async () => {
  vi.useFakeTimers();
  try {
    const transport = vi.fn<Transport>(() => new Promise<never>(() => {}));
    const pending = checkUpstream(baseline, { transport, now: () => 0, bounds: { requestMs: 1 } });
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({
      status: "inconclusive",
      reason: "Upstream request timed out",
      stage: "branch",
      baseline: base,
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][1].aborted).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
