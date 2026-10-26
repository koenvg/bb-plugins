// @vitest-environment jsdom

import { act, cleanup, waitFor } from "@testing-library/react";
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
