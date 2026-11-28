// @vitest-environment jsdom
import { waitFor, within } from "@testing-library/react";
import { startTransition, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { TaskMutationResult } from "../../shared/contract.js";
import { useTasksRpc } from "../../shell/data.js";
import { makeTask } from "../../test-fixtures.js";
import { applyEdit } from "./optimistic.js";
import { useListTaskEdits } from "./use-task-edits.js";

vi.mock("../../shell/data.js", () => ({ useTasksRpc: vi.fn() }));

it("keeps a confirmed priority retired when a queued edit for another task replays", async () => {
  const first = makeTask({ id: "first", priority: "medium" });
  const second = makeTask({ id: "second", priority: "medium" });
  const confirmed = { ...first, priority: "high", title: "Confirmed task" } as const;
  const newer = { ...first, priority: "low", title: "Refreshed task" } as const;
  const firstSave = Promise.withResolvers<TaskMutationResult>();
  const secondSave = Promise.withResolvers<TaskMutationResult>();
  const rpc = {
    call: vi.fn((_method: string, input: { taskId: string }) =>
      input.taskId === first.id ? firstSave.promise : secondSave.promise,
    ),
  };
  vi.mocked(useTasksRpc).mockReturnValue(rpc as ReturnType<typeof useTasksRpc>);

  const List = () => {
    const [tasks, setTasks] = useState([first, second]);
    const { entries, pending, edit } = useListTaskEdits(tasks, () => {});
    return (
      <>
        <button onClick={() => edit(first, { priority: "high" })}>Edit first</button>
        <button onClick={() => startTransition(() => edit(second, { priority: "high" }))}>
          Edit second
        </button>
        <button onClick={() => void Promise.resolve().then(() => setTasks([confirmed, second]))}>
          Confirm first
        </button>
        <button onClick={() => void Promise.resolve().then(() => setTasks([newer, second]))}>
          Refresh
        </button>
        {tasks.map((task) => (
          <output key={task.id} aria-label={task.id} aria-busy={pending.has(task.id)}>
            {task.title}: {applyEdit(task, entries.get(task.id)?.edit).priority}
          </output>
        ))}
      </>
    );
  };

  const container = document.createElement("div");
  const root = createRoot(container);
  document.body.append(container);
  const screen = within(container);
  const click = (name: string) => screen.getByRole("button", { name }).click();
  const row = (name: string) => screen.getByRole("status", { name });
  try {
    flushSync(() => root.render(<List />));
    flushSync(() => click("Edit first"));
    click("Edit second");
    click("Confirm first");
    await waitFor(() => {
      expect(row("first").textContent).toBe("Confirmed task: high");
      expect(row("second").getAttribute("aria-busy")).toBe("true");
    });

    firstSave.resolve({ ok: true, task: confirmed });
    secondSave.resolve({ ok: true, task: { ...second, priority: "high" } });
    await waitFor(() => {
      expect(row("first").getAttribute("aria-busy")).toBe("false");
      expect(row("second").getAttribute("aria-busy")).toBe("false");
    });
    click("Refresh");
    await waitFor(() => expect(row("first").textContent).toBe("Refreshed task: low"));
  } finally {
    root.unmount();
    container.remove();
  }
});
