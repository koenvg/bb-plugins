import { expect, it, vi } from "vitest";
import { createCaptureQueue } from "./capture.js";
const target = (id = "run") => ({ id, asyncId: id, sessionId: "pi", sessionFile: "/owned/session", generation: 1 });
const reply = (t: ReturnType<typeof target>, requestId: string) => ({ kind: "pi-subagents.inspect-reply", version: 1, requestId, asyncId: t.asyncId, task: "read files", finalOutput: "answer", messages: [], truncated: { task: false, finalOutput: false, messages: 0 } });
it("serializes, coalesces and correlates bounded capture without owning execution", async () => {
  let release!: () => void;
  const first = new Promise<void>(r => { release = r; });
  const captures: unknown[] = [];
  const inspect = vi.fn(async (t, id) => { if (inspect.mock.calls.length === 1) await first; return reply(t, id); });
  const q = createCaptureQueue({ inspect, accept: (_id, result) => captures.push(result), now: () => 1, rateMs: 0 });
  q.enqueue(target()); q.enqueue(target("next")); q.enqueue(target("next"));
  expect(inspect).toHaveBeenCalledTimes(1);
  release(); await q.drain();
  expect(inspect).toHaveBeenCalledTimes(2);
  expect(captures).toHaveLength(2);
  q.dispose();
});
it("rejects foreign and malformed captures and invalidates callbacks on disposal", async () => {
  const accepted = vi.fn(); let release!: (v: unknown) => void;
  const q = createCaptureQueue({ inspect: () => new Promise(r => { release = r; }), accept: accepted, rateMs: 0 });
  q.enqueue(target()); q.dispose(); release(reply(target(), "wrong")); await q.drain();
  expect(accepted).not.toHaveBeenCalled();
});
it("times out unavailable captures without accepting a late replacement payload",async()=>{
  vi.useFakeTimers();
  try { const accepted=vi.fn(); const q=createCaptureQueue({inspect:()=>new Promise(()=>{}),accept:accepted,timeoutMs:20,rateMs:0});q.enqueue(target());await vi.advanceTimersByTimeAsync(21);await q.drain();expect(accepted.mock.calls[0]![1].status).toBe("timeout");q.dispose(); }
  finally { vi.useRealTimers(); }
});
