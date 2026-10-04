import { expect, it } from "vitest";
import { boundedJson, parseStatusReceipt } from "./protocol.js";
const file = "/owned/session.jsonl";
function receipt() {
  return { sessionId: "owned", sessionFile: file, ping: { version: 1, methods: ["ping", "status"], session: { sessionId: "owned", sessionFile: file }, capabilities: { status: true, asyncStatusSnapshot: { kind: "pi-subagents.async-status-snapshot", version: 1 }, statusProjection: { version: 1, untargeted: "in-memory-when-ready", targeted: "executor" } } }, status: { asyncSnapshot: { kind: "pi-subagents.async-status-snapshot", version: 1, generatedAt: 1, caps: { maxRuns: 20, maxDepth: 3, maxChildrenPerNode: 8, maxStringLength: 160, maxSerializedBytes: 32768 }, omitted: { runs: 0, children: 0, byteLimitExceeded: false }, runs: [{ id: "owned-run", kind: "subagent", label: "reviewer", state: "running" }] } } };
}
it("rejects oversized and deep unknown fields before accepting a supported schema", () => {
  expect(parseStatusReceipt(receipt(), file)).toBeDefined();
  expect(parseStatusReceipt({ ...receipt(), extra: "x".repeat(128 * 1024) }, file)).toBeUndefined();
  const r = receipt();
  expect(parseStatusReceipt({ ...r, status: { asyncSnapshot: { ...r.status.asyncSnapshot, extra: "x".repeat(32768) } } }, file)).toBeUndefined();
  let deep: unknown = 0;
  for (let i = 0; i < 30; i++) deep = { child: deep };
  expect(parseStatusReceipt({ ...receipt(), extra: deep }, file)).toBeUndefined();
  const cyclic: { child?: unknown } = {};
  cyclic.child = cyclic;
  expect(boundedJson(cyclic, 100)).toBe(false);
});
it("rejects row/count limits, unknown execution states, and truncated identities", () => {
  for (const change of [
    { runs: Array.from({ length: 21 }, (_, i) => ({ id: `run-${i}`, kind: "subagent", label: "reviewer", state: "running" })) },
    { runs: [{ id: "run…", kind: "subagent", label: "reviewer", state: "complete" }] },
    { runs: [{ id: "run", kind: "subagent", label: "reviewer", state: "future-terminal" }] },
    { runs: [{ id: "run", kind: "subagent", label: "reviewer", state: "complete", children: Array.from({ length: 9 }, (_, i) => ({ id: `child-${i}`, kind: "subagent", label: "child", state: "running" })) }] },
  ]) {
    const r = receipt();
    expect(parseStatusReceipt({ ...r, status: { asyncSnapshot: { ...r.status.asyncSnapshot, ...change } } }, file)).toBeUndefined();
  }
});
it.each(["step", "host-step"])("accepts parent-scoped %s IDs but rejects duplicate siblings and canonical runs", (kind) => {
  const r = receipt();
  const step = (children: unknown[] = []) => ({ id: "step:0", kind, label: "step", state: "complete", children });
  const nested = { id: "nested", kind: "subagent", label: "nested", state: "running", children: [step()] };
  const parse = (children: unknown[]) => parseStatusReceipt({ ...r, status: { asyncSnapshot: { ...r.status.asyncSnapshot, runs: [{ ...r.status.asyncSnapshot.runs[0], children }] } } }, file);
  expect(parse([step([nested])])).toBeDefined();
  expect(parse([step(), step()])).toBeUndefined();
  expect(parse([{ ...nested, children: [] }, { ...nested, children: [] }])).toBeUndefined();
  expect(parse([step([{ ...nested, children: [] }]), { ...step([{ ...nested, children: [] }]), id: "step:1" }])).toBeUndefined();
});
it("requires both session identities, preflight capabilities, and the current generation's bound ID", () => {
  const r = receipt();
  expect(parseStatusReceipt(r, file, "replacement-session")).toBeUndefined();
  expect(parseStatusReceipt({ ...r, ping: { ...r.ping, session: { ...r.ping.session, sessionId: "foreign" } } }, file)).toBeUndefined();
  expect(parseStatusReceipt({ ...r, ping: { ...r.ping, capabilities: { status: true } } }, file)).toBeUndefined();
});
