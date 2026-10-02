// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, waitFor } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { createSnoozeClient, SnoozeOwner } from "./snooze-client";
import { thread } from "./fixtures";

afterEach(cleanup);

it("owns one snooze reader, clears controls on cleanup, and ignores old generation responses", async () => {
  const client = createSnoozeClient();
  let finish!: (value: { snoozes: Record<string, number> }) => void;
  const pending = new Promise<{ snoozes: Record<string, number> }>((resolve) => { finish = resolve; });
  const mount = (listSnoozes: () => unknown) => renderSlot(
    { component: () => <SnoozeOwner client={client} /> }, {},
    { sidebarThreads: { threads: [thread()] }, rpc: { listSnoozes, snooze: () => ({}), wake: () => ({}) } },
  );
  const first = mount(() => pending);
  expect(client.getSnapshot().snoozesReady).toBe(false);
  expect(first.inspection.rpcCalls).toHaveLength(1);
  first.lifecycle.unmount();
  expect(client.getSnapshot().controls).toBeNull();
  const second = mount(() => ({ snoozes: {} }));
  await waitFor(() => expect(client.getSnapshot().snoozesReady).toBe(true));
  await act(async () => finish({ snoozes: { t1: Date.now() + 100_000 } }));
  expect(client.getSnapshot().snoozes).toEqual({});
  const retained = client.getSnapshot().controls!;
  second.lifecycle.unmount();
  await act(async () => { await retained.snooze("t1", Date.now() + 100_000); await retained.wake("t1"); });
  await second.behavior.emitRealtime("snoozes.changed", {});
  expect(second.inspection.rpcCalls).toHaveLength(1);
  expect(client.getSnapshot().threadsReady).toBe(false);
});

it("keeps one early-wake operation in flight across realtime refreshes", async () => {
  const client = createSnoozeClient();
  const wake = vi.fn(() => new Promise(() => {}));
  const slot = renderSlot({ component: () => <SnoozeOwner client={client} /> }, {}, {
    sidebarThreads: { threads: [thread({ hasPendingInteraction: true })] },
    rpc: { listSnoozes: () => ({ snoozes: { t1: Date.now() + 100_000 } }), wake },
  });
  await waitFor(() => expect(wake).toHaveBeenCalledOnce());
  await slot.behavior.emitRealtime("snoozes.changed", {});
  expect(wake).toHaveBeenCalledOnce();
  expect(slot.inspection.rpcCalls.filter(({ method }) => method === "listSnoozes")).toHaveLength(2);
});
