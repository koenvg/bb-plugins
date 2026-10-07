// @vitest-environment jsdom
import { act, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { rpcInput } from "../test-fixtures.js";
import { browsePreference } from "./browse-preference.js";
import {
  acceptNavigation,
  activateActivity,
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
const ref = (task: (typeof tasks)[number]) => ({
  id: task.id,
  key: task.key,
  title: task.title,
  status: task.status,
});

describe("embedded detail actions and links", () => {
  it("selects visible subtasks and dependency links in place, but preserves off-list destinations and remembered scope", async () => {
    const child = { ...tasks[2]!, parentTaskId: tasks[0]!.id };
    const otherProject = {
      ...tasks[1]!,
      id: "outside",
      projectId: "another-project",
      key: "CS-1",
    };
    const parent = {
      ...tasks[0]!,
      blockedBy: [ref(tasks[1]!), ref(otherProject)],
    };
    const records = [parent, tasks[1]!, child, otherProject];
    const slot = setup(`${project.id}?view=list`, {
      listTasks: (raw) => ({
        tasks:
          rpcInput(raw).parentTaskId === parent.id
            ? [child]
            : rpcInput(raw).parentTaskId
              ? []
              : records.slice(0, 3),
        nextCursor: null,
      }),
      getTaskByKey: (raw) => ({
        task: records.find((t) => t.key === rpcInput(raw).taskKey),
      }),
      getTask: () => ({ task: parent }),
    });
    fireEvent.click(await slot.findByRole("button", { name: "Expand subtasks of TSK-1" }));
    await select(slot, 1);
    let detail = within(slot.getByRole("region", { name: "Selected ticket" }));
    fireEvent.click(await detail.findByRole("button", { name: /TSK-3.*Title 3/ }));
    await acceptNavigation(slot);
    expect(row(slot, 3).getAttribute("aria-current")).toBe("true");
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 3");
    detail = within(slot.getByRole("region", { name: "Selected ticket" }));
    fireEvent.click(await detail.findByRole("button", { name: /Sub-task of.*TSK-1/ }));
    await acceptNavigation(slot);
    fireEvent.click(detail.getByRole("button", { name: /TSK-2.*Title 2/ }));
    await acceptNavigation(slot);
    expect(row(slot, 2).getAttribute("aria-current")).toBe("true");
    await select(slot, 1);
    fireEvent.click(detail.getByRole("button", { name: /CS-1.*Title 2/ }));
    expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
      options: { subPath: "task/CS-1" },
    });
    await acceptNavigation(slot);
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 2");
    expect(slot.queryByRole("region", { name: "Ticket list" })).toBeNull();
    expect(browsePreference().load()).toEqual({
      kind: "project",
      projectId: project.id,
    });
  });

  it("opens a collapsed same-project subtask as standalone rather than inventing a visible row", async () => {
    const child = { ...tasks[2]!, parentTaskId: tasks[0]!.id };
    const slot = setup(`${project.id}?view=list&task=TSK-1`, {
      listTasks: (raw) => ({
        tasks:
          rpcInput(raw).parentTaskId === tasks[0]!.id
            ? [child]
            : rpcInput(raw).parentTaskId
              ? []
              : [tasks[0], tasks[1], child],
        nextCursor: null,
      }),
    });
    await slot.findByRole("textbox", { name: "Task title" });
    expect(slot.queryByRole("button", { name: "Open TSK-3: Title 3" })).toBeNull();
    const detail = within(slot.getByRole("region", { name: "Selected ticket" }));
    fireEvent.click(await detail.findByRole("button", { name: /TSK-3.*Title 3/ }));
    expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
      options: { subPath: "task/TSK-3" },
    });
    expect(browsePreference().load()).toEqual({
      kind: "project",
      projectId: project.id,
    });
  });

  it("gives existing property shortcuts to the focused pane only", async () => {
    const slot = setup("all?task=TSK-1");
    await slot.findByRole("textbox", { name: "Task title" });
    row(slot, 1).focus();
    fireEvent.keyDown(window, { key: "p" });
    expect(await slot.findAllByRole("menu")).toHaveLength(1);
    expect(
      slot.container.querySelector('[data-task-key="TSK-1"] [data-state="open"]'),
    ).toBeTruthy();
    fireEvent.keyDown(slot.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(slot.queryByRole("menu")).toBeNull());
    slot.getByRole("button", { name: "Open standalone ticket" }).focus();
    fireEvent.keyDown(window, { key: "p" });
    expect(await slot.findAllByRole("menu")).toHaveLength(1);
    expect(slot.container.querySelector('[data-task-key="TSK-1"] [data-state="open"]')).toBeNull();
  });
  it("keeps title, description, properties, subtasks, dependencies, linked threads and explicit delegation editable", async () => {
    let task = tasks[0]!;
    const child = { ...tasks[2]!, parentTaskId: task.id, title: "New child" };
    const writes: Record<string, unknown>[] = [];
    const slot = setup("all?task=TSK-1", {
      getTaskByKey: () => ({ task }),
      updateTask: (raw) => {
        const input = rpcInput(raw);
        writes.push(input);
        task = { ...task, ...input };
        return { ok: true, task };
      },
      createTask: () => ({ ok: true, task: child }),
      listPresets: () => ({
        presets: [{ id: "preset", name: "Astra", modelId: "model" }],
      }),
      delegate: () => ({ threadId: "thr_worker" }),
      listTaskThreads: () => ({
        taskThreads: [
          {
            id: "link",
            taskId: task.id,
            threadId: "thr_worker",
            title: "Worker",
            presetName: "Astra",
            liveStatus: "working",
            attachedAt: project.createdAt,
            updatedAt: project.createdAt,
          },
        ],
      }),
      addTaskDependency: () => ({ ok: true }),
    });
    const title = await slot.findByRole("textbox", { name: "Task title" });
    title.textContent = "Edited title";
    fireEvent.input(title);
    fireEvent.blur(title);
    await waitFor(() => expect(writes).toHaveLength(1));
    await edit(slot, "Edited description");
    const detail = within(slot.getByRole("region", { name: "Selected ticket" }));
    detail.getByRole("button", { name: "Open standalone ticket" }).focus();
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.click(await slot.findByRole("menuitem", { name: /High/ }));
    await waitFor(() => expect(writes.some((w) => w.priority === "high")).toBe(true));
    expect(writes.some((w) => w.description === "Edited description")).toBe(true);
    fireEvent.click(detail.getByRole("button", { name: "Add sub-task" }));
    fireEvent.change(slot.getByPlaceholderText("Sub-task of TSK-1…"), {
      target: { value: "New child" },
    });
    fireEvent.keyDown(slot.getByPlaceholderText("Sub-task of TSK-1…"), {
      key: "Enter",
    });
    await waitFor(() =>
      expect(
        slot.inspection.rpcCalls.some(
          (c) => c.method === "createTask" && rpcInput(c.input).parentTaskId === task.id,
        ),
      ).toBe(true),
    );
    expect(detail.getByRole("button", { name: "Add blocker" })).toBeTruthy();
    fireEvent.click(detail.getByRole("button", { name: "Add blocked task" }));
    fireEvent.click(await slot.findByRole("option", { name: /TSK-2.*Title 2/ }));
    await waitFor(() =>
      expect(
        slot.inspection.rpcCalls.some(
          (c) =>
            c.method === "addTaskDependency" &&
            rpcInput(c.input).blockerTaskId === task.id &&
            rpcInput(c.input).blockedTaskId === tasks[1]!.id,
        ),
      ).toBe(true),
    );
    expect(detail.getByRole("button", { name: "Add blocked task" })).toBeTruthy();
    await activateActivity(slot);
    expect(detail.getAllByRole("button", { name: "Attach file" })).toHaveLength(2);
    fireEvent.click(detail.getByRole("button", { name: "Open thread" }));
    expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
      method: "toThread",
      threadId: "thr_worker",
    });
    expect(slot.inspection.rpcCalls.some((c) => c.method === "delegate")).toBe(false);
    fireEvent.click(detail.getAllByRole("button", { name: "Astra" })[0]!);
    await waitFor(() =>
      expect(
        slot.inspection.rpcCalls.some(
          (c) => c.method === "delegate" && rpcInput(c.input).taskId === task.id,
        ),
      ).toBe(true),
    );
  });

  it("finishes an explicitly sent comment and failed file upload on A after selecting B", async () => {
    const sent = deferred<unknown>();
    const uploaded = deferred<Response>();
    const fetch = vi.fn((url: string) =>
      url.endsWith("/token")
        ? Promise.resolve(new Response(JSON.stringify({ token: "test" })))
        : uploaded.promise,
    );
    vi.stubGlobal("fetch", fetch);
    const slot = setup("all?task=TSK-1", { createComment: () => sent.promise });
    await slot.findByRole("textbox", { name: "Task title" });
    await edit(slot, "Send A", 1);
    fireEvent.change(slot.container.querySelectorAll('input[type="file"]')[1]!, {
      target: { files: [new File(["A"], "a.txt")] },
    });
    fireEvent.click(slot.getByRole("button", { name: "Comment" }));
    await select(slot, 2);
    await edit(slot, "Keep B", 1);
    await act(async () => sent.resolve({ comment: { id: "comment-A" } }));
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url.includes("commentId=comment-A"))).toBe(true),
    );
    await act(async () =>
      uploaded.resolve(new Response(JSON.stringify({ error: "Offline" }), { status: 500 })),
    );
    expect(slot.container.querySelectorAll(".tiptap")[1]?.textContent).toBe("Keep B");
    expect(slot.queryByText("a.txt")).toBeNull();
    await select(slot, 1);
    await activateActivity(slot);
    expect(slot.container.querySelectorAll(".tiptap")[1]?.textContent).toBe("");
    expect(slot.getByRole("button", { name: "Retry upload of a.txt" })).toBeTruthy();
    expect(slot.inspection.rpcCalls.filter((c) => c.method === "createComment")).toMatchObject([
      { input: { taskId: tasks[0]!.id, body: "Send A", notify: false } },
    ]);
  });
});
