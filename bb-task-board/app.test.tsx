// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Task } from "./server";

let unmount: (() => void) | undefined;
afterEach(() => { unmount?.(); unmount = undefined; });

const makeTask = (id: string, prompt: string, changes: Partial<Task> = {}): Task => ({
  id, projectId: "proj_one", prompt, priority: "normal", status: "backlog",
  focus: null, labels: [], dependsOn: [], threadId: null,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...changes,
});

async function board(tasks: Task[]) {
  const app = await loadPluginApp(() => import("./app"));
  const slot = renderSlot(app.navPanels[0]!, { subPath: "" }, {
    context: { projectId: "proj_one", threadId: null },
    rpc: {
      tasks_projects: () => ({ projects: [{ id: "proj_one", name: "One" }] }),
      tasks_list: ({ view, query = "", limit = 200, offset = 0 }: { view: string; query: string; limit: number; offset: number }) => {
        const filtered = tasks.filter((task) => {
          const inView = view === "focus" ? task.status === "doing" && task.focus === "focus" :
            view === "in-flight" ? task.status === "doing" :
            view === "out-of-focus" ? task.status === "doing" && task.focus === "out-of-focus" : task.status === view;
          return inView && task.prompt.toLowerCase().includes(query.toLowerCase());
        });
        return { tasks: filtered.slice(offset, offset + limit), total: filtered.length,
          counts: { focus: tasks.filter((task) => task.focus === "focus" && task.status === "doing").length,
            "in-flight": tasks.filter((task) => task.status === "doing").length,
            "out-of-focus": tasks.filter((task) => task.focus === "out-of-focus").length,
            backlog: tasks.filter((task) => task.status === "backlog").length,
            done: tasks.filter((task) => task.status === "done").length } };
      },
      tasks_get: ({ id }: { id: string }) => tasks.find((task) => task.id === id)!,
      tasks_create: (input: { prompt: string; priority?: Task["priority"] }) => {
        const task = makeTask("TASK-new", input.prompt, { priority: input.priority ?? "normal" });
        tasks.push(task);
        return task;
      },
      tasks_update: (input: Partial<Task> & { id: string; expectedUpdatedAt?: string }) => {
        const task = tasks.find((item) => item.id === input.id)!;
        if (input.expectedUpdatedAt && input.expectedUpdatedAt !== task.updatedAt) throw new Error("Task changed elsewhere");
        const { expectedUpdatedAt: _expected, ...patch } = input;
        Object.assign(task, patch, { updatedAt: "2026-01-01T00:00:02.000Z" });
        return task;
      },
      tasks_remove: ({ id }: { id: string }) => { tasks.splice(tasks.findIndex((item) => item.id === id), 1); return { removed: true }; },
    },
  });
  unmount = () => slot.lifecycle.unmount();
  return slot;
}

it("creates, displays and edits a project task from the sidebar", async () => {
  const tasks: Task[] = [];
  await board(tasks);
  await screen.findByText("No tasks here. Create one or choose another view.");
  fireEvent.click(screen.getByRole("button", { name: /New task/i }));
  fireEvent.change(screen.getByRole("textbox", { name: "Prompt" }), { target: { value: "Ship board" } });
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));
  await screen.findByText("Ship board");
  fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "doing" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(tasks[0]?.status).toBe("doing"));
  expect(tasks[0]?.focus).toBe("focus");
});

it("asks only for a prompt when creating a task", async () => {
  const tasks: Task[] = [];
  await board(tasks);
  await screen.findByText("No tasks here. Create one or choose another view.");
  fireEvent.click(screen.getByRole("button", { name: /New task/i }));
  expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
  expect(screen.queryByRole("combobox", { name: "Priority" })).toBeNull();
  const create = screen.getByRole("button", { name: "Create task" });
  expect(create).toHaveProperty("disabled", true);
  fireEvent.change(screen.getByRole("textbox", { name: "Prompt" }), { target: { value: "Write docs\n\nInclude examples" } });
  fireEvent.click(create);
  await waitFor(() => expect(tasks[0]).toMatchObject({ prompt: "Write docs\n\nInclude examples" }));
  expect(tasks[0]).not.toHaveProperty("title");
});

