// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLayoutEffect, useRef, type ComponentType } from "react";
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { definePluginApp, useRealtimeConnectionState, type PluginCommandContext, type PluginCommandRegistration } from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot, type RenderSlotOptions } from "@get-bb/plugin-sdk/testing/app";
import { toast } from "sonner";
import definition from "./app";
import { project, thread } from "./fixtures";
import type { rpcContract } from "./contract";

type Options = Omit<RenderSlotOptions, "rpc"> & { rpc?: Partial<NonNullable<RenderSlotOptions<typeof rpcContract>["rpc"]>> };

const commands: PluginCommandRegistration[] = [];
// Capture through the public setup callback while retaining SDK registration validation.
const app = await loadPluginApp(definePluginApp((builder) => definition.setup({ ...builder,
  commands: { register(command) { commands.push(command); builder.commands.register(command); } },
})));
const Owner = app.appOverlays[0]!.component;
const List = app.threadLists[0]!.component;
const context = (threadId: string | null = "t1"): PluginCommandContext => ({ threadId, projectId: "p1", openPanel: () => false });
const available = (ctx = context()) => commands.filter((command) => command.isAvailable!(ctx)).map(({ id }) => id);
const command = (id: string) => commands.find((entry) => entry.id === id)!;
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

function mount(options: Options = {}, list = false, Observer?: ComponentType) {
  const { rpc, ...extras } = options;
  return renderSlot<{}, typeof rpcContract>({ component: () => <><Owner />{list ? <List activeThreadId="t1" activeProjectId="p1"
    isCompactViewport={false} onNavigate={() => {}} searchQuery="" /> : null}{Observer ? <Observer /> : null}</> }, {}, {
    sidebarThreads: { threads: [thread()], projects: [project] },
    ...extras,
    rpc: { listSnoozes: () => ({ snoozes: {} }), listSummaries: () => ({ insightAvailable: true, summaries: {} }),
      snooze: () => ({}), wake: () => ({}), ...rpc },
  });
}
const calls = (slot: ReturnType<typeof renderSlot>, method: string) =>
  slot.inspection.rpcCalls.filter((call) => call.method === method);

it("registers three commands through the SDK and operates with only the headless owner mounted", async () => {
  expect(commands.map(({ id }) => id)).toEqual(["snooze-tomorrow", "snooze-next-week", "wake-now"]);
  expect(commands.every((entry) => !entry.defaultShortcut)).toBe(true);
  let snoozes: Record<string, number> = {};
  const slot = mount({ rpc: {
    listSnoozes: () => ({ snoozes }),
    snooze: ({ threadId, wakeAt }) => { snoozes = { [threadId]: wakeAt }; return {}; },
    wake: () => { snoozes = {}; return {}; },
  } });
  await waitFor(() => expect(available()).toContain("snooze-tomorrow"));
  expect(slot.container.textContent).toBe("");
  await act(async () => command("snooze-tomorrow").run(context()));
  await waitFor(() => expect(available()).toEqual(["wake-now"]));
  expect(calls(slot, "listSnoozes")).toHaveLength(2);
  await act(async () => command("wake-now").run(context()));
  await waitFor(() => expect(available()).toContain("snooze-tomorrow"));
  expect(calls(slot, "wake").map(({ input }) => input)).toEqual([{ threadId: "t1" }]);
  expect(calls(slot, "listSnoozes")).toHaveLength(3);
  expect(slot.inspection.sdkCalls).toEqual([]);
  const beforeStop = slot.inspection.rpcCalls.length;
  slot.lifecycle.unmount();
  expect(available()).toEqual([]);
  await command("snooze-tomorrow").run(context());
  expect(slot.inspection.rpcCalls).toHaveLength(beforeStop);
});

it("uses focused invocation context even when its row is hidden and the sidebar selects another thread", async () => {
  let snoozes: Record<string, number> = {};
  const slot = mount({ context: { threadId: "t1", projectId: "p1" },
    sidebarThreads: { threads: [thread(), thread({ id: "t2", displayTitle: "Hidden", isHidden: true })], projects: [project] },
    rpc: { listSnoozes: () => ({ snoozes }), listSummaries: () => ({ insightAvailable: true, summaries: {} }),
      snooze: ({ threadId, wakeAt }) => { snoozes = { [threadId]: wakeAt }; return {}; } },
  }, true);
  await waitFor(() => expect(available(context("t2"))).toContain("snooze-tomorrow"));
  expect(slot.queryByRole("link", { name: "Hidden" })).toBeNull();
  await act(async () => command("snooze-tomorrow").run(context("t2")));
  await waitFor(() => expect(available(context("t2"))).toEqual(["wake-now"]));
  expect(calls(slot, "snooze")[0]!.input).toMatchObject({ threadId: "t2" });
  expect(available(context("t1"))).toContain("snooze-tomorrow");
  expect(calls(slot, "listSnoozes")).toHaveLength(2);
});

