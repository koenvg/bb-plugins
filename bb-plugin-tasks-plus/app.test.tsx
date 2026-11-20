// @vitest-environment jsdom

import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

const app = await loadPluginApp(() => import("./app"));

afterEach(cleanup);

function Badge() {
  const badge = app.navPanels[0]!.experimental_useBadge!();
  return badge ? <output aria-label={badge.label}>{badge.count}</output> : null;
}

it("does not register the removed Orchestrator approval renderer", () => {
  expect(app.pendingInteractions.map(({ id }) => id)).not.toContain("orchestrator-run");
  expect(app.navPanels.map(({ id }) => id)).toContain("tasks");
  expect(app.tabs).toContainEqual(
    expect.objectContaining({
      id: "task",
      context: { kind: "thread" },
      availability: "action",
    }),
  );
});
it("registers inline Tasks navigation without a fixed Navigation pane", () => {
  expect(app.tabs.filter((tab) => tab.availability === "fixed")).toMatchObject([
    {
      id: "ticket",
      context: { kind: "nav-panel", panelId: "tasks" },
      availability: "fixed",
      title: "Ticket",
      icon: "ListTodo",
      layout: "flush",
    },
  ]);
  expect(app.navPanels[0]?.experimental_useBadge).toBeTypeOf("function");
});
describe("Tasks navigation badge data", () => {
  it("renders the durable open count and refreshes it on task changes", async () => {
    let openTaskCount = 123;
    const Accessory = Badge;
    expect(Accessory).toBeTypeOf("function");

    const slot = renderSlot(
      { component: Accessory! },
      {},
      {
        rpc: {
          sidebarOpenTaskCount: () => ({ openTaskCount }),
        },
      },
    );

    expect(await slot.findByText("123")).toBeDefined();
    expect(slot.getByLabelText("123 open tasks").textContent).toBe("123");
    openTaskCount = 13;
    await slot.behavior.emitRealtime("tasks:changed", {
      taskId: "01HZZZZZZZZZZZZZZZZZZZZZT1",
      projectId: "01HZZZZZZZZZZZZZZZZZZZZZP1",
    });

    await waitFor(() => expect(slot.getByText("13")).toBeDefined());
    openTaskCount = 7;
    await slot.behavior.emitRealtime("projects:changed", {
      projectId: "01HZZZZZZZZZZZZZZZZZZZZZP1",
    });
    await waitFor(() => expect(slot.getByText("7")).toBeDefined());
    expect(
      slot.inspection.rpcCalls.filter(({ method }) => method === "sidebarOpenTaskCount"),
    ).toHaveLength(3);
  });

  it("hides the count when there are no open tasks", async () => {
    let openTaskCount = 0;
    const Accessory = Badge;

    const slot = renderSlot(
      { component: Accessory! },
      {},
      {
        rpc: {
          sidebarOpenTaskCount: () => ({ openTaskCount }),
        },
      },
    );

    await waitFor(() =>
      expect(
        slot.inspection.rpcCalls.filter(({ method }) => method === "sidebarOpenTaskCount"),
      ).toHaveLength(1),
    );
    expect(slot.queryByText("0")).toBeNull();

    openTaskCount = 1;
    await slot.behavior.emitRealtime("tasks:changed", {
      taskId: "01HZZZZZZZZZZZZZZZZZZZZZT1",
      projectId: "01HZZZZZZZZZZZZZZZZZZZZZP1",
    });
    expect(await slot.findByText("1")).toBeDefined();

    openTaskCount = 0;
    await slot.behavior.emitRealtime("tasks:changed", {
      taskId: "01HZZZZZZZZZZZZZZZZZZZZZT1",
      projectId: "01HZZZZZZZZZZZZZZZZZZZZZP1",
    });
    await waitFor(() => expect(slot.queryByText("1")).toBeNull());
    expect(slot.queryByText("0")).toBeNull();
  });

  it("coalesces a burst of task changes into one trailing count refresh", async () => {
    let calls = 0;
    let resolveFirstRequest: ((result: { openTaskCount: number }) => void) | undefined;
    const firstRequest = new Promise<{ openTaskCount: number }>((resolve) => {
      resolveFirstRequest = resolve;
    });
    const Accessory = Badge;

    const slot = renderSlot(
      { component: Accessory! },
      {},
      {
        rpc: {
          sidebarOpenTaskCount: () => {
            calls += 1;
            return calls === 1 ? firstRequest : { openTaskCount: 13 };
          },
        },
      },
    );

    await waitFor(() => expect(calls).toBe(1));
    expect(slot.queryByRole("status")).toBeNull();
    await slot.behavior.emitRealtime("tasks:changed", {
      taskId: "01HZZZZZZZZZZZZZZZZZZZZZT1",
      projectId: "01HZZZZZZZZZZZZZZZZZZZZZP1",
    });
    await slot.behavior.emitRealtime("tasks:changed", {
      taskId: "01HZZZZZZZZZZZZZZZZZZZZZT2",
      projectId: "01HZZZZZZZZZZZZZZZZZZZZZP1",
    });
    await slot.behavior.emitRealtime("projects:changed", {
      projectId: "01HZZZZZZZZZZZZZZZZZZZZZP1",
    });
    expect(calls).toBe(1);

    await act(async () => {
      resolveFirstRequest?.({ openTaskCount: 12 });
      await firstRequest;
    });

    await waitFor(() => expect(calls).toBe(2));
    expect(await slot.findByText("13")).toBeDefined();
    expect(slot.getByLabelText("13 open tasks").textContent).toBe("13");
  });
});

