// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Task } from "../../shared/contract.js";
import { makeTask } from "../../test-fixtures.js";

const app = await loadPluginApp(() => import("../../app"));

afterEach(cleanup);

const PROJECT_ID = "01HZZZZZZZZZZZZZZZZZZZZZP1";

const reviewTask = makeTask({
  id: "01HZZZZZZZZZZZZZZZZZZZZZT1",
  projectId: PROJECT_ID,
  number: 12,
  key: "ABC-12",
  title: "Show the task chip",
  status: "in_review",
});

const laterTask = makeTask({
  id: "01HZZZZZZZZZZZZZZZZZZZZZT2",
  projectId: PROJECT_ID,
  number: 15,
  key: "ABC-15",
  title: "Linked later",
  status: "todo",
});

function headerProps(isCompactViewport = false) {
  return { threadId: "thr_header", projectId: "prj_1", isCompactViewport };
}

function renderHeader(
  getTasks: () => Task[],
  {
    isCompactViewport = false,
    openThreadPanel = () => true,
  }: { isCompactViewport?: boolean; openThreadPanel?: () => boolean } = {},
) {
  return renderSlot(
    app.threadHeaderActions[0]!,
    headerProps(isCompactViewport),
    {
      rpc: { getTasksForThread: () => ({ tasks: getTasks() }) },
      openThreadPanel,
    },
  );
}

describe("Thread header task chip", () => {
  it("shows the status icon, key and status label of the linked task", async () => {
    const slot = renderHeader(() => [reviewTask]);

    const chip = await slot.findByRole("button", {
      name: "ABC-12 In Review, open task",
    });
    expect(chip.querySelector("svg")).not.toBeNull();
    expect(chip.textContent).toContain("ABC-12");
    expect(chip.textContent).toContain("In Review");
    expect(slot.inspection.rpcCalls).toContainEqual(
      expect.objectContaining({
        method: "getTasksForThread",
        input: { threadId: "thr_header" },
      }),
    );
  });

  it("shows the earliest linked task and a count of the others", async () => {
    const slot = renderHeader(() => [reviewTask, laterTask]);

    const chip = await slot.findByRole("button", { name: /ABC-12/ });
    expect(chip.textContent).toContain("+1");
    expect(chip.textContent).not.toContain("ABC-15");
  });

  it("renders nothing when no task is linked", async () => {
    const slot = renderHeader(() => []);

    await waitFor(() =>
      expect(
        slot.inspection.rpcCalls.some(
          ({ method }) => method === "getTasksForThread",
        ),
      ).toBe(true),
    );
    expect(slot.container.textContent).toBe("");
    expect(slot.queryByRole("button")).toBeNull();
  });

  it("opens the shown task in the side panel without writing", async () => {
    const openThreadPanel = vi.fn(() => true);
    const slot = renderHeader(() => [reviewTask, laterTask], {
      openThreadPanel,
    });

    fireEvent.click(await slot.findByRole("button", { name: /ABC-12/ }));
    expect(openThreadPanel).toHaveBeenCalledWith({
      actionId: "task",
      title: "ABC-12",
      params: { taskKey: "ABC-12" },
    });
    expect(
      slot.inspection.rpcCalls.map(({ method }) => method),
    ).toEqual(["getTasksForThread"]);
  });

  it("updates the status when the task changes", async () => {
    let tasks = [reviewTask];
    const slot = renderHeader(() => tasks);
    await slot.findByRole("button", { name: /In Review/ });

    tasks = [{ ...reviewTask, status: "done" }];
    await slot.behavior.emitRealtime("tasks:changed", {
      taskId: reviewTask.id,
      projectId: PROJECT_ID,
    });

    expect(
      await slot.findByRole("button", { name: "ABC-12 Done, open task" }),
    ).toBeDefined();
  });

  it("keeps the chip when a refresh fails", async () => {
    let fail = false;
    const slot = renderHeader(() => {
      if (fail) throw new Error("offline");
      return [reviewTask];
    });
    await slot.findByRole("button", { name: /ABC-12/ });

    fail = true;
    await slot.behavior.emitRealtime("tasks:changed", {
      taskId: reviewTask.id,
      projectId: PROJECT_ID,
    });

    await waitFor(() => expect(slot.inspection.rpcCalls).toHaveLength(2));
    expect(slot.getByRole("button", { name: /ABC-12/ })).toBeDefined();
  });

  it("appears when a task is linked to the open thread", async () => {
    let tasks: Task[] = [];
    const slot = renderHeader(() => tasks);
    await waitFor(() => expect(slot.inspection.rpcCalls).toHaveLength(1));
    expect(slot.queryByRole("button")).toBeNull();

    tasks = [reviewTask];
    await slot.behavior.emitRealtime("threads:changed", {
      taskId: reviewTask.id,
    });

    expect(
      await slot.findByRole("button", { name: /ABC-12/ }),
    ).toBeDefined();
  });

  it("hides the status label on a compact viewport but keeps it in the name", async () => {
    const slot = renderHeader(() => [reviewTask], { isCompactViewport: true });

    const chip = await slot.findByRole("button", {
      name: "ABC-12 In Review, open task",
    });
    expect(chip.textContent).toContain("ABC-12");
    expect(chip.textContent).not.toContain("In Review");
  });
});
