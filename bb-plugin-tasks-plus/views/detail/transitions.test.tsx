// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeTask, rpcInput } from "../../test-fixtures.js";
import type { Task } from "../../shared/contract.js";

const app = await loadPluginApp(() => import("../../app"));
const Panel = app.navPanels[0]!.component;
afterEach(cleanup);
const tasks = [1, 2, 3].map((n) =>
  makeTask({
    id: `01HZZZZZZZZZZZZZZZZZZZZZT${n}`,
    key: `TSK-${n}`,
    number: n,
    title: `Title ${n}`,
    description: `Description ${n}`,
  }),
);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(overrides: Record<string, (raw: unknown) => unknown> = {}) {
  return renderSlot(
    app.navPanels[0]!,
    { subPath: "task/TSK-1" },
    {
      rpc: {
        listProjects: () => ({ projects: [] }),
        listFolders: () => ({ folders: [] }),
        listPresets: () => ({ presets: [] }),
        listLabels: () => ({ labels: [] }),
        listTasks: (raw) => ({
          tasks: rpcInput(raw).parentTaskId ? [] : tasks,
          nextCursor: null,
        }),
        getTaskByKey: (raw) => ({
          task: tasks.find((t) => t.key === rpcInput(raw).taskKey),
        }),
        getTask: () => ({ task: null }),
        listAttachments: () => ({ attachments: [] }),
        listTaskThreads: () => ({ taskThreads: [] }),
        getTaskActivity: () => ({ entries: [] }),
        listTaskPullRequests: () => ({
          pullRequests: [],
          unavailableThreadIds: [],
        }),
        ...overrides,
      },
    },
  );
}
async function changeDescription(slot: ReturnType<typeof setup>, text: string) {
  await act(async () => {
    const editor = slot.container.querySelector<HTMLElement>(".tiptap")!;
    editor.innerHTML = `<p>${text}</p>`;
    fireEvent.input(editor);
  });
}

