import { expect, it, vi } from "vitest";
import { githubTransport } from "./transport.ts";

it("uses bounded credential-free GET requests and checks page links", async () => {
  const path = "/repos/get-bb/bb/commits/abc?per_page=100&page=1";
  const fetcher = vi.fn(async () => new Response('{"files":[]}', { headers: { link: '<https://api.github.com/repos/get-bb/bb/commits/abc?per_page=100&page=2>; rel="next"' } }));
  const transport = githubTransport(fetcher);
  expect(await transport(path, new AbortController().signal)).toMatchObject({ status: 200, next: true });
  expect(fetcher.mock.calls[0]).toMatchObject([`https://api.github.com${path}`, { method: "GET", redirect: "error", credentials: "omit" }]);
});

it.each([
  '<https://api.github.com/repos/get-bb/bb/commits/abc?per_page=100&page=2>; rel="last"',
  '<https://evil.test/?token=secret>; rel="next"',
  '<https://api.github.com/repos/get-bb/bb/commits/abc?per_page=100&page=3>; rel="next"',
  "invalid link", '<https://api.github.com/repos/get-bb/bb/commits/abc?page=2>; rel="next"',
])("rejects incomplete or foreign pagination %s", async (link) => {
  const transport = githubTransport(async () => new Response("{}", { headers: { link } }));
  await expect(transport("/repos/get-bb/bb/commits/abc?per_page=100&page=1", new AbortController().signal)).rejects.toThrow();
});

it("rejects truncated JSON and response or total byte bounds", async () => {
  const signal = new AbortController().signal;
  await expect(githubTransport(async () => new Response('{'))("/repos/get-bb/bb/branches/main", signal)).rejects.toThrow();
  await expect(githubTransport(async () => new Response('{"large":"payload"}'), { responseBytes: 4, totalBytes: 20 })("/repos/get-bb/bb/branches/main", signal)).rejects.toThrow();
  const transport = githubTransport(async () => new Response('{}'), { responseBytes: 4, totalBytes: 3 });
  await transport("/repos/get-bb/bb/branches/main", signal);
  await expect(transport("/repos/get-bb/bb/branches/main", signal)).rejects.toThrow();
});
