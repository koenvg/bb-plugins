import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";
import { SNOOZE_WAKE_SCHEDULE } from "./snoozes";

const NOW = new Date("2026-10-07T15:00:00").getTime();
const HOUR = 3_600_000;

function setup(options: { markUnread?: (args: { threadId: string }) => Promise<unknown> } = {}) {
  const { bb, harness } = createFakePluginHost({
    pluginId: "pr-thread-list",
    sdk: {
      threads: {
        markRead: async () => ({}),
        markUnread: options.markUnread ?? (async () => ({})),
      },
    } as never,
  });
  plugin(bb);
  return harness;
}

type Harness = ReturnType<typeof setup>;
const changes = (harness: Harness) => harness.realtimeSignals.filter((signal) => signal.channel === "snoozes.changed");
const list = (harness: Harness) => harness.callRpc("listSnoozes", {});
const thread = (id: string) => ({ thread: { id } }) as never;

describe("snoozes", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks the thread read, stores the wake time, and publishes", async () => {
    const harness = setup();

    await harness.callRpc("snooze", { threadId: "thr_1", wakeAt: NOW + HOUR });

    expect(harness.sdk.callsTo("threads.markRead")).toEqual([[{ threadId: "thr_1" }]]);
    await expect(list(harness)).resolves.toEqual({ snoozes: { thr_1: NOW + HOUR } });
    expect(changes(harness)).toHaveLength(1);
  });

  it("rejects a wake time in the past or more than 30 days ahead", async () => {
    const harness = setup();

    await expect(harness.callRpc("snooze", { threadId: "thr_1", wakeAt: NOW })).rejects.toThrow(/30 days/);
    await expect(harness.callRpc("snooze", { threadId: "thr_1", wakeAt: NOW + 31 * 24 * HOUR })).rejects.toThrow(/30 days/);
    expect(harness.sdk.callsTo("threads.markRead")).toEqual([]);
    await expect(list(harness)).resolves.toEqual({ snoozes: {} });
  });

  it("does not store the snooze when the thread cannot be marked read", async () => {
    const harness = setup();
    harness.sdk.stub("threads.markRead", async () => { throw new Error("not found"); });

    await expect(harness.callRpc("snooze", { threadId: "thr_1", wakeAt: NOW + HOUR })).rejects.toThrow();
    await expect(list(harness)).resolves.toEqual({ snoozes: {} });
  });

  it("ends a snooze on wake and publishes", async () => {
    const harness = setup();
    await harness.callRpc("snooze", { threadId: "thr_1", wakeAt: NOW + HOUR });

    await harness.callRpc("wake", { threadId: "thr_1" });

    await expect(list(harness)).resolves.toEqual({ snoozes: {} });
    expect(changes(harness)).toHaveLength(2);
    expect(harness.sdk.callsTo("threads.markUnread")).toEqual([]);
  });

  it("publishes nothing on wake for a thread that is not snoozed", async () => {
    const harness = setup();

    await harness.callRpc("wake", { threadId: "thr_1" });

    expect(changes(harness)).toEqual([]);
  });

  it("runs the wake sweep every minute", () => {
    const harness = setup();

    expect(harness.registrations.schedules.map(({ name, cron }) => ({ name, cron })))
      .toEqual([{ name: SNOOZE_WAKE_SCHEDULE, cron: "* * * * *" }]);
  });

  it("marks due threads unread, ends their snoozes, and publishes once", async () => {
    const harness = setup();
    await harness.callRpc("snooze", { threadId: "thr_due", wakeAt: NOW + HOUR });
    await harness.callRpc("snooze", { threadId: "thr_also_due", wakeAt: NOW + 2 * HOUR });
    await harness.callRpc("snooze", { threadId: "thr_later", wakeAt: NOW + 3 * HOUR });
    vi.setSystemTime(NOW + 2 * HOUR);

    await harness.runSchedule(SNOOZE_WAKE_SCHEDULE);

    expect(harness.sdk.callsTo("threads.markUnread").flat()).toEqual(
      expect.arrayContaining([{ threadId: "thr_due" }, { threadId: "thr_also_due" }]));
    expect(harness.sdk.callsTo("threads.markUnread")).toHaveLength(2);
    await expect(list(harness)).resolves.toEqual({ snoozes: { thr_later: NOW + 3 * HOUR } });
    expect(changes(harness)).toHaveLength(4);
  });

  it("does nothing in a sweep when no snooze is due", async () => {
    const harness = setup();
    await harness.callRpc("snooze", { threadId: "thr_1", wakeAt: NOW + HOUR });

    await harness.runSchedule(SNOOZE_WAKE_SCHEDULE);

    expect(harness.sdk.callsTo("threads.markUnread")).toEqual([]);
    expect(changes(harness)).toHaveLength(1);
  });

  it("keeps a snooze that was moved to a later time while the sweep ran", async () => {
    let finishMarkUnread: () => void = () => {};
    const harness = setup({ markUnread: () => new Promise<unknown>((resolve) => { finishMarkUnread = () => resolve({}); }) });
    await harness.callRpc("snooze", { threadId: "thr_1", wakeAt: NOW + HOUR });
    vi.setSystemTime(NOW + HOUR);

    const sweep = harness.runSchedule(SNOOZE_WAKE_SCHEDULE);
    await vi.waitFor(() => expect(harness.sdk.callsTo("threads.markUnread")).toHaveLength(1));
    await harness.callRpc("snooze", { threadId: "thr_1", wakeAt: NOW + 5 * HOUR });
    finishMarkUnread();
    await sweep;

    await expect(list(harness)).resolves.toEqual({ snoozes: { thr_1: NOW + 5 * HOUR } });
  });

  it("ends the snooze of a deleted thread in a sweep", async () => {
    const harness = setup({ markUnread: async () => { throw new Error("thread not found"); } });
    await harness.callRpc("snooze", { threadId: "thr_gone", wakeAt: NOW + HOUR });
    vi.setSystemTime(NOW + HOUR);

    await harness.runSchedule(SNOOZE_WAKE_SCHEDULE);

    await expect(list(harness)).resolves.toEqual({ snoozes: {} });
    expect(changes(harness)).toHaveLength(2);
  });

  it.each(["thread.idle", "thread.failed", "thread.archived", "thread.unarchived"] as const)("ends a snooze on %s", async (event) => {
    const harness = setup();
    await harness.callRpc("snooze", { threadId: "thr_1", wakeAt: NOW + HOUR });

    await harness.emitThreadEvent(event, thread("thr_1"));

    await expect(list(harness)).resolves.toEqual({ snoozes: {} });
    expect(changes(harness)).toHaveLength(2);
  });

  it("publishes nothing on a thread event for a thread that is not snoozed", async () => {
    const harness = setup();

    await harness.emitThreadEvent("thread.idle", thread("thr_1"));

    expect(changes(harness)).toEqual([]);
  });
});
