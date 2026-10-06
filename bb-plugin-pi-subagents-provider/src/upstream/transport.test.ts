import { describe, expect, it, vi } from "vitest";
import { githubTransport } from "./transport.ts";
import { checkUpstream } from "./checker.ts";

it("uses bounded credential-free GET requests and checks page links", async () => {
  const path = "/repos/get-bb/bb/commits/abc?per_page=100&page=1";
  const fetcher = vi.fn(
    async () =>
      new Response('{"files":[]}', {
        headers: {
          link: '<https://api.github.com/repos/get-bb/bb/commits/abc?per_page=100&page=2>; rel="next"',
        },
      }),
  );
  const transport = githubTransport(fetcher);
  expect(await transport(path, new AbortController().signal)).toMatchObject({
    status: 200,
    next: true,
  });
  expect(fetcher.mock.calls[0]).toMatchObject([
    `https://api.github.com${path}`,
    { method: "GET", redirect: "error", credentials: "omit" },
  ]);
});

it("accepts GitHub's observed numeric comparison pagination hints", async () => {
  const range =
    "fdd3de3b19b97e6cd1ef7300cbb54711431249d3...72279d019a9ac82351dd3f7bd70862cbd050a02e";
  const path = `/repos/get-bb/bb/compare/${range}?per_page=100&page=1`;
  const alias = `https://api.github.com/repositories/1166119443/compare/${range}`;
  const link = `<${alias}?per_page=100&page=4>; rel="last", <${alias}?per_page=100&page=2>; rel="next", <${alias}?per_page=100&page=1>; rel="first"`;
  const fetcher = vi.fn(async () => new Response("{}", { headers: { link } }));
  const transport = githubTransport(fetcher);
  expect(await transport(path, new AbortController().signal)).toMatchObject({
    status: 200,
    next: true,
  });
  expect(fetcher.mock.calls[0]).toMatchObject([
    `https://api.github.com${path}`,
    { method: "GET", redirect: "error", credentials: "omit" },
  ]);
});

describe.each(["/repos/get-bb/bb", "/repositories/1166119443"])("%s pagination hints", (route) => {
  describe.each(["compare/base...head", "commits/abc"])("%s", (endpoint) => {
    it.each([1, 3])("rejects first=2 on current page %i", async (currentPage) => {
      const link = `<https://api.github.com${route}/${endpoint}?per_page=100&page=2>; rel="first"`;
      const transport = githubTransport(async () => new Response("{}", { headers: { link } }));
      await expect(
        transport(
          `/repos/get-bb/bb/${endpoint}?per_page=100&page=${currentPage}`,
          new AbortController().signal,
        ),
      ).rejects.toThrow("Invalid upstream pagination");
    });

    it.each([
      [1, 1],
      [1, 2],
      [3, 1],
      [3, 3],
      [3, 4],
    ])("rejects a prev hint from page %i to page %i", async (currentPage, previousPage) => {
      const link = `<https://api.github.com${route}/${endpoint}?per_page=100&page=${previousPage}>; rel="prev"`;
      const transport = githubTransport(async () => new Response("{}", { headers: { link } }));
      await expect(
        transport(
          `/repos/get-bb/bb/${endpoint}?per_page=100&page=${currentPage}`,
          new AbortController().signal,
        ),
      ).rejects.toThrow("Invalid upstream pagination");
    });

    it.each([
      {
        currentPage: 1,
        hints: [
          [1, "first"],
          [1, "last"],
        ],
        next: false,
      },
      {
        currentPage: 2,
        hints: [
          [1, "first"],
          [1, "prev"],
          [2, "last"],
        ],
        next: false,
      },
      {
        currentPage: 3,
        hints: [
          [1, "first"],
          [2, "prev"],
          [4, "next"],
          [5, "last"],
        ],
        next: true,
      },
    ])(
      "accepts valid first/prev hints on current page $currentPage",
      async ({ currentPage, hints, next }) => {
        const link = hints
          .map(
            ([page, relation]) =>
              `<https://api.github.com${route}/${endpoint}?per_page=100&page=${page}>; rel="${relation}"`,
          )
          .join(", ");
        const transport = githubTransport(async () => new Response("{}", { headers: { link } }));
        expect(
          await transport(
            `/repos/get-bb/bb/${endpoint}?per_page=100&page=${currentPage}`,
            new AbortController().signal,
          ),
        ).toMatchObject({ status: 200, next });
      },
    );
  });
});

