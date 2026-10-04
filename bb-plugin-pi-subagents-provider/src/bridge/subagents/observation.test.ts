import { describe, expect, it } from "vitest";
import { experimental_createDeltaAssembler as createAssembler, type ThreadEvent } from "@get-bb/plugin-sdk/provider-bridge/testing";
import { type ThreadDelta, threadDeltaSchema } from "@get-bb/plugin-sdk/provider-bridge";
import { createSubagentObservation } from "./observation.js";

const sessionFile = "/owned/session.jsonl";
const root = (state = "running", children: unknown[] = []) => ({ id: "run-1", kind: "subagent", label: "reviewer", state, startedAt: 1000, updatedAt: 2000, activity: { currentTool: "read" }, children });
function receipt(runs: unknown[], omitted = { runs: 0, children: 0, byteLimitExceeded: false }) {
  return {
    sessionId: "pi-session-1", sessionFile,
    ping: { version: 1, methods: ["ping", "status"], session: { sessionId: "pi-session-1", sessionFile }, capabilities: { status: true, asyncStatusSnapshot: { kind: "pi-subagents.async-status-snapshot", version: 1 }, statusProjection: { version: 1, untargeted: "in-memory-when-ready", targeted: "executor" } } },
    status: { asyncSnapshot: { kind: "pi-subagents.async-status-snapshot", version: 1, generatedAt: 3000, caps: { maxRuns: 20, maxChildrenPerNode: 8, maxDepth: 3, maxStringLength: 160, maxSerializedBytes: 32768 }, omitted, runs } },
  };
}
function harness() {
  let value: unknown = receipt([root()]);
  let now = 3000;
  const deltas: ThreadDelta[] = [];
  const events: ThreadEvent[] = [];
  const assembler = createAssembler({ providerId: "pi-subagents", progressThrottleMs: 0, now: () => now });
  const emit = (batch: readonly ThreadDelta[]) => {
    batch.forEach((delta) => threadDeltaSchema.parse(delta));
    deltas.push(...batch);
    events.push(...assembler.assemble({ threadId: "thread-1", deltas: batch }));
  };
  const observation = createSubagentObservation({ sessionFile, generation: 1, now: () => now, emit, reconcile: async () => value, schedule: () => () => {} });
  const items = () => events.flatMap((event) => "item" in event && event.item.type === "backgroundTask" ? [event.item] : []);
  return { observation, events, items, deltas, emit, assembler, set: (next: unknown) => { value = next; }, time: (next: number) => { now = next; } };
}

