import type { Transport } from "./checker.ts";

const origin = "https://api.github.com";
const byteLimits = { responseBytes: 4 * 1024 * 1024, totalBytes: 32 * 1024 * 1024 };

/** No credentials, retries, disk cache, redirects, or downloaded code execution. */
export function githubTransport(fetcher: typeof fetch = fetch, bounds = byteLimits): Transport {
  let total = 0;
  for (const key of ["responseBytes", "totalBytes"] as const) {
    if (!Number.isSafeInteger(bounds[key]) || bounds[key] < 1 || bounds[key] > byteLimits[key]) throw new Error("Invalid transport bounds");
  }
  return async (path, signal) => {
    if (!/^\/repos\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\/(?:branches|compare|commits|git\/trees)\//.test(path)) throw new Error("Invalid upstream request");
    const url = new URL(path, origin);
    if (url.origin !== origin || url.username || url.password || url.hash) throw new Error("Invalid upstream request");
    const response = await fetcher(url.href, {
      method: "GET", redirect: "error", credentials: "omit", signal,
      headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return { status: response.status, data: null, next: false };
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Missing upstream body");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength; total += value.byteLength;
        if (size > bounds.responseBytes || total > bounds.totalBytes) throw new Error("Upstream response bound exhausted");
        chunks.push(value);
      }
      const bytes = Buffer.concat(chunks);
      const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      return { status: 200, data, next: hasNextPage(response.headers.get("link"), url) };
    } finally { await reader.cancel(); }
  };
}

function hasNextPage(link: string | null, current: URL): boolean {
  if (!link) return false;
  const currentPage = current.searchParams.get("page");
  if (current.searchParams.size !== 2 || current.searchParams.get("per_page") !== "100" ||
      !currentPage || !/^[1-9]\d*$/.test(currentPage) || !Number.isSafeInteger(Number(currentPage))) throw new Error("Invalid upstream pagination");
  let next = false;
  let lastPage: number | undefined;
  const relations = new Set<string>();
  for (const part of link.split(",")) {
    const match = /^\s*<([^>]+)>;\s*rel="(next|prev|first|last)"\s*$/.exec(part);
    if (!match || relations.has(match[2])) throw new Error("Invalid upstream pagination");
    relations.add(match[2]);
    const target = new URL(match[1]);
    // Numeric repository routes are hints only. Requests stay on the caller's owner/repository route.
    const alias = /^\/repositories\/[1-9]\d*(\/.*)$/.exec(target.pathname);
    const suffix = current.pathname.replace(/^\/repos\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+(?=\/)/, "");
    const samePath = target.pathname === current.pathname || alias?.[1] === suffix;
    if (target.origin !== origin || !samePath || target.username || target.password || target.hash) throw new Error("Invalid upstream pagination");
    const page = target.searchParams.get("page");
    if (!page || !/^[1-9]\d*$/.test(page) || !Number.isSafeInteger(Number(page))) throw new Error("Invalid upstream pagination");
    const expected = new URL(current);
    expected.searchParams.set("page", page);
    if (target.searchParams.toString() !== expected.searchParams.toString()) throw new Error("Invalid upstream pagination");
    if (match[2] === "last") lastPage = Number(page);
    if (match[2] === "next") {
      if (Number(page) !== Number(current.searchParams.get("page")) + 1) throw new Error("Incomplete upstream pagination");
      next = true;
    }
  }
  if (lastPage !== undefined && (lastPage < Number(current.searchParams.get("page")) || (lastPage > Number(current.searchParams.get("page"))) !== next)) throw new Error("Incomplete upstream pagination");
  return next;
}
