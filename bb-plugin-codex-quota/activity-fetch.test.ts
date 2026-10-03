import { describe, expect, it, vi } from "vitest";
import { fetchNormalizedActivity } from "./activity-fetch.js";
const time = Date.UTC(2026, 3, 23, 12);
const signal = () => new AbortController().signal;
describe("bounded profile endpoint", () => {
  it("uses only the fixed activity endpoint and returns no credentials or account claims", async () => {
    const token = `e30.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "private-id" } })).toString("base64url")}.signature`;
    const read = vi.fn(async (url, init) => {
      expect(url).toBe("https://chatgpt.com/backend-api/wham/profiles/me");
      expect(init.redirect).toBe("error"); expect(init.headers.Authorization).toBe(`Bearer ${token}`);
      expect(init.headers["ChatGPT-Account-Id"]).toBe("private-id");
      return new Response(JSON.stringify({ email: "private@example.invalid", stats: { lifetime_tokens: 12 } }));
    });
    const result = await fetchNormalizedActivity(token, signal(), read, () => time);
    expect(result.status).toBe("ok");
    expect(JSON.stringify(result)).not.toMatch(/private|signature|Authorization/);
    expect(result.snapshot?.observedAt).toBe(new Date(time).toISOString()); expect(read).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 429, 500, 302])("returns fixed status for %i without reading raw errors", async status => {
    const response = new Response("private raw error", { status });
    const result = await fetchNormalizedActivity("secret", signal(), async () => response, () => time);
    expect(result).toEqual({ status: status === 401 || status === 403 ? "auth-expired" : "service", snapshot: null });
    expect(response.body?.locked).toBe(false);
  });
  it.each(["not-json", JSON.stringify({ stats: {} }), "x".repeat(65537)])("rejects malformed/oversize data", async body => {
    expect(await fetchNormalizedActivity("secret", signal(), async () => new Response(body), () => time)).toEqual({ status: "unsupported", snapshot: null });
  });
  it("cancels a stream at the byte limit, not the content-length claim", async () => {
    const cancel = vi.fn(); let pulls = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(16384)); }, cancel });
    expect(await fetchNormalizedActivity("secret", signal(), async () => new Response(body), () => time)).toEqual({ status: "unsupported", snapshot: null });
    expect(cancel).toHaveBeenCalled(); expect(pulls).toBeLessThanOrEqual(6);
  });
  it("does not let a stalled body defeat cancellation", async () => {
    const controller = new AbortController(); const cancel = vi.fn();
    const result = fetchNormalizedActivity("secret", controller.signal, async () => new Response(new ReadableStream({ cancel })), () => time);
    await Promise.resolve(); controller.abort();
    expect((await result).snapshot).toBeNull(); expect(cancel).toHaveBeenCalled();
  });
  it("returns no arbitrary thrown error", async () => {
    expect(await fetchNormalizedActivity("secret", signal(), async () => { throw new Error("private error"); }, () => time)).toEqual({ status: "network", snapshot: null });
  });
});
