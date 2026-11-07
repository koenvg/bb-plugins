import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSdk, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { OutputCollector } from "./collector";
import { snapshotSchema } from "./contract";

const epoch = 100_000;
const row = makeThreadResponse({ id: "thr_a", createdAt: 90_000, updatedAt: 90_000 });
const collectors: OutputCollector[] = [];

afterEach(() => {
  for (const collector of collectors.splice(0)) collector.dispose();
  vi.useRealTimers();
});

function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(epoch);
  const fake = createFakeSdk({
    pluginId: "live-output",
    overrides: {
      threads: {
        list: async () => [],
        get: async () => row,
        events: { list: async () => [] },
      },
    },
  });
  const collector = new OutputCollector(() => fake.sdk.threads);
  collectors.push(collector);
  return { fake, collector, start: () => collector.run(new AbortController().signal) };
}

const step = (ms = 1000) => vi.advanceTimersByTimeAsync(ms);

describe("safe read failure diagnostics", () => {
  it.each([
    [new DOMException("private timeout body", "TimeoutError"), "timeout"],
    [new DOMException("private abort body", "AbortError"), "aborted"],
    [
      Object.assign(new Error("Bearer secret"), { code: "private", cause: "transcript" }),
      "read-error",
    ],
    ["private rejection", "read-error"],
    [null, "read-error"],
  ])(
    "classifies a rejected event read without retaining its contents, case %#",
    async (error, category) => {
      const s = setup();
      s.fake.harness.stub("threads.events.list", async () => {
        throw error;
      });
      s.collector.observe(row, 1);
      s.start();
      await step(0);
      const snapshot = s.collector.snapshot();
      expect(snapshot.failures).toBe(1);
      expect(snapshot.recentFailures).toEqual([
        { operation: "threads.events.list", category, at: epoch },
      ]);
      expect(snapshotSchema.parse(snapshot).recentFailures).toEqual(snapshot.recentFailures);
      expect(snapshot.totalBytes).toBe(0);
      expect(snapshot.backlog).toBe(1);
    },
  );

  it("retains discovery context after recovery without changing the three-second retry", async () => {
    const s = setup();
    s.fake.harness.stub("threads.list", async () => {
      throw new Error("private URL token");
    });
    s.start();
    await step(0);
    expect(s.collector.snapshot()).toMatchObject({
      failures: 1,
      coverage: "degraded",
      recentFailures: [{ operation: "threads.list", category: "read-error", at: epoch }],
    });
    s.fake.harness.stub("threads.list", async () => []);
    await step(2000);
    expect(s.fake.harness.callsTo("threads.list")).toHaveLength(1);
    await step(2000);
    expect(s.collector.snapshot()).toMatchObject({
      failures: 1,
      coverage: "live",
      recentFailures: [{ operation: "threads.list", category: "read-error", at: epoch }],
    });
  });

  it("distinguishes a missing thread identity failure from event reads", async () => {
    const s = setup();
    s.fake.harness.stub("threads.get", async () => {
      throw new Error("private identity");
    });
    s.collector.observe(row);
    s.start();
    await step(32_000);
    expect(s.collector.snapshot().recentFailures).toEqual([
      { operation: "threads.get", category: "read-error", at: epoch + 32_000 },
    ]);
    expect(s.collector.snapshot().failures).toBe(1);
  });

  it("classifies rejected response validation without retaining the invalid delta", async () => {
    const s = setup();
    s.fake.harness.stub("threads.events.list", async () => [
      {
        threadId: row.id,
        seq: -1,
        createdAt: epoch,
        type: "item/agentMessage/delta",
        data: { delta: "private transcript and secret" },
      },
    ]);
    s.collector.observe(row, 1);
    s.start();
    await step(0);
    expect(s.collector.snapshot()).toMatchObject({
      totalBytes: 0,
      deltas: 0,
      failures: 1,
      recentFailures: [
        { operation: "threads.events.list", category: "invalid-response", at: epoch },
      ],
    });
  });

  it("classifies oversized discovery and mismatched identity responses", async () => {
    const discovery = setup();
    discovery.fake.harness.stub("threads.list", async () => Array(501).fill(row));
    discovery.start();
    await step(0);
    expect(discovery.collector.snapshot().recentFailures).toEqual([
      { operation: "threads.list", category: "invalid-response", at: epoch },
    ]);
    discovery.collector.dispose();

    const identity = setup();
    identity.fake.harness.stub("threads.get", async () => ({
      ...row,
      id: "private unexpected id",
    }));
    identity.collector.observe(row);
    identity.start();
    await step(32_000);
    expect(identity.collector.snapshot().recentFailures).toEqual([
      { operation: "threads.get", category: "invalid-response", at: epoch + 32_000 },
    ]);
  });

  it("rejects unbounded or freeform diagnostic fields at the RPC schema", () => {
    const s = setup();
    const snapshot = s.collector.snapshot();
    const failure = { operation: "threads.list", category: "read-error", at: epoch };
    expect(snapshot.recentFailures).toEqual([]);
    for (const recentFailures of [
      Array(21).fill(failure),
      [{ ...failure, message: "secret" }],
      [{ ...failure, category: "secret" }],
      [{ ...failure, operation: "secret" }],
      [{ ...failure, at: -1 }],
    ])
      expect(snapshotSchema.safeParse({ ...snapshot, recentFailures }).success).toBe(false);
  });

  it("bounds history to twenty records while keeping lifetime counts and isolated snapshots", async () => {
    const s = setup();
    s.fake.harness.stub("threads.events.list", async () => {
      throw new Error("private body");
    });
    s.collector.observe(row, 1);
    s.start();
    await step(60_000);
    const snapshot = s.collector.snapshot();
    expect(snapshot.failures).toBe(21);
    expect(snapshot.recentFailures).toEqual(
      Array.from({ length: 20 }, (_, i) => ({
        operation: "threads.events.list",
        category: "read-error",
        at: epoch + (i + 1) * 3000,
      })),
    );
    snapshot.recentFailures[0]!.at = 1;
    snapshot.recentFailures.length = 0;
    expect(s.collector.snapshot().recentFailures[0]!.at).toBe(epoch + 3000);
    expect(s.collector.snapshot().recentFailures).toHaveLength(20);
  });

  it("does not record an in-flight rejection after deletion or disposal", async () => {
    for (const action of ["delete", "dispose"] as const) {
      const s = setup();
      let reject!: (error: Error) => void;
      s.fake.harness.stub(
        "threads.events.list",
        () =>
          new Promise((_resolve, fail) => {
            reject = fail;
          }),
      );
      s.collector.observe(row, 1);
      const done = s.start();
      await step(0);
      if (action === "delete") s.collector.remove(row.id);
      else s.collector.dispose();
      reject(new Error("late private failure"));
      await step(0);
      if (action === "delete") {
        expect(s.collector.snapshot().failures).toBe(0);
        expect(s.collector.snapshot().recentFailures).toEqual([]);
        s.collector.dispose();
      } else expect(() => s.collector.snapshot()).toThrow("Collector disposed");
      await done;
    }
  });
});