describe("safe standalone detail navigation", () => {
  it("flushes debounced description before pager navigation, retains failure and retries the latest draft", async () => {
    const reply = deferred<unknown>();
    let attempt = 0;
    const writes: Record<string, unknown>[] = [];
    const slot = setup({
      updateTask: (raw) => {
        writes.push(rpcInput(raw));
        return attempt++ === 0 ? reply.promise : { ok: true, task: tasks[0] };
      },
    });
    await slot.findByRole("textbox", { name: "Task title" });
    await slot.findByText("1 / 3");
    await changeDescription(slot, "Draft A");
    fireEvent.keyDown(window, { key: "]" });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(slot.inspection.navigateCalls).toEqual([]);
    await changeDescription(slot, "Latest A");
    await act(async () => reply.resolve({ ok: false, error: { message: "Cannot save" } }));
    expect((await slot.findByRole("alert")).textContent).toContain("Cannot save");
    expect(slot.inspection.navigateCalls).toEqual([]);
    expect(slot.container.querySelector(".tiptap")?.textContent).toContain("Latest A");
    fireEvent.click(slot.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(slot.inspection.navigateCalls).toHaveLength(1));
    expect(writes[1]).toMatchObject({
      taskId: tasks[0]!.id,
      description: "Latest A",
    });
  });

  it("keeps a newer realtime snapshot when an older save response arrives later", async () => {
    const reply = deferred<unknown>();
    const saved = {
      ...tasks[0]!,
      title: "My title",
      updatedAt: "2026-10-02T12:00:00.000Z",
    };
    let current = tasks[0]!;
    const slot = setup({
      getTaskByKey: () => ({ task: current }),
      updateTask: () => reply.promise,
    });
    const title = await slot.findByRole("textbox", { name: "Task title" });
    title.textContent = "My title";
    fireEvent.input(title);
    fireEvent.blur(title);
    current = {
      ...saved,
      description: "Newer server content",
      updatedAt: "2026-10-02T12:00:01.000Z",
    };
    await slot.behavior.emitRealtime("tasks:changed", {});
    await waitFor(() =>
      expect(slot.container.querySelector(".tiptap")?.textContent).toBe("Newer server content"),
    );
    await act(async () => reply.resolve({ ok: true, task: saved }));
    expect(slot.container.querySelector(".tiptap")?.textContent).toBe("Newer server content");
  });
  it("waits for a property write, then accepts later server edits rather than freezing the local value", async () => {
    const reply = deferred<unknown>();
    let current = tasks[0]!;
    const slot = setup({
      getTaskByKey: () => ({ task: current }),
      updateTask: () => reply.promise,
    });
    await slot.findByRole("textbox", { name: "Task title" });
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.click(await slot.findByRole("menuitem", { name: /High/ }));
    fireEvent.keyDown(window, { key: "]" });
    expect(slot.inspection.navigateCalls).toEqual([]);
    current = {
      ...current,
      priority: "high",
      updatedAt: "2026-10-02T12:00:00.000Z",
    };
    await act(async () => reply.resolve({ ok: true, task: current }));
    await waitFor(() => expect(slot.inspection.navigateCalls).toHaveLength(1));
    // The fake host records navigation without changing props, so the editor stays mounted.
    current = {
      ...current,
      priority: "urgent",
      updatedAt: "2026-10-02T12:00:01.000Z",
    };
    await slot.behavior.emitRealtime("tasks:changed", {});
    await waitFor(() =>
      expect(slot.getAllByRole("button", { name: /Urgent/ }).length).toBeGreaterThan(0),
    );
  });
  it("retains unsent comment text and files through actual shell A-B-A navigation", async () => {
    const slot = setup();
    await slot.findByRole("textbox", { name: "Task title" });
    await act(async () => {
      const comment = slot.container.querySelectorAll<HTMLElement>(".tiptap")[1]!;
      comment.innerHTML = "<p>Unsent A</p>";
      fireEvent.input(comment);
    });
    fireEvent.change(slot.container.querySelectorAll('input[type="file"]')[1]!, {
      target: { files: [new File(["A"], "a.txt")] },
    });
    slot.lifecycle.rerender(<Panel subPath="task/TSK-2" />);
    await waitFor(() =>
      expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 2"),
    );
    expect(slot.queryByText("a.txt")).toBeNull();
    expect(slot.container.textContent).not.toContain("Unsent A");
    slot.lifecycle.rerender(<Panel subPath="task/TSK-1" />);
    await waitFor(() =>
      expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 1"),
    );
    expect(slot.getByText("a.txt")).toBeTruthy();
    expect(slot.container.querySelectorAll(".tiptap")[1]?.textContent).toContain("Unsent A");
    expect(
      slot.inspection.rpcCalls.filter((call) =>
        ["createComment", "updateTask", "delegate"].includes(call.method),
      ),
    ).toEqual([]);
  });
  it("captures an unblurred title and holds external route changes until confirmation", async () => {
    const reply = deferred<unknown>();
    const writes: Record<string, unknown>[] = [];
    const slot = setup({
      updateTask: (raw) => {
        writes.push(rpcInput(raw));
        return reply.promise;
      },
    });
    const title = await slot.findByRole("textbox", { name: "Task title" });
    title.textContent = "Unblurred title";
    fireEvent.input(title);
    slot.lifecycle.rerender(<Panel subPath="task/TSK-2" />);
    slot.lifecycle.rerender(<Panel subPath="task/TSK-3" />);
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toContain(
      "Unblurred title",
    );
    expect(writes[0]).toMatchObject({
      taskId: tasks[0]!.id,
      title: "Unblurred title",
    });
    await act(async () => reply.resolve({ ok: true, task: tasks[0] }));
    await waitFor(() =>
      expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toContain("Title 3"),
    );
    expect(
      slot.inspection.rpcCalls.some(
        (call) => call.method === "getTaskByKey" && rpcInput(call.input).taskKey === "TSK-2",
      ),
    ).toBe(false);
  });

  it("shows a retryable lookup error for B without reusing A content", async () => {
    let fail = true;
    const slot = setup({
      getTaskByKey: (raw) => {
        if (rpcInput(raw).taskKey === "TSK-1") return { task: tasks[0] };
        if (fail) throw new Error("B unavailable");
        return { task: tasks[1] };
      },
    });
    await slot.findByRole("textbox", { name: "Task title" });
    slot.lifecycle.rerender(<Panel subPath="task/TSK-2" />);
    await slot.findByText("B unavailable");
    expect(slot.queryByRole("textbox", { name: "Task title" })).toBeNull();
    expect(slot.container.textContent).not.toContain("Description 1");
    fail = false;
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe("Title 2"),
    );
  });
  it("never renders late A data or A's local subtask form under B", async () => {
    const late = deferred<{ task: Task }>();
    let first = true;
    const slot = setup({
      getTaskByKey: (raw) => {
        if (rpcInput(raw).taskKey === "TSK-1") {
          if (first) {
            first = false;
            return { task: tasks[0] };
          }
          return late.promise;
        }
        return { task: tasks[1] };
      },
    });
    await slot.findByRole("textbox", { name: "Task title" });
    fireEvent.click(slot.getByRole("button", { name: "Add sub-task" }));
    fireEvent.change(slot.getByPlaceholderText("Sub-task of TSK-1…"), {
      target: { value: "Only A" },
    });
    await slot.behavior.emitRealtime("tasks:changed", {});
    slot.lifecycle.rerender(<Panel subPath="task/TSK-2" />);
    await waitFor(() =>
      expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toContain("Title 2"),
    );
    expect(slot.queryByDisplayValue("Only A")).toBeNull();
    await act(async () => late.resolve({ task: tasks[0]! }));
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toContain("Title 2");
  });
});
