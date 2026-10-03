import { describe, expect, it, vi } from "vitest";
import { createMergeOperations } from "./merge-operations";
import type { ActionResult } from "../contract";

const request = { action: "merge" as const, expectedHeadOid: "head-a" };
function deferred() {
  let resolve!: (result: ActionResult) => void;
  const promise = new Promise<ActionResult>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("shared merge operations", () => {
  it("shares progress and guards concurrent callers before the RPC resolves", async () => {
    const operations = createMergeOperations();
    const pending = deferred();
    const send = vi.fn(() => pending.promise);
    const first = vi.fn();
    const second = vi.fn();
    const offA = operations.subscribe("a", first);
    const offB = operations.subscribe("a", second);
    const run = operations.run("a", request, send);
    await operations.run("a", request, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(operations.snapshot("a")).toEqual({ kind: "running", ...request });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    pending.resolve({ kind: "ok" });
    await run;
    expect(operations.snapshot("a")).toEqual({ kind: "idle" });
    offA(); offB();
  });

  it("keeps active work after unsubscribe and isolates threads", async () => {
    const operations = createMergeOperations();
    const pending = deferred();
    const send = vi.fn(() => pending.promise);
    const off = operations.subscribe("a", () => {});
    const run = operations.run("a", request, send);
    off();
    const offAgain = operations.subscribe("a", () => {});
    await operations.run("a", request, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(operations.snapshot("b")).toEqual({ kind: "idle" });
    const sendB = vi.fn(async () => ({ kind: "ok" as const }));
    await operations.run("b", request, sendB);
    expect(sendB).toHaveBeenCalledTimes(1);
    pending.resolve({ kind: "error", message: "rejected" });
    await run;
    expect(operations.snapshot("a")).toEqual({ kind: "error", message: "rejected", headOid: "head-a" });
    offAgain();
    expect(operations.snapshot("a")).toEqual({ kind: "idle" });
  });

  it("releases the guard after an RPC rejects and supports dismissing errors", async () => {
    const operations = createMergeOperations();
    const off = operations.subscribe("a", () => {});
    await operations.run("a", request, async () => { throw new Error("offline"); });
    expect(operations.snapshot("a")).toEqual({ kind: "error", message: "offline", headOid: "head-a" });
    operations.dismiss("a");
    expect(operations.snapshot("a")).toEqual({ kind: "idle" });
    const send = vi.fn(async () => ({ kind: "ok" as const }));
    await operations.run("a", request, send);
    expect(send).toHaveBeenCalledTimes(1);
    off();
  });
});
