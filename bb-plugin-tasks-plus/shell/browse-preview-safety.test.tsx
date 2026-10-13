// @vitest-environment jsdom
import { makeAttachment } from "../test-fixtures.js";
import { StrictMode } from "react";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { rpcInput } from "../test-fixtures.js";
import {
  acceptNavigation,
  Panel,
  deferred,
  edit,
  row,
  select,
  setup,
  tasks,
  useWorkspaceTestLifecycle,
} from "./browse-workspace.test-support.js";

useWorkspaceTestLifecycle();

describe("retained preview safety", () => {
  it("keeps local title and description edits over a newer background response", async () => {
    let refreshed = false;
    const slot = setup("all?task=TSK-1", {
      getTaskByKey: (raw) => ({
        task:
          rpcInput(raw).taskKey !== "TSK-1"
            ? tasks.find((task) => task.key === rpcInput(raw).taskKey)
            : refreshed
              ? {
                  ...tasks[0]!,
                  title: "Remote title",
                  description: "Remote description",
                  updatedAt: "2026-12-01T00:00:00Z",
                }
              : tasks[0],
      }),
      updateTask: () => ({ ok: false, error: { message: "Keep draft" } }),
    });
    const title = await slot.findByRole("textbox", { name: "Task title" });
    title.textContent = "Local title";
    fireEvent.input(title);
    await edit(slot, "Local description");
    refreshed = true;
    await slot.behavior.emitRealtime("tasks:changed", { taskId: tasks[0]!.id });
    await waitFor(() =>
      expect(
        slot.inspection.rpcCalls.filter(
          (c) => c.method === "getTaskByKey" && rpcInput(c.input).taskKey === "TSK-1",
        ),
      ).toHaveLength(2),
    );
    expect(slot.getByRole("textbox", { name: "Task title" })).toBe(title);
    expect(title.textContent).toBe("Local title");
    expect(slot.container.querySelector(".tiptap")?.textContent).toBe("Local description");
    expect(slot.inspection.navigateCalls).toEqual([]);
  });

  it("ignores an invalidated earlier B response after C is selected", async () => {
    const old = deferred<unknown>();
    let bReads = 0;
    const slot = setup("all", {
      getTaskByKey: (raw) => {
        const key = rpcInput(raw).taskKey;
        if (key === "TSK-2" && ++bReads === 1) return old.promise;
        return { task: tasks.find((task) => task.key === key) };
      },
    });
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    await select(slot, 1);
    fireEvent.click(row(slot, 2));
    await acceptNavigation(slot);
    await select(slot, 3);
    await slot.behavior.emitRealtime("tasks:changed", { taskId: tasks[1]!.id });
    await act(async () => old.resolve({ task: { ...tasks[1], description: "Obsolete B" } }));
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 3");
    expect(slot.container.textContent).not.toContain("Obsolete B");
    await select(slot, 2);
    expect(bReads).toBe(2);
    expect(slot.container.querySelector(".tiptap")?.textContent).toBe("Description 2");
  });

  it("labels a failed refresh as retained data and retries without clearing selection", async () => {
    let failure = false;
    const slot = setup("all?task=TSK-1", {
      getTaskByKey: () => {
        if (failure) throw new Error("Read offline");
        return { task: tasks[0] };
      },
    });
    const title = await slot.findByRole("textbox", { name: "Task title" });
    failure = true;
    await slot.behavior.emitRealtime("tasks:changed", {});
    expect((await slot.findByRole("alert")).textContent).toContain(
      "Showing previously loaded data",
    );
    expect(slot.getByRole("textbox", { name: "Task title" })).toBe(title);
    expect(slot.container.querySelector(".tiptap")?.textContent).toBe("Description 1");
    expect(slot.inspection.navigateCalls).toEqual([]);
    failure = false;
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(slot.queryByRole("alert")).toBeNull());
  });

  it("saves a warm origin without causing a nested route barrier, then reads its saved data on return", async () => {
    let current = tasks[0]!;
    const slot = setup("all", {
      getTaskByKey: (raw) => ({ task: rpcInput(raw).taskKey === current.key ? current : tasks[1] }),
      updateTask: (raw) => {
        current = { ...current, ...rpcInput(raw), updatedAt: "2026-12-01T00:00:00Z" };
        return { ok: true, task: current };
      },
    });
    await slot.findByRole("button", { name: "Open TSK-1: Title 1" });
    await select(slot, 1);
    await select(slot, 2);
    await select(slot, 1);
    await edit(slot, "Saved warm A");
    fireEvent.click(row(slot, 2));
    await waitFor(() =>
      expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
        options: { subPath: "all?task=TSK-2" },
      }),
    );
    await acceptNavigation(slot);
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 2");
    await select(slot, 1);
    expect(slot.container.querySelector(".tiptap")?.textContent).toBe("Saved warm A");
  });

  it("preserves saved descriptions and task files through A-B-A navigation", async () => {
    const records = tasks.map((task) => ({ ...task }));
    const file = makeAttachment(records[0]!.id);
    const writes: Record<string, unknown>[] = [];
    const slot = setup("all?task=TSK-1", {
      getTaskByKey: (raw) => ({ task: records.find((t) => t.key === rpcInput(raw).taskKey) }),
      listAttachments: (raw) => ({
        attachments: rpcInput(raw).taskId === file.taskId ? [file] : [],
      }),
      updateTask: (raw) => {
        const input = rpcInput(raw);
        writes.push(input);
        const task = records.find((t) => t.id === input.taskId)!;
        Object.assign(task, input);
        return { ok: true, task };
      },
    });
    await slot.findByRole("textbox", { name: "Task title" });
    const origin = slot.container.querySelector(".tiptap");
    await edit(slot, "Saved A");
    await select(slot, 2);
    expect(slot.queryByText("a.txt")).toBeNull();
    expect(slot.container.textContent).not.toContain("Saved A");
    await select(slot, 1);
    expect(slot.container.querySelector(".tiptap")).not.toBe(origin);
    expect(slot.container.querySelector(".tiptap")?.textContent).toBe("Saved A");
    expect(slot.getByText("a.txt")).toBeTruthy();
    expect(writes).toMatchObject([{ taskId: records[0]!.id, description: "Saved A" }]);
    expect(
      slot.inspection.rpcCalls.filter((c) => ["createComment", "delegate"].includes(c.method)),
    ).toEqual([]);
  });

  it("does not mistake a hidden mounted Ticket outlet for a visible one", async () => {
    const slot = setup("all?task=TSK-1");
    await slot.findByRole("textbox", { name: "Task title" });
    expect(slot.inspection.experimental_fixedTabOpenCalls).toHaveLength(0);
    const outlet = slot.getByRole("region", { name: "Selected ticket" }).parentElement!
      .parentElement!;
    outlet.style.display = "none";
    fireEvent.click(row(slot, 2));
    expect(slot.inspection.experimental_fixedTabOpenCalls).toHaveLength(1);
    outlet.style.display = "";
    await acceptNavigation(slot);
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 2");
  });
  it("survives React effect replay without disposing the live session", async () => {
    const slot = setup("all?task=TSK-1");
    await slot.findByRole("textbox", { name: "Task title" });
    slot.lifecycle.rerender(
      <StrictMode>
        <Panel subPath="all?task=TSK-1" />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 1"),
    );
    expect(slot.container.querySelector(".tiptap")?.textContent).toBe("Description 1");
  });
});