it("blocks webhook actions until repaired and confirms only the selected deletion", async () => {
  const section = app.settingsSections.find(({ id }) => id === "webhooks")!;
  expect(section).toBeDefined();
  const first = { id: `wh_${"a".repeat(32)}`, scope: { kind: "global" }, hasAuthorization: true };
  const second = { id: `wh_${"b".repeat(32)}`, scope: { kind: "global" }, hasAuthorization: false };
  let blocked = true;
  let endpoints = [first, second];
  const slot = renderSlot(
    section,
    {},
    {
      rpc: {
        listWebhooks: () =>
          blocked ? { state: "blocked" } : { state: "healthy", endpoints, trackers: [] },
        deleteWebhook: (input: unknown) => {
          endpoints = endpoints.filter((endpoint) => endpoint.id !== (input as { id: string }).id);
          return { ok: true, endpoint: first };
        },
      },
    },
  );
  expect(await slot.findByText(/saved webhook configuration is invalid/i)).toBeDefined();
  expect(slot.queryByRole("button", { name: "Add webhook" })).toBeNull();
  blocked = false;
  await slot.behavior.emitRealtime("webhooks:changed", {});
  await slot.findByText(first.id);
  const trigger = slot.getByRole("button", { name: `Delete All trackers webhook ${first.id}` });
  act(() => trigger.click());
  const dialog = slot.getByRole("dialog", { name: "Delete webhook?" });
  expect(dialog.textContent).toContain(first.id);
  expect(dialog.textContent).toContain("All trackers");
  const cancel = slot.getByRole("button", { name: "Cancel" });
  await waitFor(() => expect(document.activeElement).toBe(cancel));
  act(() => cancel.click());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  expect(slot.inspection.rpcCalls.some(({ method }) => method === "deleteWebhook")).toBe(false);
  act(() => trigger.click());
  act(() => slot.getByRole("button", { name: "Delete webhook" }).click());
  await waitFor(() => expect(slot.queryByText(first.id)).toBeNull());
  expect(slot.getByText(second.id)).toBeDefined();
  expect(slot.inspection.rpcCalls.filter(({ method }) => method === "deleteWebhook")).toEqual([
    expect.objectContaining({ input: { id: first.id } }),
  ]);
});

it("renames only the selected duplicate, preserving the draft on error and restoring focus", async () => {
  const section = app.settingsSections.find(({ id }) => id === "webhooks")!;
  const endpoints = ["a", "b"].map((letter) => ({
    id: `wh_${letter.repeat(32)}`,
    name: "Release alerts",
    scope: { kind: "global" },
    hasAuthorization: false,
  }));
  const [first, second] = endpoints;
  let save: (result: unknown) => void = () => {};
  const slot = renderSlot(
    section,
    {},
    {
      rpc: {
        listWebhooks: () => ({ state: "healthy", endpoints, trackers: [] }),
        renameWebhook: () =>
          new Promise((resolve) => {
            save = resolve;
          }),
      },
    },
  );
  await slot.findByText(second!.id);
  expect(slot.getAllByText("Release alerts")).toHaveLength(2);
  const trigger = slot.getByRole("button", { name: `Rename All trackers webhook ${second!.id}` });
  act(() => trigger.click());
  const dialog = within(slot.getByRole("dialog", { name: "Rename webhook" }));
  expect(dialog.getByText(second!.id)).toBeDefined();
  expect(dialog.queryByText(first!.id)).toBeNull();
  const field = dialog.getByRole<HTMLInputElement>("textbox", { name: /Name/ });
  expect(field.value).toBe("Release alerts");
  expect(dialog.getAllByRole("textbox")).toHaveLength(1);
  fireEvent.change(field, { target: { value: "Discard me" } });
  fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  expect(slot.inspection.rpcCalls.some(({ method }) => method === "renameWebhook")).toBe(false);

  act(() => trigger.click());
  const reopened = within(slot.getByRole("dialog", { name: "Rename webhook" }));
  const name = reopened.getByRole<HTMLInputElement>("textbox", { name: /Name/ });
  expect(name.value).toBe("Release alerts");
  fireEvent.change(name, { target: { value: "Release digest" } });
  fireEvent.click(reopened.getByRole("button", { name: "Save name" }));
  expect(reopened.getByRole("button", { name: "Saving…" })).toBeDefined();
  expect(slot.inspection.rpcCalls.filter(({ method }) => method === "renameWebhook")).toEqual([
    expect.objectContaining({ input: { id: second!.id, name: "Release digest" } }),
  ]);
  await act(async () => save({ ok: false, code: "storage_error" }));
  expect(reopened.getByRole("alert").textContent).toMatch(/Try again/);
  expect(name.value).toBe("Release digest");
  fireEvent.click(reopened.getByRole("button", { name: "Save name" }));
  second!.name = "Release digest";
  await act(async () => save({ ok: true, endpoint: second }));
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  expect(slot.getByText("Release alerts")).toBeDefined();
  expect(slot.getByText("Release digest")).toBeDefined();
  expect(slot.queryByRole("dialog")).toBeNull();
});