it("keeps the sidebar and commands in sync after snooze, wake, and another client's update", async () => {
  let snoozes: Record<string, number> = {};
  const slot = mount({ rpc: {
    listSnoozes: () => ({ snoozes }), listSummaries: () => ({ insightAvailable: true, summaries: {} }),
    snooze: ({ wakeAt }) => { snoozes = { t1: wakeAt }; return {}; },
    wake: () => { snoozes = {}; return {}; },
  } }, true);
  await waitFor(() => expect(available()).toContain("snooze-tomorrow"));
  expect(calls(slot, "listSnoozes")).toHaveLength(1);
  await act(async () => command("snooze-tomorrow").run(context()));
  await waitFor(() => expect(slot.queryByRole("link", { name: "Prepare release" })).toBeNull());
  fireEvent.click(slot.getByRole("tab", { name: "All" }));
  expect(slot.getByRole("button", { name: "Collapse Snoozed" })).toBeTruthy();
  expect(available()).toEqual(["wake-now"]);
  await act(async () => command("wake-now").run(context()));
  await waitFor(() => expect(slot.queryByRole("button", { name: "Collapse Snoozed" })).toBeNull());
  snoozes = { t1: Date.now() + 100_000 };
  await slot.behavior.emitRealtime("snoozes.changed", {});
  expect(available()).toEqual(["wake-now"]);
  expect(slot.getByRole("button", { name: "Collapse Snoozed" })).toBeTruthy();
  snoozes = {};
  await slot.behavior.emitRealtime("snoozes.changed", {});
  expect(available()).toContain("snooze-tomorrow");
  expect(slot.queryByRole("button", { name: "Collapse Snoozed" })).toBeNull();
});

describe("unavailable state and failures", () => {
  it.each(["loading", "error"] as const)("hides all commands when thread state is %s", async (status) => {
    mount({ sidebarThreads: { threads: [thread()], status } });
    await act(async () => {});
    expect(available()).toEqual([]);
    await command("snooze-tomorrow").run(context());
  });
  it.each(["snooze-tomorrow", "wake-now"])("blocks %s in the first connected commit before its reload starts", async (id) => {
    const snoozed = { t1: Date.now() + 100_000 };
    const initial = id === "wake-now" ? snoozed : {};
    const refreshed = id === "wake-now" ? {} : snoozed;
    let finish!: (value: { snoozes: Record<string, number> }) => void;
    const pending = new Promise<{ snoozes: Record<string, number> }>((resolve) => { finish = resolve; });
    let reads = 0;
    let visibleAtReconnect: string[] | undefined;
    let invocation: void | Promise<void>;
    function ObserveConnectedCommit() {
      const connection = useRealtimeConnectionState();
      const previous = useRef(connection);
      useLayoutEffect(() => {
        if (previous.current === "reconnecting" && connection === "connected") {
          visibleAtReconnect = available();
          invocation = command(id).run(context());
        }
        previous.current = connection;
      }, [connection]);
      return null;
    }
    const slot = mount({ rpc: { listSnoozes: () => ++reads === 1 ? { snoozes: initial } : pending } },
      false, ObserveConnectedCommit);
    await waitFor(() => expect(available()).toContain(id));
    await slot.behavior.setRealtimeConnectionState("reconnecting");
    await slot.behavior.setRealtimeConnectionState("connected");
    await invocation!;
    expect(visibleAtReconnect).toEqual([]);
    expect(calls(slot, "snooze")).toHaveLength(0);
    expect(calls(slot, "wake")).toHaveLength(0);
    expect(reads).toBe(2);
    await act(async () => finish({ snoozes: refreshed }));
    expect(available()).not.toContain(id);
  });
  it("fails closed for an initial load, a failed refresh, and reconnect, then recovers", async () => {
    let fail = true;
    let result: Promise<{ snoozes: Record<string, number> }> | undefined;
    const slot = mount({ rpc: { listSnoozes: () => {
      if (result) return result;
      if (fail) throw new Error("offline");
      return { snoozes: {} };
    } } });
    await act(async () => {});
    expect(available()).toEqual([]);
    fail = false;
    await slot.behavior.emitRealtime("snoozes.changed", {});
    expect(available()).toContain("snooze-tomorrow");
    fail = true;
    await slot.behavior.emitRealtime("snoozes.changed", {});
    expect(available()).toEqual([]);
    fail = false;
    await slot.behavior.emitRealtime("snoozes.changed", {});
    expect(available()).toContain("snooze-tomorrow");
    let finish!: (value: { snoozes: Record<string, number> }) => void;
    result = new Promise((resolve) => { finish = resolve; });
    await slot.behavior.setRealtimeConnectionState("reconnecting");
    expect(available()).toEqual([]);
    await slot.behavior.setRealtimeConnectionState("connected");
    expect(available()).toEqual([]);
    await act(async () => finish({ snoozes: {} }));
    expect(available()).toContain("snooze-tomorrow");
  });
  it.each([
    ["snooze-tomorrow", {}, "Could not snooze the thread."],
    ["wake-now", { t1: Date.now() + 100_000 }, "Could not wake the thread."],
  ] as const)("shows failure without a successful local change for %s", async (id, snoozes, message) => {
    const error = vi.spyOn(toast, "error").mockImplementation(() => "toast");
    const slot = mount({ rpc: { listSnoozes: () => ({ snoozes }),
      snooze: () => { throw new Error("offline"); }, wake: () => { throw new Error("offline"); } } });
    await waitFor(() => expect(available()).toContain(id));
    const before = available();
    await act(async () => command(id).run(context()));
    expect(error).toHaveBeenCalledWith(message);
    expect(available()).toEqual(before);
    expect(calls(slot, "listSnoozes")).toHaveLength(1);
  });
});