it.each([
  ["extra query key", "per_page=100&page=1&unexpected=1", "per_page=100&page=2&unexpected=1"],
  ["nonstandard page size", "per_page=101&page=1", "per_page=101&page=2"],
  ["noncanonical current page", "per_page=100&page=01", "per_page=100&page=2"],
  ["duplicate page size", "per_page=100&page=1&per_page=100", "per_page=100&page=2&per_page=100"],
])("rejects pagination with an unsafe current query: %s", async (_label, current, next) => {
  const range =
    "fdd3de3b19b97e6cd1ef7300cbb54711431249d3...72279d019a9ac82351dd3f7bd70862cbd050a02e";
  const link = `<https://api.github.com/repositories/1166119443/compare/${range}?${next}>; rel="next"`;
  const transport = githubTransport(async () => new Response("{}", { headers: { link } }));
  await expect(
    transport(`/repos/get-bb/bb/compare/${range}?${current}`, new AbortController().signal),
  ).rejects.toThrow("Invalid upstream pagination");
});

it("keeps comparison requests pinned after alias hints and reports exhausted bounds", async () => {
  const baseline = "fdd3de3b19b97e6cd1ef7300cbb54711431249d3";
  const head = "72279d019a9ac82351dd3f7bd70862cbd050a02e";
  const range = `${baseline}...${head}`;
  const comparison = {
    base_commit: { sha: baseline },
    merge_base_commit: { sha: baseline },
    status: "ahead",
    total_commits: 101,
    ahead_by: 101,
  };
  const alias = `https://api.github.com/repositories/1166119443/compare/${range}`;
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify({ commit: { sha: head } })))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...comparison,
          commits: Array.from({ length: 100 }, (_, i) => ({
            sha: (i + 1).toString(16).padStart(40, "0"),
          })),
        }),
        {
          headers: {
            link: `<${alias}?per_page=100&page=2>; rel="last", <${alias}?per_page=100&page=2>; rel="next", <${alias}?per_page=100&page=1>; rel="first"`,
          },
        },
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ ...comparison, commits: [{ sha: head }] }), {
        headers: {
          link: `<${alias}?per_page=100&page=1>; rel="prev", <${alias}?per_page=100&page=1>; rel="first"`,
        },
      }),
    );
  const result = await checkUpstream(
    {
      schemaVersion: 1,
      repository: "https://github.com/get-bb/bb.git",
      branch: "main",
      revision: baseline,
      sourcePath: "plugins/provider-pi",
      watchedContractPaths: ["packages/plugin-sdk"],
    },
    {
      transport: githubTransport(fetcher),
      now: () => 0,
      bounds: { requests: 3 },
    },
  );
  expect(result).toEqual({
    status: "inconclusive",
    reason: "Comparison bound exhausted",
    baseline,
    head,
  });
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    "https://api.github.com/repos/get-bb/bb/branches/main",
    `https://api.github.com/repos/get-bb/bb/compare/${range}?per_page=100&page=1`,
    `https://api.github.com/repos/get-bb/bb/compare/${range}?per_page=100&page=2`,
  ]);
});

it.each([
  [
    "compare",
    "fdd3de3b19b97e6cd1ef7300cbb54711431249d3...72279d019a9ac82351dd3f7bd70862cbd050a02e",
  ],
  ["commits", "72279d019a9ac82351dd3f7bd70862cbd050a02e"],
])("accepts a complete final page's numeric %s hints", async (endpoint, revision) => {
  const alias = `https://api.github.com/repositories/1166119443/${endpoint}/${revision}`;
  const link = `<${alias}?per_page=100&page=4>; rel="last", <${alias}?per_page=100&page=3>; rel="prev", <${alias}?per_page=100&page=1>; rel="first"`;
  const transport = githubTransport(async () => new Response("{}", { headers: { link } }));
  expect(
    await transport(
      `/repos/get-bb/bb/${endpoint}/${revision}?per_page=100&page=4`,
      new AbortController().signal,
    ),
  ).toMatchObject({ status: 200, next: false });
});

