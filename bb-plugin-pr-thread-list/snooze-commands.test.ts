import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginCommandContext, PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { createSnoozeClient, type SnoozeSnapshot } from "./snooze-client";
import { snoozeCommands } from "./snooze-commands";
import { thread } from "./fixtures";

const context = (threadId: string | null = "t1"): PluginCommandContext => ({ threadId, projectId: "p1", openPanel: () => false });
const now = new Date(2026, 9, 7, 15);
afterEach(() => vi.useRealTimers());
function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const client = createSnoozeClient();
  const owner = client.start();
  const snooze = vi.fn().mockResolvedValue(undefined);
  const wake = vi.fn().mockResolvedValue(undefined);
  const initial: SnoozeSnapshot = { threads: [thread()], threadsReady: true, snoozes: {}, snoozesReady: true,
    controls: { snoozed: new Map(), snooze, wake } };
  const update = (changes: Partial<SnoozeSnapshot> = {}) => owner.update({ ...initial, ...changes });
  update();
  const commands = snoozeCommands(client);
  const visible = (ctx = context()) => commands.filter((command) => command.isAvailable!(ctx)).map(({ id }) => id);
  return { owner, update, commands, visible, snooze, wake };
}
const SNOOZE_IDS = ["snooze-tomorrow", "snooze-next-week"];

describe("command registration and availability", () => {
  it("registers the exact labels and no default shortcuts", () => {
    const { commands } = setup();
    expect(commands.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: "snooze-tomorrow", title: "Threads: Snooze until tomorrow" },
      { id: "snooze-next-week", title: "Threads: Snooze until next week" },
      { id: "wake-now", title: "Threads: Wake now" },
    ]);
    for (const command of commands) expect(command).not.toHaveProperty("defaultShortcut");
  });
  it.each<Partial<PluginSidebarThread>>([{}, { status: "active", runtimeStatus: "active" }, { isUnread: true }])(
    "offers snooze for an eligible idle, running, or unread thread: %j", (changes) => {
      const { update, visible } = setup();
      update({ threads: [thread(changes)] });
      expect(visible()).toEqual(SNOOZE_IDS);
    },
  );
  it.each<Partial<PluginSidebarThread>>([
    { hasPendingInteraction: true }, { indicator: "waiting-for-input" }, { indicator: "unread-error" },
    { queuedWork: "failed" }, { indicator: "queued-failed" }, { isArchived: true },
  ])("hides every action for a blocker or archived thread: %j", (changes) => {
    const { update, visible } = setup();
    update({ threads: [thread(changes)], snoozes: { t1: now.getTime() + 100_000 } });
    expect(visible()).toEqual([]);
    update({ threads: [thread(changes)] });
    expect(visible()).toEqual([]);
  });
  it("offers wake only for an active snooze, using the actual clock for expiry", () => {
    const { update, visible } = setup();
    update({ snoozes: { t1: now.getTime() + 1000 } });
    expect(visible()).toEqual(["wake-now"]);
    vi.setSystemTime(now.getTime() + 1000);
    expect(visible()).toEqual(SNOOZE_IDS);
  });
  it("hides all commands with no focus, unknown threads, missing state, or a stopped frontend", () => {
    const { update, visible, owner } = setup();
    expect(visible(context(null))).toEqual([]);
    expect(visible(context("unknown"))).toEqual([]);
    for (const changes of [{ threadsReady: false }, { snoozesReady: false }, { controls: null }, { threads: [] }]) {
      update(changes);
      expect(visible()).toEqual([]);
    }
    update();
    owner.stop();
    expect(visible()).toEqual([]);
  });
  it("hides Next week on Sunday", () => {
    const { visible } = setup();
    vi.setSystemTime(new Date(2026, 9, 11, 15));
    expect(visible()).toEqual(["snooze-tomorrow"]);
  });
});

describe("direct command invocation", () => {
  it.each<Partial<SnoozeSnapshot>>([
    { threads: [thread({ hasPendingInteraction: true })] },
    { threads: [thread({ isArchived: true })] }, { threads: [] },
    { snoozes: { t1: now.getTime() + 100_000 } },
    { threadsReady: false }, { snoozesReady: false }, { controls: null },
  ])("does not mutate when a listed snooze action becomes inapplicable: %j", async (changes) => {
    const { commands, update, snooze, wake } = setup();
    expect(commands[0]!.isAvailable!(context())).toBe(true);
    update(changes);
    for (const command of commands.slice(0, 2)) await command.run(context());
    expect(snooze).not.toHaveBeenCalled();
    expect(wake).not.toHaveBeenCalled();
  });
  it("blocks all retained actions after owner cleanup", async () => {
    const { commands, owner, snooze, wake } = setup();
    owner.stop();
    for (const command of commands) await command.run(context());
    expect(snooze).not.toHaveBeenCalled();
    expect(wake).not.toHaveBeenCalled();
  });
  it("does not wake a snooze that another client ended, that expired, or that needs input", async () => {
    const { commands, update, snooze, wake } = setup();
    const command = commands[2]!;
    for (const changes of <Partial<SnoozeSnapshot>[]>[
      { snoozes: {} }, { snoozes: { t1: now.getTime() } },
      { threads: [thread({ hasPendingInteraction: true })], snoozes: { t1: now.getTime() + 100_000 } },
    ]) {
      update({ snoozes: { t1: now.getTime() + 100_000 } });
      expect(command.isAvailable!(context())).toBe(true);
      update(changes);
      await command.run(context());
    }
    expect(snooze).not.toHaveBeenCalled();
    expect(wake).not.toHaveBeenCalled();
  });
  it("uses invocation focus, never the thread from the availability check", async () => {
    const { commands, update, snooze, wake } = setup();
    update({ threads: [thread(), thread({ id: "t2" })] });
    expect(commands[0]!.isAvailable!(context("t1"))).toBe(true);
    await commands[0]!.run(context("t2"));
    expect(snooze).toHaveBeenCalledExactlyOnceWith("t2", new Date(2026, 9, 8, 9).getTime());
    for (const id of [null, "unknown"]) for (const command of commands) await command.run(context(id));
    expect(snooze).toHaveBeenCalledOnce();
    expect(wake).not.toHaveBeenCalled();
  });
  it("recomputes Tomorrow at invocation after local midnight", async () => {
    const { commands, snooze } = setup();
    vi.setSystemTime(new Date(2026, 9, 7, 23, 59));
    expect(commands[0]!.isAvailable!(context())).toBe(true);
    vi.setSystemTime(new Date(2026, 9, 8, 0, 1));
    await commands[0]!.run(context());
    expect(snooze).toHaveBeenCalledExactlyOnceWith("t1", new Date(2026, 9, 9, 9).getTime());
  });
  it("does not substitute Tomorrow when Next week disappears on Sunday", async () => {
    const { commands, snooze, wake } = setup();
    vi.setSystemTime(new Date(2026, 9, 10, 23, 59));
    expect(commands[1]!.isAvailable!(context())).toBe(true);
    vi.setSystemTime(new Date(2026, 9, 11, 0, 1));
    await commands[1]!.run(context());
    expect(snooze).not.toHaveBeenCalled();
    expect(wake).not.toHaveBeenCalled();
  });
});