describe("native single-run observation", () => {
  it("opens native work without a turn and keeps it through parent idle and silence", async () => {
    const h = harness();
    await h.observation.refresh();
    expect(h.items()).toHaveLength(1);
    const id = h.items()[0]!.id;
    expect(h.items()[0]).toMatchObject({ type: "backgroundTask", taskType: "local_subagent", status: "pending", taskStatus: "running" });
    expect(h.items()[0]!.description).toContain("reviewer");
    expect(h.items()[0]!.summary).toContain("2s");
    expect(h.items()[0]!.summary).toContain("read");
    h.emit([{ kind: "input.accepted", clientRequestId: "creq_ab23456789" }, { kind: "turn.open" }, { kind: "turn.boundary", status: "completed" }]);
    expect(h.assembler.getOpenTurnId("thread-1")).toBeUndefined();
    h.time(1000000);
    h.observation.widget({ method: "setWidget", widgetKey: "subagent-async" });
    expect(h.items().at(-1)!.status).toBe("pending");
    h.set(receipt([root("complete")]));
    await h.observation.refresh();
    await h.observation.refresh();
    expect(h.items().filter((item) => item.status !== "pending")).toHaveLength(1);
    expect(h.items().at(-1)).toMatchObject({ id, status: "completed", taskStatus: "completed" });
    expect(h.events.filter((e) => e.type === "turn/started")).toHaveLength(1);
  });

  it("does not settle missing rows, incomplete snapshots, or failed reads", async () => {
    const h = harness();
    await h.observation.refresh();
    for (const value of [receipt([]), receipt([root("complete")], { runs: 0, children: 1, byteLimitExceeded: false }), { invalid: true }]) {
      h.set(value);
      await h.observation.refresh();
      expect(h.items().at(-1)!.status).toBe("pending");
    }
    expect(h.observation.state().availability).toBe("unavailable");
    h.set(receipt([root("complete")]));
    await h.observation.refresh();
    expect(h.items().at(-1)!.status).toBe("completed");
    expect(h.observation.state().inspection).toBe("not-captured");
  });

  it.each(["complete", "paused", "partial"])("keeps a %s root with live descendants active", async (state) => {
    const h = harness();
    h.set(receipt([root(state, [{ id: "child-1", kind: "subagent", label: "nested", state: "running" }])]));
    await h.observation.refresh();
    expect(h.items().at(-1)!.status).toBe("pending");
    h.set(receipt([root(state, [{ id: "child-1", kind: "subagent", label: "nested", state: "complete" }])]));
    await h.observation.refresh();
    expect(h.items().at(-1)!.status).not.toBe("pending");
  });

  it("keeps missing known descendants and correlates a promoted descendant root", async () => {
    const h = harness();
    const child = { id: "child-1", kind: "subagent", label: "nested", state: "running" };
    h.set(receipt([root("complete", [child])]));
    await h.observation.refresh();
    h.set(receipt([root("complete")]));
    await h.observation.refresh();
    expect(h.items().at(-1)!.status).toBe("pending");
    h.set(receipt([root("complete"), { ...child, state: "complete" }]));
    await h.observation.refresh();
    expect(h.items().at(-1)!.status).toBe("completed");
    expect(new Set(h.items().map((item) => item.id)).size).toBe(1);
  });

  it.each([
    { runs: 0, children: 1, byteLimitExceeded: false },
    { runs: 1, children: 0, byteLimitExceeded: false },
    { runs: 0, children: 0, byteLimitExceeded: true },
  ])("does not use empty snapshot coverage to settle an incomplete terminal run", async (omitted) => {
    const h = harness();
    await h.observation.refresh();
    const id = h.items()[0]!.id;
    h.set(receipt([root("complete")], omitted));
    await h.observation.refresh();
    h.set(receipt([]));
    await h.observation.refresh();
    expect(h.items().filter((item) => item.status !== "pending")).toEqual([]);
    h.set(receipt([root("complete")]));
    await h.observation.refresh();
    await h.observation.refresh();
    expect(h.items().filter((item) => item.status !== "pending")).toHaveLength(1);
    expect(h.items().at(-1)).toMatchObject({ id, status: "completed" });
  });

  it("accepts parent-scoped step IDs in a terminal root with a live nested run", async () => {
    const h = harness();
    const nested = (state: string) => ({ id: "nested-run", kind: "subagent", label: "nested", state, children: [{ id: "step:0", kind: "step", label: "inner step", state }] });
    const tree = (state: string) => root("complete", [{ id: "step:0", kind: "step", label: "outer step", state: "complete", children: [nested(state)] }]);
    h.set(receipt([tree("running")]));
    await h.observation.refresh();
    expect(h.items().at(-1)!.status).toBe("pending");
    h.set(receipt([tree("complete")]));
    await h.observation.refresh();
    expect(h.items().at(-1)!.status).toBe("completed");
    expect(new Set(h.items().map((item) => item.id)).size).toBe(1);
  });

  it("rejects foreign identity, malformed versions, bounds, and duplicate IDs", async () => {
    const h = harness();
    await h.observation.refresh();
    const foreign = receipt([root("complete")]);
    foreign.sessionFile = "/foreign/session.jsonl";
    const version = receipt([root("complete")]);
    version.status.asyncSnapshot.version = 2;
    const deep = root("complete", [root("complete", [root("complete", [root("complete", [root()])])])]);
    for (const value of [foreign, version, receipt([root(), root()]), receipt([deep]), receipt([{ ...root(), id: "x".repeat(161) }]), receipt([root()], { runs: -1, children: 0, byteLimitExceeded: false })]) {
      h.set(value);
      await h.observation.refresh();
      expect(h.items().at(-1)!.status).toBe("pending");
      expect(h.observation.state().availability).toBe("unavailable");
    }
  });

  it("ignores unknown fields, duplicate snapshots, and older snapshots", async () => {
    const h = harness();
    h.set({ ...receipt([{ ...root(), future: "ignored" }]), future: true });
    await h.observation.refresh();
    await h.observation.refresh();
    expect(h.items()).toHaveLength(1);
    const old = receipt([root("complete")]);
    old.status.asyncSnapshot.generatedAt = 2999;
    h.set(old);
    await h.observation.refresh();
    expect(h.items()).toHaveLength(1);
  });

  it.each(["exit", "release", "replacement"])("records %s uncertainty once and discards late replies", async (reason) => {
    const h = harness();
    await h.observation.refresh();
    h.observation.dispose(reason as "exit" | "release" | "replacement");
    h.observation.dispose("exit");
    h.set(receipt([root("complete")]));
    await h.observation.refresh();
    expect(h.items().at(-1)).toMatchObject({ status: "interrupted", taskStatus: "stopped" });
    expect(h.items().at(-1)!.summary).toContain("unknown");
    expect(h.items().filter((item) => item.status !== "pending")).toHaveLength(1);
  });

  it("has one in-flight read and rejects a reply after disposal", async () => {
    let resolve!: (value: unknown) => void;
    const deltas: ThreadDelta[] = [];
    let requests = 0;
    const observation = createSubagentObservation({ sessionFile, generation: 2, now: () => 3000, emit: (batch) => deltas.push(...batch), reconcile: () => { requests++; return new Promise((r) => { resolve = r; }); }, schedule: () => () => {} });
    const first = observation.refresh();
    void observation.refresh();
    expect(requests).toBe(1);
    observation.dispose("replacement");
    resolve(receipt([root()]));
    await first;
    expect(deltas).toEqual([]);
  });
  it("correlates foreground rows by run and stable index without native work", () => {
    const h = harness();
    const row = (index: number) => ({ index, agent: `agent-${index}`, task: "owned task" });
    for (const type of ["tool_execution_update", "tool_execution_end"]) {
      h.observation.tool({ type, toolName: "subagent", partialResult: { details: { mode: "parallel", runId: "fg-run", results: [row(4), row(1)] } }, result: { details: { mode: "parallel", runId: "fg-run", results: [row(1), row(4)] } } });
    }
    h.observation.tool({ type: "tool_execution_update", toolName: "subagent", partialResult: { details: { runId: "fg-run", results: [row(7), row(7)] } } });
    expect(h.observation.state().foreground.map((r) => r.index).sort()).toEqual([1, 4]);
    expect(h.items()).toEqual([]);
  });

  it("coalesces hint floods without delaying the first read", () => {
    const scheduled: (() => void)[] = [];
    const observation = createSubagentObservation({ sessionFile, generation: 3, emit: () => {}, reconcile: async () => receipt([]), schedule: (callback) => { scheduled.push(callback); return () => {}; } });
    for (let i = 0; i < 100; i++) observation.hint();
    expect(scheduled).toHaveLength(1);
    observation.dispose("release");
  });

});
