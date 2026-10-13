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
      smoothBytesPerSecond: 1.2,
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

  it("counts exact complete buckets, five-second rates and idle zeros without notifications", async () => {
    const s = setup(
      [thread("thr_a", { status: "active" })],
      [delta(1, epoch + 100, "12345678"), delta(2, epoch + 1100)],
    );
    await step();
    expect(s.collector.snapshot()).toMatchObject({
      rawBytesPerSecond: 8,
      smoothBytesPerSecond: 1.6,
      streamingThreads: 1,
    });
    await step();
    expect(s.collector.snapshot()).toMatchObject({
      rawBytesPerSecond: 4,
      smoothBytesPerSecond: 2.4,
    });
    await step(5000);
    expect(s.collector.snapshot()).toMatchObject({
      rawBytesPerSecond: 0,
      smoothBytesPerSecond: 0,
      streamingThreads: 0,
    });
    await step(60_000);
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
      smoothBytesPerSecond: 1.6,
    });
    expect(s.collector.snapshot().samples.reduce((sum, p) => sum + p.rawBytesPerSecond, 0)).toBe(8);
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

  it("reconciles missed output hints and deleted threads", async () => {
    const s = setup([thread("thr_a", { status: "active" })]);
    await step(2000);
    s.source.events.push(delta(1, epoch + 3100));
    await step(30_000);
    expect(s.collector.snapshot().totalBytes).toBe(4);
    s.source.rows = [];
    await step(31_000);
    expect(s.collector.snapshot().threadsDiscovered).toBe(0);
    expect(s.collector.snapshot().contributors).toEqual([]);
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

  it("keeps the preceding four buckets when smoothing the first point of the sixty-second graph", async () => {
    const s = setup([thread("thr_a", { status: "active" })], [delta(1, epoch + 100, "12345678")]);
    await step(64_000);
    expect(s.collector.snapshot().samples[0]).toEqual({
      second: 104,
      rawBytesPerSecond: 0,
      smoothBytesPerSecond: 1.6,
    });
    await step();
    expect(s.collector.snapshot().samples[0]).toEqual({
      second: 105,
      rawBytesPerSecond: 0,
      smoothBytesPerSecond: 0,
    });
  });
});
