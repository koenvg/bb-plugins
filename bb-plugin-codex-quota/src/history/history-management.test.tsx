// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { flushSync } from "react-dom";
import { createFakePluginHost, makeHostResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "../plugin/server.js";
import { calendarSnapshot } from "./calendar/calendar-test-support.js";
import type { CalendarQuery } from "./calendar/calendar-contract.js";
import { importUnavailable } from "./import/import-contract.js";
import { setHistoryManagementOpen } from "./history-test-support.js";

const app = await loadPluginApp(() => import("../plugin/app.js"));
afterEach(cleanup);

it("keeps management idle through closed host changes and calendar navigation, then loads the selected host on open", async () => {
  const { bb, harness } = createFakePluginHost({
    pluginId: "codex-quota",
    sdk: {
      hosts: { get: async ({ hostId }: { hostId: string }) => makeHostResponse({ id: hostId }) },
    },
    experimental_callHostRpc: async ({ method, input }) => {
      if (method === "quota")
        return { state: "unavailable", reason: "auth-required", snapshot: null };
      if (method === "calendarReport") return calendarSnapshot(input as CalendarQuery);
      if (method === "historyReadiness")
        return {
          state: "not-configured",
          reason: "not-configured",
          storage: "unconfigured",
          collector: "missing",
          writer: "unconfirmed",
        };
      if (method === "historicalImport") return importUnavailable("not-configured");
      throw new Error(`Unexpected host request: ${method}`);
    },
  });
  plugin(bb);
  await harness.behavior.callRpc("selectHost", { hostId: "host_a" });
  const options = {
    sdk: {
      hosts: {
        list: async () => [
          makeHostResponse({ id: "host_a", name: "Host A" }),
          makeHostResponse({ id: "host_b", name: "Host B" }),
        ],
      },
    },
    rpc: Object.fromEntries(
      [
        "selection",
        "selectHost",
        "read",
        "calendarReport",
        "historyReadiness",
        "historicalImport",
      ].map((method) => [method, (input: unknown) => harness.behavior.callRpc(method, input)]),
    ),
  };
  const owner = renderSlot(
    app.appOverlays.find((slot) => slot.id === "quota-refresh")!,
    {},
    options,
  );
  const settings = renderSlot(app.settingsSections[0]!, {}, options);
  const calendar = renderSlot(app.navPanels[0]!, { subPath: "" }, options);
  const q = within(settings.container);
  const chart = within(calendar.container);
  const managementCalls = () =>
    harness.experimental_hostRpcCalls.filter((call) =>
      /historyReadiness|historicalImport|collectorControl/.test(call.method),
    );
  try {
    await chart.findByRole("group", { name: "Daily recorded values" });
    expect(managementCalls()).toEqual([]);
    expect(q.queryByRole("region", { name: "History readiness" })).toBeNull();
    fireEvent.change(q.getByRole("combobox", { name: "Codex host" }), {
      target: { value: "host_b" },
    });
    await chart.findByRole("group", { name: "Daily recorded values" });
    await waitFor(() => expect(harness.experimental_hostRpcCalls.at(-1)?.hostId).toBe("host_b"));
    fireEvent.click(chart.getByRole("button", { name: "Previous 30 days" }));
    await chart.findByRole("group", { name: "Daily recorded values" });
    fireEvent.change(chart.getByRole("combobox", { name: "Report metric" }), {
      target: { value: "cost" },
    });
    expect(managementCalls()).toEqual([]);
    await setHistoryManagementOpen(settings.container);
    await q.findByText("History not configured on this host.");
    await waitFor(() => expect(managementCalls()).toHaveLength(2));
    expect(managementCalls().map(({ hostId, method }) => ({ hostId, method }))).toEqual(
      expect.arrayContaining([
        { hostId: "host_b", method: "historyReadiness" },
        { hostId: "host_b", method: "historicalImport" },
      ]),
    );
    expect(
      managementCalls().find((call) => call.method === "historicalImport")?.input,
    ).toMatchObject({ command: { action: "status" } });
  } finally {
    settings.lifecycle.unmount();
    calendar.lifecycle.unmount();
    owner.lifecycle.unmount();
    await harness.lifecycle.dispose();
  }
});

function fixture() {
  const missing = {
    state: "not-configured",
    reason: "not-configured",
    storage: "unconfigured",
    collector: "missing",
    writer: "unconfirmed",
  };
  const pending: { method: string; input: unknown; resolve(value: unknown): void }[] = [];
  const request = (method: string, input: unknown) =>
    new Promise((resolve) => pending.push({ method, input, resolve }));
  const options = {
    sdk: {
      hosts: {
        list: async () => [
          makeHostResponse({ id: "host_a", name: "Host A" }),
          makeHostResponse({ id: "host_b", name: "Host B" }),
        ],
      },
    },
    rpc: {
      selection: async () => ({ hostId: "host_a", generation: 1 }),
      selectHost: async (input: unknown) => ({
        hostId: (input as { hostId: string }).hostId,
        generation: 2,
      }),
      read: async () => ({ state: "unavailable", reason: "auth-required", snapshot: null }),
      historyReadiness: (input: unknown) => request("historyReadiness", input),
      historicalImport: (input: unknown) => request("historicalImport", input),
      collectorControl: (input: unknown) => request("collectorControl", input),
    },
  };
  const owner = renderSlot(
    app.appOverlays.find((slot) => slot.id === "quota-refresh")!,
    {},
    options,
  );
  const page = renderSlot(app.settingsSections[0]!, {}, options);
  const q = within(page.container);
  return {
    page,
    q,
    pending,
    missing,
    settle: async () =>
      act(async () => {
        for (const call of pending)
          call.resolve(
            call.method === "historicalImport" ? importUnavailable("not-configured") : missing,
          );
      }),
    stop: () => {
      page.lifecycle.unmount();
      owner.lifecycle.unmount();
    },
  };
}

it.each(["close", "unmount"])(
  "does not dispatch management reads if %s occurs before the queued request",
  async (action) => {
    const f = fixture();
    await f.q.findByRole("option", { name: "Host A" });
    await act(async () => {
      const details = f.q.getByText("Collection and history management").closest("details")!;
      flushSync(() => {
        details.open = true;
        fireEvent(details, new Event("toggle"));
      });
      if (action === "unmount") f.page.lifecycle.unmount();
      else
        flushSync(() => {
          details.open = false;
          fireEvent(details, new Event("toggle"));
        });
    });
    expect(f.pending).toEqual([]);
    f.stop();
  },
);

it("discards closed-host results and refreshes readiness and import status on reopen", async () => {
  const f = fixture();
  await f.q.findByRole("option", { name: "Host A" });
  await setHistoryManagementOpen(f.page.container);
  await waitFor(() => expect(f.pending).toHaveLength(2));
  const old = [...f.pending];
  await setHistoryManagementOpen(f.page.container, false);
  expect(f.q.queryByRole("region", { name: "History readiness" })).toBeNull();
  fireEvent.change(f.q.getByRole("combobox", { name: "Codex host" }), {
    target: { value: "host_b" },
  });
  await waitFor(() =>
    expect(f.q.getByRole("combobox", { name: "Codex host" })).toHaveProperty("value", "host_b"),
  );
  expect(f.pending).toHaveLength(2);
  await setHistoryManagementOpen(f.page.container);
  await waitFor(() => expect(f.pending).toHaveLength(4));
  expect(f.pending.slice(2).map((call) => call.input)).toEqual(
    expect.arrayContaining([
      { hostId: "host_b", generation: 2 },
      { hostId: "host_b", generation: 2, command: { action: "status" } },
    ]),
  );
  await act(async () => {
    old[0].resolve({
      ...f.missing,
      state: "unavailable",
      reason: "collector-incompatible",
      collector: "incompatible",
    });
    old[1].resolve(importUnavailable("storage-incompatible"));
  });
  expect(f.q.queryByText(/Collector is incompatible/)).toBeNull();
  expect(f.q.queryByText(/Import storage is incompatible/)).toBeNull();
  await f.settle();
  await f.q.findByText("History not configured on this host.");
  await setHistoryManagementOpen(f.page.container, false);
  await setHistoryManagementOpen(f.page.container);
  await waitFor(() => expect(f.pending).toHaveLength(6));
  await f.settle();
  await f.q.findByText("History not configured on this host.");
  f.stop();
});

it.each(["close", "unmount"])(
  "blocks queued collector and import commands after %s",
  async (action) => {
    const f = fixture();
    await f.q.findByRole("option", { name: "Host A" });
    await setHistoryManagementOpen(f.page.container);
    await waitFor(() => expect(f.pending).toHaveLength(2));
    await f.settle();
    const privacy = f.q.getByText("Collection and privacy").closest("details")!;
    privacy.open = true;
    const imports = f.q.getByText(/^Historical import$/).closest("details")!;
    imports.open = true;
    await act(async () => {
      fireEvent.click(f.q.getByRole("button", { name: "Install collector" }));
      fireEvent.click(f.q.getByRole("button", { name: "Check import status" }));
      if (action === "unmount") f.page.lifecycle.unmount();
      else
        flushSync(() => {
          const details = f.q.getByText("Collection and history management").closest("details")!;
          details.open = false;
          fireEvent(details, new Event("toggle"));
        });
    });
    expect(f.pending).toHaveLength(2);
    f.stop();
  },
);

it("does not publish a late collector or import result after closing and reopening", async () => {
  const f = fixture();
  await f.q.findByRole("option", { name: "Host A" });
  await setHistoryManagementOpen(f.page.container);
  await waitFor(() => expect(f.pending).toHaveLength(2));
  await f.settle();
  f.q.getByText("Collection and privacy").closest("details")!.open = true;
  f.q.getByText(/^Historical import$/).closest("details")!.open = true;
  fireEvent.click(f.q.getByRole("button", { name: "Install collector" }));
  fireEvent.click(f.q.getByRole("button", { name: "Check import status" }));
  await waitFor(() => expect(f.pending).toHaveLength(4));
  await setHistoryManagementOpen(f.page.container, false);
  await setHistoryManagementOpen(f.page.container);
  await waitFor(() => expect(f.pending).toHaveLength(6));
  await act(async () => {
    f.pending[2].resolve({
      ...f.missing,
      state: "unavailable",
      reason: "collector-incompatible",
      collector: "incompatible",
    });
    f.pending[3].resolve(importUnavailable("storage-incompatible"));
  });
  expect(f.q.queryByText(/Collector is incompatible/)).toBeNull();
  expect(f.q.queryByText(/Import storage is incompatible/)).toBeNull();
  await f.settle();
  await f.q.findByText("History not configured on this host.");
  f.stop();
});

it.each(["commands", "host"])(
  "blocks %s requests during native close before toggle delivery",
  async (action) => {
    const f = fixture();
    await f.q.findByRole("option", { name: "Host A" });
    const summary = f.q.getByText("Collection and history management");
    fireEvent.click(summary);
    await waitFor(() => expect(f.pending).toHaveLength(2));
    await f.settle();
    f.q.getByText("Collection and privacy").closest("details")!.open = true;
    f.q.getByText(/^Historical import$/).closest("details")!.open = true;
    await act(async () => {
      if (action === "commands") {
        fireEvent.click(f.q.getByRole("button", { name: "Install collector" }));
        fireEvent.click(f.q.getByRole("button", { name: "Check import status" }));
      }
      fireEvent.click(summary);
      expect(summary.closest("details")!.open).toBe(false);
      if (action === "host")
        fireEvent.change(f.q.getByRole("combobox", { name: "Codex host" }), {
          target: { value: "host_b" },
        });
      // Native toggle is delivered in a later task. Let request microtasks run first.
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(f.pending).toHaveLength(2);
    await waitFor(() =>
      expect(f.q.queryByRole("region", { name: "History readiness" })).toBeNull(),
    );
    fireEvent.click(summary);
    await waitFor(() => expect(f.pending).toHaveLength(4));
    expect(f.pending[2].input).toMatchObject({ hostId: action === "host" ? "host_b" : "host_a" });
    await f.settle();
    f.stop();
  },
);