it("edits the prompt while keeping other task fields", async () => {
  const tasks = [makeTask("TASK-edit", "Old prompt", { status: "doing", focus: "focus", priority: "high" })];
  await board(tasks);
  await screen.findByText("Old prompt");
  fireEvent.click(screen.getByRole("button", { name: /Old prompt/i }));
  expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Prompt" }), { target: { value: "New prompt\n\nDetails" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(tasks[0]).toMatchObject({ prompt: "New prompt\n\nDetails", status: "doing", priority: "high" }));
  expect((await screen.findAllByText("New prompt Details")).length).toBeGreaterThan(0);
});

it("preserves comma-bearing labels when only the prompt changes", async () => {
  const tasks = [makeTask("TASK-labels", "Old prompt", { status: "doing", focus: "focus", labels: ["release, v2", "docs"] })];
  await board(tasks);
  await screen.findByText("Old prompt");
  fireEvent.click(screen.getByRole("button", { name: /Old prompt/i }));
  fireEvent.change(screen.getByRole("textbox", { name: "Prompt" }), { target: { value: "New prompt" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(tasks[0]?.prompt).toBe("New prompt"));
  expect(tasks[0]?.labels).toEqual(["release, v2", "docs"]);
});

it("shows a selectable full task ID for prerequisite links", async () => {
  const id = "TASK-12345678-aaaa-bbbb-cccc-123456789abc";
  await board([makeTask(id, "Prerequisite", { status: "doing", focus: "focus" })]);
  await screen.findByText("Prerequisite");
  fireEvent.click(screen.getByRole("button", { name: /Prerequisite/i }));
  expect(screen.getByText(id).className).toContain("select-all");
});

it("shows off-page Focus work and lets an editor remove an unloaded prerequisite", async () => {
  const tasks = [makeTask("TASK-prereq", "Prerequisite", { status: "done" }),
    ...Array.from({ length: 205 }, (_, index) => makeTask(`TASK-backlog-${index}`, `Backlog ${index}`)),
    makeTask("TASK-focus", "Old focus needle", { status: "doing", focus: "focus", dependsOn: ["TASK-prereq"] })];
  await board(tasks);
  await screen.findByText("Old focus needle");
  fireEvent.click(screen.getByRole("button", { name: /Old focus needle/i }));
  const remove = await screen.findByRole("button", { name: /Remove prerequisite TASK-prereq/i });
  fireEvent.click(remove);
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(tasks.at(-1)?.dependsOn).toEqual([]));
});

it("keeps a draft during realtime updates and refuses to overwrite a newer revision", async () => {
  const tasks = [makeTask("TASK-1", "Existing", { status: "doing", focus: "focus" })];
  const slot = await board(tasks);
  await screen.findByText("Existing");
  fireEvent.click(screen.getByRole("button", { name: /Existing/i }));
  fireEvent.change(screen.getByRole("textbox", { name: "Prompt" }), { target: { value: "My draft" } });
  tasks[0].prompt = "Changed elsewhere";
  tasks[0].updatedAt = "2026-01-01T00:00:01.000Z";
  await slot.behavior.emitRealtime("tasks-changed", { projectId: "proj_one" });
  await screen.findByText(/changed elsewhere\. reload/i);
  expect(screen.getByRole("textbox", { name: "Prompt" })).toHaveProperty("value", "My draft");
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("alert");
  expect(tasks[0]).toMatchObject({ prompt: "Changed elsewhere" });
  fireEvent.click(screen.getByRole("button", { name: "Reload details" }));
  expect(screen.getByRole("textbox", { name: "Prompt" })).toHaveProperty("value", "Changed elsewhere");
});
