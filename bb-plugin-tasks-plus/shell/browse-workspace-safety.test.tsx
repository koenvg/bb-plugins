// @vitest-environment jsdom
import { act, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { rpcInput } from "../test-fixtures.js";
import { browsePreference } from "./browse-preference.js";
import {
  Panel,
  acceptNavigation,
  deferred,
  edit,
  project,
  row,
  select,
  setup,
  tasks,
  useWorkspaceTestLifecycle,
} from "./browse-workspace.test-support.js";

useWorkspaceTestLifecycle();

describe("browse save and task ownership", () => {
  it("keeps identity, drafts and URL on failure, then retries only the latest click", async () => {
    const first = deferred<unknown>();
    const writes: Record<string, unknown>[] = [];
    const slot = setup(`${project.id}?view=list&task=TSK-1`, {
      updateTask: (raw) => {
        writes.push(rpcInput(raw));
        return writes.length === 1 ? first.promise : { ok: true, task: tasks[0] };
      },
    });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Draft for A");
    fireEvent.click(row(slot, 2));
    fireEvent.click(row(slot, 3));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
    expect(row(slot, 3).getAttribute("aria-current")).toBeNull();
    await act(async () => first.resolve({ ok: false, error: { message: "Save refused" } }));
    expect((await slot.findByRole("alert")).textContent).toContain("Save refused");
    await edit(slot, "Newer draft for A");
    expect(slot.container.querySelector(".tiptap")?.textContent).toBe("Newer draft for A");
    fireEvent.click(slot.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(slot.inspection.navigateCalls).toHaveLength(1));
    expect(writes[1]).toMatchObject({
      taskId: tasks[0]!.id,
      description: "Newer draft for A",
    });
    await acceptNavigation(slot);
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 3");
    expect(row(slot, 3).getAttribute("aria-current")).toBe("true");
  });

  it("guards an incoming browse route and its project scope while an unblurred title is pending", async () => {
    const saved = deferred<unknown>();
    const slot = setup(`${project.id}?view=list&task=TSK-1`, {
      updateTask: () => saved.promise,
    });
    const title = await slot.findByRole("textbox", { name: "Task title" });
    title.textContent = "Unblurred A";
    fireEvent.input(title);
    slot.lifecycle.rerender(<Panel subPath="all?task=TSK-2" />);
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
    expect(browsePreference().load()).toEqual({
      kind: "project",
      projectId: project.id,
    });
    await act(async () => saved.resolve({ ok: true, task: { ...tasks[0], title: "Unblurred A" } }));
    await waitFor(() =>
      expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 2"),
    );
    expect(browsePreference().load()).toEqual({ kind: "all" });
  });

  it("keeps unsent text, files and notification preference with A through A-B-A clicks", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const slot = setup("all?task=TSK-1", {
      listComments: () => ({
        comments: [
          {
            id: "reply",
            taskId: tasks[0]!.id,
            kind: "agent",
            authorName: "Agent",
            presetName: null,
            threadId: "thr_agent",
            threadTitle: "Agent thread",
            body: "Existing reply",
            notifiedCount: 0,
            createdAt: project.createdAt,
            provider: null,
          },
        ],
      }),
    });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Unsent A", 1);
    fireEvent.click(await slot.findByRole("switch", { name: "Notify Agent thread" }));
    fireEvent.change(slot.container.querySelectorAll('input[type="file"]')[1]!, {
      target: { files: [new File(["A"], "a.txt")] },
    });
    await select(slot, 2);
    expect(slot.queryByText("a.txt")).toBeNull();
    expect(slot.container.textContent).not.toContain("Unsent A");
    await select(slot, 1);
    expect(slot.getByText("a.txt")).toBeTruthy();
    expect(slot.container.querySelectorAll('.tiptap[contenteditable="true"]')[1]?.textContent).toBe(
      "Unsent A",
    );
    expect(
      slot.getByRole("switch", { name: "Notify Agent thread" }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      slot.inspection.rpcCalls.filter((call) =>
        ["createComment", "updateTask", "delegate"].includes(call.method),
      ),
    ).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("selected detail lookup isolation", () => {
  it("keeps the list usable through loading, errors and retry without old content", async () => {
    let fail = true;
    const pending = deferred<unknown>();
    let tries = 0;
    const slot = setup("all?task=TSK-1", {
      getTaskByKey: (raw) => {
        if (rpcInput(raw).taskKey === "TSK-1") return { task: tasks[0] };
        if (tries++ === 0) return pending.promise;
        if (fail) throw new Error("Lookup unavailable");
        return { task: tasks[1] };
      },
    });
    await slot.findByRole("textbox", { name: "Task title" });
    fireEvent.click(row(slot, 2));
    await acceptNavigation(slot);
    expect(row(slot, 2).getAttribute("aria-current")).toBe("true");
    expect(slot.queryByRole("textbox", { name: "Task title" })).toBeNull();
    expect(slot.container.textContent).not.toContain("Description 1");
    await act(async () => pending.resolve(Promise.reject(new Error("Lookup unavailable"))));
    await slot.findByText("Lookup unavailable");
    expect(row(slot, 1)).toBeTruthy();
    fail = false;
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    expect((await slot.findByRole("textbox", { name: "Task title" })).textContent).toBe("Title 2");
  });

  it("ignores late A responses after B loads", async () => {
    const late = deferred<unknown>();
    const slot = setup("all?task=TSK-1", {
      getTaskByKey: (raw) =>
        rpcInput(raw).taskKey === "TSK-1" ? late.promise : { task: tasks[1] },
    });
    await slot.findByRole("button", { name: "Open TSK-2: Title 2" });
    await select(slot, 2);
    await act(async () => late.resolve({ task: tasks[0] }));
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 2");
    expect(slot.container.textContent).not.toContain("Description 1");
  });

  it("validates URL selection only after the list settles and clears a hidden key", async () => {
    const loaded = deferred<unknown>();
    const slot = setup(`${project.id}?view=list&task=TSK-99`, {
      listTasks: () => loaded.promise,
    });
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(slot.inspection.rpcCalls.some((c) => c.method === "getTaskByKey")).toBe(false);
    await act(async () => loaded.resolve({ tasks, nextCursor: null }));
    await waitFor(() => expect(slot.inspection.navigateCalls).toHaveLength(1));
    expect(slot.inspection.navigateCalls[0]).toMatchObject({
      options: { subPath: `${project.id}?view=list`, replace: true },
    });
    await acceptNavigation(slot);
    expect(slot.getByText("Select a ticket to view and edit")).toBeTruthy();
  });

  it("clears a confirmed absent task but leaves its list usable", async () => {
    const slot = setup("all?task=TSK-1", {
      getTaskByKey: () => ({ task: null }),
    });
    await slot.findByRole("button", { name: "Open TSK-2: Title 2" });
    await waitFor(() => expect(slot.inspection.navigateCalls).toHaveLength(1));
    await acceptNavigation(slot);
    expect(slot.getByText("Select a ticket to view and edit")).toBeTruthy();
    expect(row(slot, 1).getAttribute("aria-current")).toBeNull();
  });
  it("retains the originating draft when confirmed absence arrives during a failed save", async () => {
    let missing = false;
    let canSave = false;
    const slot = setup("all?task=TSK-1", {
      getTaskByKey: () => ({ task: missing ? null : tasks[0] }),
      updateTask: () =>
        canSave
          ? { ok: true, task: tasks[0] }
          : { ok: false, error: { message: "Retain this draft" } },
    });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Draft before disappearance");
    missing = true;
    await slot.behavior.emitRealtime("tasks:changed", {});
    expect((await slot.findByRole("alert")).textContent).toContain("Retain this draft");
    expect(slot.container.querySelector(".tiptap")?.textContent).toBe("Draft before disappearance");
    expect(row(slot, 1).getAttribute("aria-current")).toBe("true");
    expect(slot.inspection.navigateCalls).toEqual([]);
    canSave = true;
    fireEvent.click(slot.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(slot.inspection.navigateCalls).toHaveLength(1));
    await acceptNavigation(slot);
    expect(slot.getByText("Select a ticket to view and edit")).toBeTruthy();
  });
});