it.each([
  ["zero repository ID", "/repositories/0/compare/base...head?per_page=100&page=2"],
  ["non-numeric repository ID", "/repositories/get-bb/compare/base...head?per_page=100&page=2"],
  ["negative repository ID", "/repositories/-1/compare/base...head?per_page=100&page=2"],
  [
    "leading-zero repository ID",
    "/repositories/01166119443/compare/base...head?per_page=100&page=2",
  ],
  ["decimal repository ID", "/repositories/1166119443.0/compare/base...head?per_page=100&page=2"],
  ["foreign commit range", "/repositories/1166119443/compare/base...different?per_page=100&page=2"],
  ["foreign endpoint", "/repositories/1166119443/commits/base...head?per_page=100&page=2"],
  ["foreign named repository", "/repos/get-bb/other/compare/base...head?per_page=100&page=2"],
  ["extra suffix", "/repositories/1166119443/compare/base...head/extra?per_page=100&page=2"],
  ["missing page size", "/repositories/1166119443/compare/base...head?page=2"],
  ["changed page size", "/repositories/1166119443/compare/base...head?per_page=101&page=2"],
  [
    "extra query key",
    "/repositories/1166119443/compare/base...head?per_page=100&page=2&unexpected=1",
  ],
  ["duplicate page", "/repositories/1166119443/compare/base...head?per_page=100&page=2&page=2"],
  [
    "duplicate page size",
    "/repositories/1166119443/compare/base...head?per_page=100&page=2&per_page=100",
  ],
  ["skipped page", "/repositories/1166119443/compare/base...head?per_page=100&page=3"],
  ["backward page", "/repositories/1166119443/compare/base...head?per_page=100&page=1"],
  ["zero page", "/repositories/1166119443/compare/base...head?per_page=100&page=0"],
  [
    "unsafe page integer",
    "/repositories/1166119443/compare/base...head?per_page=100&page=9007199254740992",
  ],
  ["fragment", "/repositories/1166119443/compare/base...head?per_page=100&page=2#fragment"],
  [
    "foreign origin",
    "https://evil.test/repositories/1166119443/compare/base...head?per_page=100&page=2",
  ],
  [
    "insecure origin",
    "http://api.github.com/repositories/1166119443/compare/base...head?per_page=100&page=2",
  ],
  [
    "credentials",
    "https://user:password@api.github.com/repositories/1166119443/compare/base...head?per_page=100&page=2",
  ],
])("rejects an unsafe alias hint: %s", async (_label, target) => {
  const link = `<${target.startsWith("/") ? `https://api.github.com${target}` : target}>; rel="next"`;
  const transport = githubTransport(async () => new Response("{}", { headers: { link } }));
  await expect(
    transport(
      "/repos/get-bb/bb/compare/base...head?per_page=100&page=1",
      new AbortController().signal,
    ),
  ).rejects.toThrow();
});

it.each([
  '?per_page=100&page=4>; rel="last"',
  '?per_page=100&page=2>; rel="next", <https://api.github.com/repositories/1166119443/compare/base...head?per_page=100&page=1>; rel="last"',
  '?per_page=100&page=2>; rel="next", <https://api.github.com/repositories/1166119443/compare/base...head?per_page=100&page=2>; rel="next"',
])("rejects incomplete or contradictory alias pagination %s", async (suffix) => {
  const link = `<https://api.github.com/repositories/1166119443/compare/base...head${suffix}`;
  const transport = githubTransport(async () => new Response("{}", { headers: { link } }));
  await expect(
    transport(
      "/repos/get-bb/bb/compare/base...head?per_page=100&page=1",
      new AbortController().signal,
    ),
  ).rejects.toThrow();
});

it.each([
  '<https://api.github.com/repos/get-bb/bb/commits/abc?per_page=100&page=2>; rel="last"',
  '<https://evil.test/?token=secret>; rel="next"',
  '<https://api.github.com/repos/get-bb/bb/commits/abc?per_page=100&page=3>; rel="next"',
  "invalid link",
  '<https://api.github.com/repos/get-bb/bb/commits/abc?page=2>; rel="next"',
])("rejects incomplete or foreign pagination %s", async (link) => {
  const transport = githubTransport(async () => new Response("{}", { headers: { link } }));
  await expect(
    transport("/repos/get-bb/bb/commits/abc?per_page=100&page=1", new AbortController().signal),
  ).rejects.toThrow();
});

it("rejects truncated JSON and response or total byte bounds", async () => {
  const signal = new AbortController().signal;
  await expect(
    githubTransport(async () => new Response("{"))("/repos/get-bb/bb/branches/main", signal),
  ).rejects.toThrow();
  await expect(
    githubTransport(async () => new Response('{"large":"payload"}'), {
      responseBytes: 4,
      totalBytes: 20,
    })("/repos/get-bb/bb/branches/main", signal),
  ).rejects.toThrow();
  const transport = githubTransport(async () => new Response("{}"), {
    responseBytes: 4,
    totalBytes: 3,
  });
  await transport("/repos/get-bb/bb/branches/main", signal);
  await expect(transport("/repos/get-bb/bb/branches/main", signal)).rejects.toThrow();
});
