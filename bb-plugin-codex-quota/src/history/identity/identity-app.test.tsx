// @vitest-environment jsdom
import { cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { RenderSlotOptions } from "@get-bb/plugin-sdk/testing/app";
import type { rpcContract } from "../../plugin/server.js";
import { makeHostResponse } from "@get-bb/plugin-sdk/testing";
const app = await loadPluginApp(() => import("../../plugin/app.js"));
import { setHistoryManagementOpen } from "../history-test-support.js";
afterEach(cleanup);
it("uses public BB navigation and clears verified totals during a host switch", async () => {
  let selected: { hostId: string | null; generation: number } = { hostId: "host_a", generation: 1 };
  let quotaReads = 0;
  const options: RenderSlotOptions<
    Pick<typeof rpcContract, "selection" | "selectHost" | "read" | "historyReadiness">
  > = {
    sdk: {
      hosts: {
        list: async () => [makeHostResponse({ id: "host_a" }), makeHostResponse({ id: "host_b" })],
      },
    },
    rpc: {
      selection: async () => selected,
      selectHost: async ({ hostId }) => {
        selected = { hostId, generation: 2 };
        return selected;
      },
      read: async () => {
        quotaReads++;
        return { state: "unavailable", reason: "auth-required", snapshot: null };
      },
      historyReadiness: async ({ hostId }) => ({
        state: "available",
        reason: "ok",
        storage: "compatible",
        collector: "compatible-v1",
        writer: "observed",
        collection: {
          enabled: true,
          firstObservedAt: "2026-10-01T00:00:00.000Z",
          pauseCount: 0,
          invalidRecords: 0,
          unconfirmedEvents: 0,
          conflictingEntries: 0,
          backlog: false,
          workspaces: [],
          truncated: false,
          attribution:
            hostId === "host_a"
              ? {
                  discovery: "complete",
                  backlog: false,
                  grades: [],
                  threads: [
                    {
                      threadId: "thr_verified",
                      label: "Verified synthetic thread",
                      state: "available",
                      totalTokens: 3,
                      events: 1,
                    },
                  ],
                  truncated: false,
                }
              : { discovery: "partial", backlog: true, grades: [], threads: [], truncated: false },
        },
      }),
    },
  };
  const owner = renderSlot(
    app.appOverlays.find((s) => s.id === "quota-refresh")!,
    {},
    options,
  );
  const panel = renderSlot(app.settingsSections[0]!, {}, options);
  const q = within(panel.container);
  await setHistoryManagementOpen(panel.container);
  fireEvent.click(await q.findByRole("button", { name: "Open thread thr_verified" }));
  expect(panel.inspection.navigateCalls).toEqual([
    { method: "toThread", threadId: "thr_verified" },
  ]);
  fireEvent.change(q.getByRole("combobox", { name: "Codex host" }), {
    target: { value: "host_b" },
  });
  expect(q.queryByRole("button", { name: "Open thread thr_verified" })).toBeNull();
  await q.findByText(/Identity discovery: partial/);
  expect(q.queryByText("Verified synthetic thread")).toBeNull();
  expect(quotaReads).toBeLessThanOrEqual(2);
  panel.lifecycle.unmount();
  owner.lifecycle.unmount();
});
