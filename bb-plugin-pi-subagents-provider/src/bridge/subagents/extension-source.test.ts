import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { SUBAGENT_STATUS_SOURCE } from "./extension-source.js";

function fixture(reply?: (method: string, request: { requestId: string }) => unknown) {
  const bus = new EventEmitter();
  const methods: string[] = [];
  const hooks = new Map<string, () => void>();
  let file = "/owned/session.jsonl";
  const session = () => ({ sessionId: "owned-pi-session", sessionFile: file });
  const events = { on(name: string, handler: (v: unknown) => void) { bus.on(name, handler); return () => bus.off(name, handler); }, emit(name: string, value: unknown) { bus.emit(name, value); } };
  bus.on("subagents:rpc:v1:request", (request) => {
    methods.push(request.method);
    const data = reply ? reply(request.method, request) : request.method === "ping" ? { version: 1, methods: ["ping", "status"], session: session(), capabilities: { asyncStatusSnapshot: { version: 1 }, statusProjection: { version: 1 } } } : { asyncSnapshot: { runs: [] } };
    if (data !== undefined) bus.emit(`subagents:rpc:v1:reply:${request.requestId}`, { version: 1, requestId: request.requestId, method: request.method, success: true, data });
  });
  const install = new Function(`${SUBAGENT_STATUS_SOURCE}; return installSubagentStatusChannel;`)();
  const read = install({ events, on: (name: string, handler: () => void) => hooks.set(name, handler) }, () => ({ sessionManager: { getSessionId: () => session().sessionId, getSessionFile: () => file } }), () => {});
  return { read: read as () => Promise<unknown>, methods, bus, hooks, replace: () => { file = "/new/session.jsonl"; } };
}
afterEach(() => vi.useRealTimers());
it("uses only correlated ping/status with no prompt or notification acknowledgement", async () => {
  const h = fixture();
  await expect(h.read()).resolves.toMatchObject({ sessionFile: "/owned/session.jsonl", sessionId: "owned-pi-session" });
  expect(h.methods).toEqual(["ping", "status"]);
  expect(h.bus.eventNames().filter((name) => String(name).startsWith("subagents:rpc:v1:reply:"))).toEqual([]);
});
it("times out unsupported RPC and removes its reply listener", async () => {
  vi.useFakeTimers();
  const h = fixture(() => undefined);
  const read = h.read();
  const failure = expect(read).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(1001);
  await failure;
  expect(h.methods).toEqual(["ping"]);
  expect(h.bus.eventNames().filter((name) => String(name).startsWith("subagents:rpc:v1:reply:"))).toEqual([]);
});
it("cancels pending reads and subscriptions on shutdown", async () => {
  const h = fixture(() => undefined);
  const failure = expect(h.read()).rejects.toThrow("disposed");
  h.hooks.get("session_shutdown")!();
  await failure;
  expect(h.bus.eventNames()).toEqual(["subagents:rpc:v1:request"]);
});
it("rejects session replacement during a status reply", async () => {
  let h: ReturnType<typeof fixture>;
  h = fixture((method) => {
    if (method === "status") { h.replace(); return {}; }
    return { version: 1, methods: ["ping", "status"], session: { sessionId: "owned-pi-session", sessionFile: "/owned/session.jsonl" }, capabilities: { asyncStatusSnapshot: { version: 1 }, statusProjection: { version: 1 } } };
  });
  await expect(h.read()).rejects.toThrow("replaced");
  expect(h.methods).toEqual(["ping", "status"]);
});
