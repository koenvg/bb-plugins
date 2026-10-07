// @vitest-environment jsdom
import { act, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { rpcInput } from "../test-fixtures.js";
import {
  acceptNavigation,
  activateActivity,
  deferred,
  edit,
  row,
  select,
  setup,
  tasks,
  useWorkspaceTestLifecycle,
} from "./browse-workspace.test-support.js";

useWorkspaceTestLifecycle();
const lookups = (slot: ReturnType<typeof setup>, key: string) =>
  slot.inspection.rpcCalls.filter(
    (c) => c.method === "getTaskByKey" && rpcInput(c.input).taskKey === key,
  );

describe("retained browse detail", () => {
  it("returns A-to-B-to-A without an empty matching detail commit or duplicate lookup", async () => {
    const slot = setup();
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    await select(slot, 1);
    await edit(slot, "Draft A", 1);
    await select(slot, 2);
    await edit(slot, "Draft B", 1);
    const blanks: string[] = [];
    const observer = new MutationObserver(() => {
      const title = slot.container.querySelector('[aria-label="Task title"]');
      const detail = slot.container.querySelector('[data-detail-key="TSK-1"]');
      if (title?.textContent === "Title 1" && !detail?.textContent?.includes("Description 1"))
        blanks.push("A");
    });
    observer.observe(slot.container, { childList: true, subtree: true });
    fireEvent.click(row(slot, 1));
    await acceptNavigation(slot);
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 1");
    expect(slot.container.querySelector('[data-detail-key="TSK-1"]')?.textContent).toContain(
      "Description 1",
    );
    await activateActivity(slot);
    expect(slot.container.textContent).toContain("Draft A");
    expect(slot.container.textContent).not.toContain("Draft B");
    observer.disconnect();
    expect(blanks).toEqual([]);
    expect(lookups(slot, "TSK-1")).toHaveLength(1);
    expect(slot.inspection.experimental_fixedTabOpenCalls).toHaveLength(0);
  });

  it("does not bypass a failed save when the destination is retained", async () => {
    const slot = setup("all", { updateTask: () => ({ ok: false, error: { message: "Offline" } }) });
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    await select(slot, 2);
    await select(slot, 1);
    await edit(slot, "Unsent A");
    const before = slot.inspection.navigateCalls.length;
    fireEvent.click(row(slot, 2));
    await slot.findByRole("alert");
    expect(slot.inspection.navigateCalls).toHaveLength(before);
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 1");
    expect(slot.container.textContent).toContain("Unsent A");
  });

  it("shows cold identity, loading and retry without another task's content", async () => {
    const pending = deferred<unknown>();
    let failure = true;
    const slot = setup("all", {
      getTaskByKey: async (raw) => {
        if (rpcInput(raw).taskKey === "TSK-2") {
          await pending.promise;
          if (failure) throw new Error("Lookup offline");
        }
        return { task: tasks.find((t) => t.key === rpcInput(raw).taskKey) };
      },
    });
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    await select(slot, 1);
    fireEvent.click(row(slot, 2));
    await acceptNavigation(slot);
    expect(slot.queryByRole("textbox", { name: "Task title" })).toBeNull();
    expect(slot.getByText("Loading TSK-2…")).toBeTruthy();
    await act(async () => pending.resolve({}));
    await slot.findByText("Lookup offline");
    failure = false;
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    expect((await slot.findByRole("textbox", { name: "Task title" })).textContent).toBe("Title 2");
  });

  it("revalidates retained data on manual refresh and reconnect, sharing inventories", async () => {
    const slot = setup();
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    await select(slot, 1);
    await select(slot, 2);
    await select(slot, 1);
    expect(
      slot.inspection.rpcCalls.filter((c) => c.method === "listLabels").map((c) => c.input),
    ).toEqual([{ projectId: tasks[0]!.projectId }]);
    for (const method of ["listProjects", "listPresets", "listLabels"]) {
      expect(
        slot.inspection.rpcCalls.filter((c) => c.method === method).map((c) => c.input),
        method,
      ).toHaveLength(1);
    }
    for (const method of ["listTaskThreads", "listTaskPullRequests"]) {
      expect(slot.inspection.rpcCalls.filter((c) => c.method === method)).toHaveLength(3);
    }
    fireEvent.click(slot.getByRole("button", { name: "Refresh tasks" }));
    await waitFor(() => expect(lookups(slot, "TSK-1")).toHaveLength(2));
    await waitFor(() =>
      expect(slot.getByRole("button", { name: "Refresh tasks" }).hasAttribute("disabled")).toBe(
        false,
      ),
    );
    await slot.behavior.setRealtimeConnectionState("reconnecting");
    await slot.behavior.setRealtimeConnectionState("connected");
    await waitFor(() => expect(lookups(slot, "TSK-1")).toHaveLength(3));
    // Each generation also reloads adjacent B before its next selection.
    await select(slot, 2);
    expect(lookups(slot, "TSK-2")).toHaveLength(3);
  });
});
