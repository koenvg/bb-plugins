import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSdk, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import type { PluginBbSdk } from "@get-bb/plugin-sdk";
type ThreadResponse = ReturnType<typeof makeThreadResponse>;
type ThreadListResult = Awaited<ReturnType<PluginBbSdk["threads"]["list"]>>;
type ThreadEventRow = Awaited<ReturnType<PluginBbSdk["threads"]["events"]["list"]>>[number];
type ThreadEventsListArgs = Parameters<PluginBbSdk["threads"]["events"]["list"]>[0];
import { OutputCollector } from "./collector";

const epoch = 100_000;
const thread = (id = "thr_a", overrides: Partial<ThreadResponse> = {}) =>
  makeThreadResponse({ id, createdAt: epoch - 10_000, updatedAt: epoch - 10_000, ...overrides });
const listRow = (row: ThreadResponse): ThreadListResult[number] => ({
  ...row,
  activity: {
    activeBackgroundAgentCount: 0,
    activeBackgroundCommandCount: 0,
    activeGoalCount: 0,
    activePlanModeCount: 0,
    activeWorkflowCount: 0,
  },
  environmentBranchName: null,
  environmentHostId: null,
  environmentIsWorktree: null,
  environmentName: null,
  environmentPath: null,
  environmentProviderId: null,
  environmentWorkspaceDisplayKind: "other",
  hasPendingInteraction: false,
  pinSortKey: null,
  queuedWork: "none",
});
const delta = (
  seq: number,
  createdAt: number,
  text = "abcd",
  id = "thr_a",
  type:
    | "item/agentMessage/delta"
    | "item/reasoning/textDelta"
    | "item/reasoning/summaryTextDelta"
    | "item/commandExecution/outputDelta" = "item/agentMessage/delta",
): ThreadEventRow => ({
  id: `event_${id}_${seq}`,
  threadId: id,
  seq,
  createdAt,
  scope: { kind: "turn", turnId: "turn_a" },
  type,
  data: { delta: text, itemId: "item_a", providerThreadId: "provider_a" },
});
const collectors: OutputCollector[] = [];
afterEach(() => {
  for (const collector of collectors.splice(0)) collector.dispose();
  vi.useRealTimers();
});

function setup(rows = [thread()], events: ThreadEventRow[] = []) {
  vi.useFakeTimers();
  vi.setSystemTime(epoch);
  const source = { rows, events };
  const fake = createFakeSdk({
    pluginId: "live-output",
    overrides: {
      threads: {
        get: async ({ threadId }) =>
          source.rows.find((row) => row.id === threadId) ??
          thread(threadId, { deletedAt: Date.now() }),
        list: async (args) =>
          source.rows
            .filter((row) => Boolean(row.archivedAt) === args?.archived)
            .slice(args?.offset ?? 0, (args?.offset ?? 0) + (args?.limit ?? 500))
            .map(listRow),
        events: {
          list: async (args) =>
            source.events
              .filter(
                (event) =>
                  event.threadId === args.threadId &&
                  (!args.afterSeq || event.seq > Number(args.afterSeq)) &&
                  (!args.beforeSeq || event.seq < Number(args.beforeSeq)) &&
                  args.types?.includes(event.type),
              )
              .sort((a, b) => (args.order === "desc" ? b.seq - a.seq : a.seq - b.seq))
              .slice(0, Number(args.limit)),
        },
      },
    },
  });
  const collector = new OutputCollector(() => fake.sdk.threads);
  collectors.push(collector);
  const controller = new AbortController();
  const done = collector.run(controller.signal);
  return { collector, controller, done, source, fake };
}
async function step(ms = 1000) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("observed output collector", () => {
  it("keeps ten streams current beside 850 previously observed idle threads without discovery requeues", async () => {
    const rows = Array.from({ length: 850 }, (_, i) => thread(`idle_${i}`));
    rows.push(...Array.from({ length: 10 }, (_, i) => thread(`live_${i}`)));
    const s = setup(rows);
    await step(3000);
    for (const row of rows) s.collector.observe(row, 1);
    await step(90_000);
    const before = s.fake.harness.callsTo("threads.events.list").length;
    for (let seq = 1; seq <= 60; seq++) {
      for (const row of rows.slice(850)) {
        s.source.events.push(delta(seq, Date.now() + 100, "é🙂", row.id));
        s.collector.observe(row, seq);
      }
      await step();
      expect(s.collector.snapshot().totalBytes).toBe(seq * 60);
      expect(s.collector.snapshot().contributors).toHaveLength(10);
      expect(
        s.collector.snapshot().contributors.every((row) => row.lastAt === Date.now() - 900),
      ).toBe(true);
    }
    const reads = s.fake.harness.callsTo("threads.events.list").slice(before);
    expect(
      reads.filter((call) =>
        String((call[0] as ThreadEventsListArgs).threadId).startsWith("idle_"),
      ),
    ).toHaveLength(0);
    expect(reads).toHaveLength(600);
    expect(s.collector.snapshot().failures).toBe(0);
  });
  it("keeps ten streams current while rolling verification recovers an unhinted idle delta", async () => {
    const idle = Array.from({ length: 850 }, (_, i) => thread(`idle_${i}`));
    const live = Array.from({ length: 10 }, (_, i) => thread(`live_${i}`));
    const s = setup([...idle, ...live]);
    await step(3000);
    for (const row of [...idle, ...live]) s.collector.observe(row, 1);
    await step(590_000);
    expect(s.collector.snapshot()).toMatchObject({ totalBytes: 0, backlog: 0, coverage: "live" });
    s.source.events.push(delta(1, Date.now() + 100, "abcd", "idle_849"));

    let previousReads = s.fake.harness.callsTo("threads.events.list").length;
    const verified = new Set<string>();
    for (let seq = 1; seq <= 600; seq++) {
      for (const row of live) {
        s.source.events.push(delta(seq, Date.now() + 100, "é🙂", row.id));
        s.collector.observe(row, seq);
      }
      await step();
      const calls = s.fake.harness.callsTo("threads.events.list");
      const reads = calls.slice(previousReads);
      previousReads = calls.length;
      expect(reads.length).toBeLessThanOrEqual(20);
      for (const call of reads) {
        const id = (call[0] as ThreadEventsListArgs).threadId;
        if (id.startsWith("idle_")) verified.add(id);
      }
      const snapshot = s.collector.snapshot();
      const recoveredBytes = verified.has("idle_849") ? 4 : 0;
      expect(snapshot).toMatchObject({
        totalBytes: seq * 60 + recoveredBytes,
        deltas: seq * 10 + recoveredBytes / 4,
        streamingThreads: 10,
        backlog: 0,
        coverage: "live",
        failures: 0,
      });
      expect(snapshot.contributors.filter((row) => row.id.startsWith("live_"))).toHaveLength(10);
      expect(
        snapshot.contributors
          .filter((row) => row.id.startsWith("live_"))
          .every((row) => row.lastAt === Date.now() - 900),
      ).toBe(true);
    }
    expect(verified.has("idle_849")).toBe(true);
    expect(s.collector.snapshot()).toMatchObject({ totalBytes: 36_004, deltas: 6001 });
    expect(s.fake.harness.callsTo("threads.get")).toHaveLength(0);
  });
  it("revisits members deferred by a recent drained read within the next fixed scan", async () => {
    const rows = Array.from({ length: 850 }, (_, i) => thread(`idle_${i}`));
    const s = setup(rows);
    await step(3000);
    for (const row of rows) s.collector.observe(row, 1);
    await step(90_000);
    s.source.events.push(delta(1, Date.now() + 100, "abcd", "idle_0"));
    await step(1_110_000);
    expect(s.collector.snapshot().totalBytes).toBe(4);
  });
  it("keeps lifecycle activation received while a short event page is in flight", async () => {
    const s = setup();
    await step(2000);
    s.collector.observe(thread(), 1);
    await step();
    let release!: (rows: ThreadEventRow[]) => void;
    let reads = 0;
    s.fake.harness.stub("threads.events.list", async () => {
      if (++reads === 1)
        return new Promise<ThreadEventRow[]>((resolve) => {
          release = resolve;
        });
      return [delta(1, Date.now() - 100)];
    });
    s.collector.observe({ ...thread(), updatedAt: Date.now() });
    await step();
    s.collector.observe({ ...thread(), updatedAt: Date.now() });
    release([]);
    await step(0);
    expect(s.collector.snapshot()).toMatchObject({ totalBytes: 4, deltas: 1 });
  });

  it("does not reactivate unchanged post-start metadata on every discovery sweep", async () => {
    const s = setup([thread("thr_a", { updatedAt: epoch + 100 })]);
    await step(3000);
    expect(s.fake.harness.callsTo("threads.events.list")).toHaveLength(2);
    await step(90_000);
    expect(s.fake.harness.callsTo("threads.events.list")).toHaveLength(2);
  });

  it("reserves one of five eligible starts for background and rotates full live pages", async () => {
    const rows = [thread("background", { status: "active" }), thread("live_a"), thread("live_b")];
    const s = setup(rows);
    await step(2000);
    const before = s.fake.harness.callsTo("threads.events.list").length;
    s.source.events.push(
      ...Array.from({ length: 3000 }, (_, i) => delta(i + 1, epoch + 2100, "abcd", "background")),
      ...Array.from({ length: 3000 }, (_, i) => delta(i + 1, epoch + 2100, "abcd", "live_a")),
      ...Array.from({ length: 3000 }, (_, i) => delta(i + 1, epoch + 2100, "abcd", "live_b")),
    );
    s.collector.observe(rows[0]!, undefined);
    s.collector.observe({ ...rows[0]!, updatedAt: epoch + 2100 });
    s.collector.observe(rows[1]!, 3000);
    s.collector.observe(rows[2]!, 3000);
    await step();
    const reads = s.fake.harness.callsTo("threads.events.list").slice(before);
    expect(reads).toHaveLength(20);
    for (let i = 0; i < 20; i += 5)
      expect(
        reads
          .slice(i, i + 5)
          .some((call) => (call[0] as ThreadEventsListArgs).threadId === "background"),
      ).toBe(true);
    expect(
      reads.filter((call) => (call[0] as ThreadEventsListArgs).threadId === "live_a"),
    ).toHaveLength(8);
    expect(
      reads.filter((call) => (call[0] as ThreadEventsListArgs).threadId === "live_b"),
    ).toHaveLength(8);
    expect(s.collector.snapshot().totalBytes).toBe(8000);
  });
  it("discovers cold threads without reading their history, then excludes the global baseline and duplicate hints", async () => {
    const s = setup([thread()], [delta(1, epoch - 1, "history"), delta(2, epoch + 100, "é🙂")]);
    await step();
    expect(s.fake.harness.callsTo("threads.events.list")).toHaveLength(0);
    s.collector.observe(thread(), 2);
    s.collector.observe(thread(), 2);
    await step();
    expect(s.collector.snapshot()).toMatchObject({
      totalBytes: 6,
      deltas: 1,
      rawBytesPerSecond: 0,
      smoothBytesPerSecond: 0.2,
      threadsDiscovered: 1,
    });
    s.collector.observe(thread(), 2);
    await step();
    expect(s.collector.snapshot().totalBytes).toBe(6);
    expect(s.fake.harness.callsTo("threads.events.list").map((call) => call[0])).toEqual([
      expect.objectContaining({
        order: "desc",
        limit: "100",
        types: ["item/agentMessage/delta", "item/reasoning/textDelta"],
      }),
      expect.objectContaining({ order: "asc", afterSeq: "2" }),
    ]);
  });

  it("counts complete buckets with thirty-second rates and an independent five-second streaming count", async () => {
    const s = setup(
      [thread("thr_a", { status: "active" })],
      [delta(1, epoch + 100, "12345678"), delta(2, epoch + 1100)],
    );
    await step();
    expect(s.collector.snapshot()).toMatchObject({
      rawBytesPerSecond: 8,
      smoothBytesPerSecond: 8 / 30,
      streamingThreads: 1,
    });
    await step();
    expect(s.collector.snapshot()).toMatchObject({
      rawBytesPerSecond: 4,
      smoothBytesPerSecond: 0.4,
    });
    await step(5000);
    expect(s.collector.snapshot()).toMatchObject({
      rawBytesPerSecond: 0,
      smoothBytesPerSecond: 0.4,
      streamingThreads: 0,
    });
    await step(630_000);
    expect(
      s.collector
        .snapshot()
        .samples.every(
          (point) => point.rawBytesPerSecond === 0 && point.smoothBytesPerSecond === 0,
        ),
    ).toBe(true);
  });

  it("pages descending catch-up and ascending exclusive reads beyond one page", async () => {
    const events = Array.from({ length: 205 }, (_, i) => delta(i + 1, epoch + 100));
    const s = setup([thread("thr_a", { status: "active" })], events);
    await step();
    expect(s.collector.snapshot().totalBytes).toBe(820);
    expect(s.fake.harness.callsTo("threads.events.list").map((call) => call[0])).toEqual([
      expect.objectContaining({ order: "desc" }),
      expect.objectContaining({ beforeSeq: "106" }),
      expect.objectContaining({ beforeSeq: "6" }),
      expect.objectContaining({ afterSeq: "205" }),
    ]);
    s.source.events.push(...Array.from({ length: 201 }, (_, i) => delta(i + 206, epoch + 1200)));
    s.collector.observe(thread(), 406);
    await step();
    expect(s.collector.snapshot().totalBytes).toBe(1624);
    expect(
      s.fake.harness
        .callsTo("threads.events.list")
        .slice(-3)
        .map((call) => call[0]),
    ).toEqual([
      expect.objectContaining({ afterSeq: "205" }),
      expect.objectContaining({ afterSeq: "305" }),
      expect.objectContaining({ afterSeq: "405" }),
    ]);
  });

  it("keeps committed pages atomic on retry after a later page fails", async () => {
    const s = setup(
      [thread("thr_a", { status: "active" })],
      Array.from({ length: 205 }, (_, i) => delta(i + 1, epoch + 100)),
    );
    const real = async (args: ThreadEventsListArgs) =>
      s.source.events
        .filter(
          (event) =>
            (!args.beforeSeq || event.seq < Number(args.beforeSeq)) &&
            (!args.afterSeq || event.seq > Number(args.afterSeq)),
        )
        .sort((a, b) => (args.order === "desc" ? b.seq - a.seq : a.seq - b.seq))
        .slice(0, Number(args.limit));
    let failed = false;
    s.fake.harness.stub("threads.events.list", async (args: ThreadEventsListArgs) => {
      if (args.beforeSeq === "106" && !failed) {
        failed = true;
        throw new Error("offline");
      }
      return real(args);
    });
    await step();
    expect(s.collector.snapshot()).toMatchObject({
      totalBytes: 400,
      coverage: "degraded",
      backlog: 1,
      failures: 1,
    });
    await step(3000);
    expect(s.collector.snapshot()).toMatchObject({
      totalBytes: 820,
      deltas: 205,
      coverage: "live",
      backlog: 0,
    });
  });

  it("uses stored timestamps for late and expired deltas but never counts pre-start deltas", async () => {
    const s = setup();
    await step(70_000);
    s.source.events.push(
      delta(1, epoch - 1),
      delta(2, epoch + 100),
      delta(3, epoch + 69_100, "12345678"),
    );
    s.collector.observe(thread(), 3);
    await step();
    expect(s.collector.snapshot()).toMatchObject({
      totalBytes: 12,
      deltas: 2,
      rawBytesPerSecond: 0,
      smoothBytesPerSecond: 8 / 30,
    });
    expect(s.collector.snapshot().samples.reduce((sum, p) => sum + p.rawBytesPerSecond, 0)).toBe(
      12,
    );
  });

  it("selects only message and reasoning deltas, not tools, summaries or completed-message replay", async () => {
    const replay: ThreadEventRow = {
      id: "completed",
      threadId: "thr_a",
      seq: 5,
      createdAt: epoch + 100,
      scope: { kind: "turn", turnId: "turn_a" },
      type: "item/completed",
      data: {
        providerThreadId: "provider_a",
        item: { id: "item_a", type: "agentMessage", text: "replay" },
      },
    };
    const s = setup(
      [thread("thr_a", { status: "active" })],
      [
        delta(1, epoch + 100),
        delta(2, epoch + 100, "é", "thr_a", "item/reasoning/textDelta"),
        delta(3, epoch + 100, "tool", "thr_a", "item/commandExecution/outputDelta"),
        delta(4, epoch + 100, "summary", "thr_a", "item/reasoning/summaryTextDelta"),
        replay,
      ],
    );
    await step();
    expect(s.collector.snapshot()).toMatchObject({ totalBytes: 6, deltas: 2 });
    expect(JSON.stringify(s.collector.snapshot())).not.toContain("replay");
  });

  it("discovers paginated hidden and archived threads across projects and includes new lifecycle metadata", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => thread(`thr_${i}`));
    rows.push(
      thread("thr_hidden", {
        visibility: "hidden",
        archivedAt: epoch - 5,
        projectId: "proj_other",
      }),
    );
    const s = setup(rows);
    await step(2000);
    expect(s.collector.snapshot().threadsDiscovered).toBe(502);
    expect(s.fake.harness.callsTo("threads.list").map((call) => call[0])).toEqual([
      expect.objectContaining({ archived: false, includeHidden: true, offset: 0 }),
      expect.objectContaining({ archived: false, offset: 500 }),
      expect.objectContaining({ archived: true, offset: 0 }),
    ]);
    const child = thread("thr_new", {
      createdAt: epoch + 2100,
      updatedAt: epoch + 2100,
      parentThreadId: "thr_hidden",
      title: "Child work",
      providerId: "pi-subagents",
      visibility: "hidden",
    });
    s.source.rows.push(child);
    s.source.events.push(delta(1, epoch + 2200, "abcd", "thr_new"));
    s.collector.observe(child);
    await step();
    expect(s.collector.snapshot().contributors[0]).toMatchObject({
      id: "thr_new",
      title: "Child work",
      parentThreadId: "thr_hidden",
      providerId: "pi-subagents",
      hidden: true,
    });
    s.collector.observe({ ...child, archivedAt: epoch + 3000 });
    await step();
    expect(s.collector.snapshot().contributors[0].archived).toBe(true);
    s.collector.remove("thr_new");
    expect(s.collector.snapshot().threadsDiscovered).toBe(502);
    expect(s.collector.snapshot().contributors).toEqual([]);
  });

  it("keeps a contributor's cursor when list reordering omits it from a discovery sweep", async () => {
    const rows = Array.from({ length: 501 }, (_, i) =>
      thread(`thr_${i}`, i === 500 ? { status: "active" } : {}),
    );
    const target = rows[500]!;
    const s = setup(rows, [delta(1, epoch + 100, "abcd", target.id)]);
    await step(3000);
    expect(s.collector.snapshot()).toMatchObject({
      totalBytes: 4,
      deltas: 1,
      threadsDiscovered: 501,
    });
    await step(29_000);
    s.source.rows = [target, ...rows.slice(0, 500)];
    await step(2000);
    s.collector.observe(target, 1);
    await step();
    expect(s.collector.snapshot()).toMatchObject({
      totalBytes: 4,
      deltas: 1,
      threadsDiscovered: 501,
      coverage: "live",
    });
    await step(31_000);
    expect(s.collector.snapshot()).toMatchObject({
      totalBytes: 4,
      deltas: 1,
      threadsDiscovered: 501,
    });
    expect(s.fake.harness.callsTo("threads.get")).toContainEqual([
      expect.objectContaining({ threadId: target.id }),
    ]);
  });

  it("keeps counts and reports degraded coverage until a missing identity read succeeds", async () => {
    const target = thread("thr_a", { status: "active" });
    const s = setup([target], [delta(1, epoch + 100)]);
    await step(2000);
    s.source.rows = [];
    let failed = false;
    s.fake.harness.stub("threads.get", async () => {
      if (!failed) {
        failed = true;
        throw new Error("offline");
      }
      return target;
    });
    await step(30_000);
    expect(s.collector.snapshot()).toMatchObject({
      totalBytes: 4,
      deltas: 1,
      threadsDiscovered: 1,
      failures: 1,
      coverage: "degraded",
    });
    await step(3000);
    s.collector.observe(target, 1);
    await step();
    expect(s.collector.snapshot()).toMatchObject({
      totalBytes: 4,
      deltas: 1,
      threadsDiscovered: 1,
      coverage: "live",
    });
    expect(s.fake.harness.callsTo("threads.get")).toHaveLength(2);
  });

  it("reports degraded coverage while verification catch-up spans work invocations", async () => {
    const s = setup();
    await step(2000);
    s.source.events.push(...Array.from({ length: 3000 }, (_, i) => delta(i + 1, epoch + 100)));
    await step(598_000);
    expect(s.collector.snapshot()).toMatchObject({
      coverage: "degraded",
      backlog: 1,
      deltas: 2000,
    });
    await step();
    expect(s.collector.snapshot()).toMatchObject({
      coverage: "live",
      backlog: 0,
      deltas: 3000,
      totalBytes: 12_000,
    });
  });

  it("recovers missed output hints by rolling verification and confirms deleted threads", async () => {
    const s = setup([thread("thr_a", { status: "active" })]);
    await step(2000);
    s.source.events.push(delta(1, epoch + 3100));
    await step(30_000);
    expect(s.collector.snapshot().totalBytes).toBe(0);
    await step(571_000);
    expect(s.collector.snapshot().totalBytes).toBe(4);
    s.source.rows = [];
    await step(31_000);
    expect(s.collector.snapshot().threadsDiscovered).toBe(0);
    expect(s.collector.snapshot().contributors).toEqual([]);
  });

  it("verifies fixed cold members without a failed or deleted member freezing later passes", async () => {
    const s = setup([thread("failed"), thread("deleted"), thread("healthy")]);
    await step(3000);
    expect(s.fake.harness.callsTo("threads.events.list")).toHaveLength(0);
    s.fake.harness.stub("threads.events.list", async (args: ThreadEventsListArgs) => {
      if (args.threadId === "failed") throw new Error("offline");
      return s.source.events.filter(
        (event) =>
          event.threadId === args.threadId && (!args.afterSeq || event.seq > Number(args.afterSeq)),
      );
    });
    s.source.events.push(delta(1, epoch + 100, "abcd", "healthy"));
    await step(597_000);
    expect(s.collector.snapshot().failures).toBe(1);
    s.collector.remove("deleted");
    s.source.rows = s.source.rows.filter((row) => row.id !== "deleted");
    await step(2000);
    expect(s.collector.snapshot()).toMatchObject({
      totalBytes: 4,
      deltas: 1,
      threadsDiscovered: 2,
    });
    s.source.events.push(delta(2, epoch + 602_100, "12345678", "healthy"));
    await step(1_201_000);
    expect(s.collector.snapshot()).toMatchObject({ totalBytes: 12, deltas: 2 });
    expect(
      s.fake.harness
        .callsTo("threads.events.list")
        .filter((call) => (call[0] as ThreadEventsListArgs).threadId === "healthy"),
    ).toHaveLength(3);
  });

  it("bounds a slow work invocation to twenty starts even when calls advance time and hints never stop", async () => {
    const s = setup();
    await step(2000);
    let reads = 0;
    const starts: number[] = [];
    s.fake.harness.stub("threads.events.list", async (args: ThreadEventsListArgs) => {
      reads++;
      starts.push(Date.now());
      vi.setSystemTime(Date.now() + 1100);
      s.collector.observe(thread(), reads + 1);
      return [delta(Number(args.afterSeq ?? 0) + 1, Date.now() - 100)];
    });
    const discoveryBefore = s.fake.harness.callsTo("threads.list").length;
    s.collector.observe(thread(), 1);
    await step();
    expect(reads).toBe(20);
    expect(s.collector.snapshot().totalBytes).toBe(80);
    expect(s.collector.snapshot().backlog).toBe(1);
    expect(s.fake.harness.callsTo("threads.list").length - discoveryBefore).toBeLessThanOrEqual(1);
    expect(starts.every((at, i) => i === 0 || at - starts[i - 1]! >= 1000)).toBe(true);
  });

  it("shares a rolling-second start limit across adjacent invocations after a delayed page", async () => {
    const s = setup([thread("thr_a", { status: "active" })]);
    await step(2000);
    s.source.events.push(...Array.from({ length: 5000 }, (_, i) => delta(i + 1, epoch + 2100)));
    let release!: (rows: ThreadEventRow[]) => void;
    const starts: number[] = [];
    s.fake.harness.stub("threads.events.list", (args: ThreadEventsListArgs) => {
      starts.push(Date.now());
      const rows = s.source.events.filter((row) => row.seq > Number(args.afterSeq)).slice(0, 100);
      if (starts.length === 1)
        return new Promise<ThreadEventRow[]>((resolve) => {
          release = resolve;
        });
      return Promise.resolve(rows);
    });
    s.collector.observe(thread(), 5000);
    await step();
    await step(900);
    release(s.source.events.slice(0, 100));
    await step(0);
    expect(starts).toHaveLength(20);
    await step(100);
    expect(starts).toHaveLength(21);
    for (const at of starts)
      expect(starts.filter((start) => start > at - 1000 && start <= at).length).toBeLessThanOrEqual(
        20,
      );
  });

  it("guards in-flight reads and releases its service timer on disposal", async () => {
    const s = setup([thread("thr_a", { status: "active" })]);
    let release!: (value: ThreadEventRow[]) => void;
    s.fake.harness.stub(
      "threads.events.list",
      () =>
        new Promise<ThreadEventRow[]>((resolve) => {
          release = resolve;
        }),
    );
    await step();
    const calls = s.fake.harness.calls.length;
    s.controller.abort();
    await s.done;
    release([delta(1, epoch + 100)]);
    await step(60_000);
    expect(s.fake.harness.calls).toHaveLength(calls);
    expect(vi.getTimerCount()).toBe(0);
    expect(() => s.collector.snapshot()).toThrow("disposed");
  });

  it("validates a complete page before applying counts or advancing its exclusive cursor", async () => {
    const s = setup([thread("thr_a", { status: "active" })]);
    await step(2000);
    let broken = true;
    s.fake.harness.stub("threads.events.list", async () =>
      broken
        ? [delta(1, epoch + 2100), { ...delta(2, epoch + 2100), threadId: "thr_wrong" }]
        : [delta(1, epoch + 2100), delta(2, epoch + 2100)],
    );
    s.collector.observe(thread(), 2);
    await step();
    expect(s.collector.snapshot()).toMatchObject({
      totalBytes: 0,
      deltas: 0,
      coverage: "degraded",
    });
    broken = false;
    await step(3000);
    expect(s.collector.snapshot()).toMatchObject({ totalBytes: 8, deltas: 2, coverage: "live" });
    expect(
      s.fake.harness
        .callsTo("threads.events.list")
        .slice(-2)
        .map((call) => call[0]),
    ).toEqual([
      expect.objectContaining({ afterSeq: "0" }),
      expect.objectContaining({ afterSeq: "0" }),
    ]);
  });

  it("fairly rotates full pages and reports a bounded catch-up backlog", async () => {
    const s = setup(
      [thread("thr_a"), thread("thr_b")],
      [
        ...Array.from({ length: 2200 }, (_, i) => delta(i + 1, epoch + 2100)),
        delta(1, epoch + 2100, "abcd", "thr_b"),
      ],
    );
    await step(2000);
    s.collector.observe(thread("thr_a"), 2200);
    s.collector.observe(thread("thr_b"), 1);
    await step();
    expect(s.fake.harness.callsTo("threads.events.list")).toHaveLength(20);
    expect(
      s.fake.harness
        .callsTo("threads.events.list")
        .slice(0, 2)
        .map((call) => call[0]),
    ).toEqual([
      expect.objectContaining({ threadId: "thr_a" }),
      expect.objectContaining({ threadId: "thr_b" }),
    ]);
    expect(s.collector.snapshot()).toMatchObject({
      totalBytes: 7204,
      backlog: 1,
      coverage: "degraded",
    });
    await step();
    expect(s.collector.snapshot()).toMatchObject({
      totalBytes: 8804,
      deltas: 2201,
      backlog: 0,
      coverage: "live",
    });
  });

  it("does not count historical output in a thread discovered late", async () => {
    const s = setup([]);
    await step(2000);
    const hidden = thread("thr_late", {
      visibility: "hidden",
      updatedAt: epoch + 2500,
      status: "active",
    });
    s.source.rows.push(hidden);
    s.source.events.push(
      delta(1, epoch - 2000, "history", "thr_late"),
      delta(2, epoch + 2600, "abcd", "thr_late"),
    );
    await step(31_000);
    expect(s.collector.snapshot()).toMatchObject({
      threadsDiscovered: 1,
      totalBytes: 4,
      deltas: 1,
    });
  });

  it("keeps prior discovery on failure and repairs coverage after a successful retry", async () => {
    const s = setup();
    await step(2000);
    let failed = false;
    s.fake.harness.stub("threads.list", async () => {
      if (!failed) {
        failed = true;
        throw new Error("offline");
      }
      return [listRow(thread())];
    });
    await step(30_000);
    expect(s.collector.snapshot()).toMatchObject({
      threadsDiscovered: 1,
      coverage: "degraded",
      failures: 1,
    });
    await step(4000);
    expect(s.collector.snapshot()).toMatchObject({ threadsDiscovered: 1, coverage: "live" });
  });

  it("does not resurrect a deleted thread when a pending event page completes", async () => {
    const s = setup();
    await step(2000);
    let release!: (value: ThreadEventRow[]) => void;
    s.fake.harness.stub(
      "threads.events.list",
      () =>
        new Promise<ThreadEventRow[]>((resolve) => {
          release = resolve;
        }),
    );
    s.collector.observe(thread(), 1);
    await step();
    expect(s.collector.snapshot()).toMatchObject({ coverage: "degraded", backlog: 1 });
    s.collector.remove("thr_a");
    release([delta(1, epoch + 2100)]);
    await step();
    expect(s.collector.snapshot()).toMatchObject({
      threadsDiscovered: 0,
      totalBytes: 0,
      deltas: 0,
      contributors: [],
    });
  });

  it("bounds tracked threads and reclaims only confirmed deletions with bounded thread reads", async () => {
    const rows = Array.from({ length: 10_001 }, (_, i) => thread(`thr_${i}`));
    const s = setup(rows);
    await step(22_000);
    expect(s.collector.snapshot()).toMatchObject({
      threadsDiscovered: 10_000,
      coverage: "degraded",
      capacityLimited: true,
    });
    s.source.rows = [thread("thr_new")];
    await step(34_000);
    expect(s.collector.snapshot().threadsDiscovered).toBe(9900);
    expect(s.fake.harness.callsTo("threads.get")).toHaveLength(100);
    expect(s.collector.snapshot().coverage).toBe("degraded");
    await step(532_000);
    expect(s.collector.snapshot()).toMatchObject({
      threadsDiscovered: 1,
      coverage: "live",
      capacityLimited: false,
    });
  });

  it("retries an ascending page after partial progress without replaying committed deltas", async () => {
    const s = setup([thread("thr_a", { status: "active" })]);
    await step(2000);
    const rows = Array.from({ length: 201 }, (_, i) => delta(i + 1, epoch + 2100));
    let failed = false;
    s.fake.harness.stub("threads.events.list", async (args: ThreadEventsListArgs) => {
      if (args.afterSeq === "100" && !failed) {
        failed = true;
        throw new Error("offline");
      }
      return rows.filter((row) => row.seq > Number(args.afterSeq)).slice(0, Number(args.limit));
    });
    s.collector.observe(thread(), 201);
    await step();
    expect(s.collector.snapshot()).toMatchObject({
      totalBytes: 400,
      deltas: 100,
      coverage: "degraded",
    });
    await step(3000);
    expect(s.collector.snapshot()).toMatchObject({
      totalBytes: 804,
      deltas: 201,
      coverage: "live",
    });
    expect(
      s.fake.harness
        .callsTo("threads.events.list")
        .slice(-3)
        .map((call) => call[0]),
    ).toEqual([
      expect.objectContaining({ afterSeq: "100" }),
      expect.objectContaining({ afterSeq: "100" }),
      expect.objectContaining({ afterSeq: "200" }),
    ]);
  });

  it("returns 600 points with fixed-divisor startup and retains 29 preceding buckets for the oldest point", async () => {
    const s = setup(
      [thread("thr_a", { status: "active" })],
      [delta(1, epoch + 100, "x".repeat(30))],
    );
    await step();
    const first = s.collector.snapshot();
    expect(first.samples).toHaveLength(600);
    expect(first.samples[0]).toEqual({
      second: -499,
      rawBytesPerSecond: 0,
      smoothBytesPerSecond: 0,
    });
    expect(first.samples[599]).toEqual({
      second: 100,
      rawBytesPerSecond: 30,
      smoothBytesPerSecond: 1,
    });
    expect(first.contributors[0]).toMatchObject({ rawBytesPerSecond: 30, smoothBytesPerSecond: 1 });
    await step(628_000);
    expect(s.collector.snapshot().samples[0]).toEqual({
      second: 129,
      rawBytesPerSecond: 0,
      smoothBytesPerSecond: 1,
    });
    await step();
    expect(s.collector.snapshot().samples[0]).toEqual({
      second: 130,
      rawBytesPerSecond: 0,
      smoothBytesPerSecond: 0,
    });
  });

  it("removes deleted graph contributions but preserves lifetime totals and excludes current/future rate buckets", async () => {
    const s = setup(
      [thread("thr_a", { status: "active" }), thread("thr_b", { status: "active" })],
      [
        delta(1, epoch + 100, "x".repeat(30)),
        delta(2, epoch + 1100, "x".repeat(60)),
        delta(3, epoch + 5000, "x".repeat(90)),
        delta(1, epoch + 100, "x".repeat(30), "thr_b"),
      ],
    );
    await step();
    expect(s.collector.snapshot()).toMatchObject({
      totalBytes: 210,
      rawBytesPerSecond: 60,
      smoothBytesPerSecond: 2,
      streamingThreads: 2,
    });
    expect(s.collector.snapshot().contributors.find((row) => row.id === "thr_a")).toMatchObject({
      rawBytesPerSecond: 30,
      smoothBytesPerSecond: 1,
    });
    s.collector.remove("thr_a");
    expect(s.collector.snapshot()).toMatchObject({
      totalBytes: 210,
      deltas: 4,
      rawBytesPerSecond: 30,
      smoothBytesPerSecond: 1,
      streamingThreads: 1,
    });
    await step(5000);
    expect(s.collector.snapshot()).toMatchObject({ streamingThreads: 0, smoothBytesPerSecond: 1 });
    expect(s.collector.snapshot().contributors).toHaveLength(1);
    await step(55_000);
    expect(s.collector.snapshot().contributors).toHaveLength(0);
    expect(s.collector.snapshot().samples.some((point) => point.rawBytesPerSecond === 30)).toBe(
      true,
    );
  });
});
