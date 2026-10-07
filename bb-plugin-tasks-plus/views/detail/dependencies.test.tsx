// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Task } from "../../shared/contract.js";
import { makeTask, rpcInput } from "../../test-fixtures.js";

window.matchMedia ??= (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});
window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};

const app = await loadPluginApp(() => import("../../app"));

afterEach(cleanup);

const PROJECT_ID = "01HZZZZZZZZZZZZZZZZZZZZZP1";

function baseTask(number: number): Task {
  return makeTask({
    id: `01HZZZZZZZZZZZZZZZZZZZZZT${number}`,
    projectId: PROJECT_ID,
    number,
    key: `ABC-${number}`,
    title: `Task ${number}`,
    position: number,
  });
}

function renderDetail(
  initialLinks: Array<[number, number]> = [],
  options: {
    cycleOn?: [number, number];
    extraTasks?: Task[];
    catalog?: (input: Record<string, unknown>) => unknown;
  } = {},
) {
  const base = [...[3, 4, 5].map(baseTask), ...(options.extraTasks ?? [])];
  const links = initialLinks.map(([a, b]) => [
    base.find((t) => t.number === a)!.id,
    base.find((t) => t.number === b)!.id,
  ]);
  const refOf = (id: string) => {
    const t = base.find((entry) => entry.id === id)!;
    return { id: t.id, key: t.key, title: t.title, status: t.status };
  };
  const withLinks = (t: Task): Task => {
    const blockedBy = links.filter(([, b]) => b === t.id).map(([a]) => refOf(a!));
    const blocks = links.filter(([a]) => a === t.id).map(([, b]) => refOf(b!));
    return {
      ...t,
      blockedBy,
      blocks,
      openBlockerCount: blockedBy.length,
      openBlockedCount: blocks.length,
      blocked: blockedBy.length > 0,
    };
  };
  const cycle = options.cycleOn?.map((n) => base.find((t) => t.number === n)!.id);
  return renderSlot(
    app.navPanels[0]!,
    { subPath: "task/ABC-5" },
    {
      rpc: {
        listProjects: () => ({
          projects: [
            {
              id: PROJECT_ID,
              name: "ABC project",
              prefix: "ABC",
              nextTaskNumber: 6,
              color: "blue",
              folderId: null,
              linkedBbProjectId: null,
              createdAt: "2026-07-15T00:00:00.000Z",
            },
          ],
        }),
        listFolders: () => ({ folders: [] }),
        listPresets: () => ({ presets: [] }),
        sidebarSummary: () => ({ projects: [] }),
        getTaskByKey: (raw) => ({
          task: withLinks(base.find((task) => task.key === rpcInput(raw).taskKey)!),
        }),
        listTasks: (raw) => {
          const input = rpcInput(raw);
          if (input.parentTaskId) return { tasks: [], nextCursor: null };
          if (isCatalogRead(input) && options.catalog) return options.catalog(input);
          return { tasks: base.map(withLinks), nextCursor: null };
        },
        listLabels: () => ({ labels: [] }),
        listAttachments: () => ({ attachments: [] }),
        listTaskThreads: () => ({ taskThreads: [] }),
        listTaskPullRequests: () => ({
          pullRequests: [],
          unavailableThreadIds: [],
        }),
        getTaskActivity: () => ({ entries: [] }),
        addTaskDependency: (raw) => {
          const input = rpcInput(raw);
          if (cycle && input.blockerTaskId === cycle[0] && input.blockedTaskId === cycle[1]) {
            return {
              ok: false,
              error: {
                code: "dependency_cycle",
                message:
                  "ABC-3 cannot block ABC-5: this makes a cycle (ABC-5 blocks ABC-3 blocks ABC-5)",
              },
            };
          }
          links.push([input.blockerTaskId as string, input.blockedTaskId as string]);
          const find = (id: unknown) => withLinks(base.find((t) => t.id === id)!);
          return {
            ok: true,
            added: true,
            blocker: find(input.blockerTaskId),
            blocked: find(input.blockedTaskId),
          };
        },
        removeTaskDependency: (raw) => {
          const input = rpcInput(raw);
          const index = links.findIndex(
            ([a, b]) => a === input.blockerTaskId && b === input.blockedTaskId,
          );
          if (index >= 0) links.splice(index, 1);
          return { removed: index >= 0 };
        },
      },
    },
  );
}

async function section(slot: ReturnType<typeof renderDetail>, name: string) {
  return within(await slot.findByRole("region", { name }));
}
async function findPickerStatus(slot: ReturnType<typeof renderDetail>) {
  return within(await slot.findByRole("listbox")).findByRole("status");
}
function isCatalogRead(input: object) {
  return Object.keys(input).every((key) => key === "limit" || key === "cursor");
}
function catalogReads(slot: ReturnType<typeof renderDetail>) {
  return slot.rpcCalls.filter(
    ({ method, input }) => method === "listTasks" && isCatalogRead(input as object),
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function closePicker(slot: ReturnType<typeof renderDetail>) {
  fireEvent.keyDown(slot.getByRole("combobox"), { key: "Escape" });
  await waitFor(() => expect(slot.queryByRole("combobox")).toBeNull());
}

async function selectTask(slot: ReturnType<typeof renderDetail>, number: number) {
  const Panel = app.navPanels[0]!.component;
  slot.lifecycle.rerender(<Panel subPath={`task/ABC-${number}`} />);
  await waitFor(() =>
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe(`Task ${number}`),
  );
}

describe("task detail dependency sections", () => {
  it("browses both linked sides and changes tasks without a catalog read", async () => {
    const slot = renderDetail([
      [3, 5],
      [5, 4],
    ]);
    expect((await section(slot, "Blocked by")).getByText("ABC-3")).toBeTruthy();
    expect((await section(slot, "Blocks")).getByText("ABC-4")).toBeTruthy();
    for (const number of [4, 3, 5]) await selectTask(slot, number);
    expect(catalogReads(slot)).toHaveLength(0);
    await slot.behavior.emitRealtime("tasks:changed", {});
    fireEvent.click(slot.getByRole("button", { name: "Refresh tasks" }));
    await act(async () => {});
    expect(catalogReads(slot)).toHaveLength(0);
  });

  it.each([
    ["Blocked by", "Add blocker"],
    ["Blocks", "Add blocked task"],
  ])("keeps keyboard search focus while %s choices load", async (name, label) => {
    const page = deferred<{ tasks: Task[]; nextCursor: null }>();
    const slot = renderDetail([], { catalog: () => page.promise });
    fireEvent.click((await section(slot, name)).getByRole("button", { name: label }));
    await findPickerStatus(slot);
    const input = slot.getByRole("combobox");
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.change(input, { target: { value: "ABC-4" } });
    await act(async () => page.resolve({ tasks: [baseTask(3), baseTask(4)], nextCursor: null }));
    await slot.findByRole("option", { name: /ABC-4/ });
    expect(slot.queryByRole("option", { name: /ABC-3/ })).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(catalogReads(slot)).toHaveLength(1);
  });

  it("shares a pending paged load and reuses candidates across both pickers", async () => {
    const page = deferred<{ tasks: Task[]; nextCursor: string | null }>();
    const slot = renderDetail([], {
      catalog: (input) =>
        input.cursor ? { tasks: [baseTask(4)], nextCursor: null } : page.promise,
    });
    const blockedBy = await section(slot, "Blocked by");
    fireEvent.click(blockedBy.getByRole("button", { name: "Add blocker" }));
    expect((await findPickerStatus(slot)).textContent).toContain("Loading tasks");
    expect(slot.queryByText("No tasks.")).toBeNull();
    await closePicker(slot);
    fireEvent.click(
      (await section(slot, "Blocks")).getByRole("button", { name: "Add blocked task" }),
    );
    expect(catalogReads(slot)).toHaveLength(1);
    await act(async () => page.resolve({ tasks: [baseTask(3)], nextCursor: "page-2" }));
    await slot.findByRole("option", { name: /ABC-4/ });
    expect(catalogReads(slot)).toHaveLength(2);
    await closePicker(slot);
    fireEvent.click(blockedBy.getByRole("button", { name: "Add blocker" }));
    await slot.findByRole("option", { name: /ABC-3/ });
    expect(catalogReads(slot)).toHaveLength(2);
  });

  it("shows confirmed empty choices only after a successful read", async () => {
    const slot = renderDetail([], { catalog: () => ({ tasks: [baseTask(5)], nextCursor: null }) });
    fireEvent.click(
      (await section(slot, "Blocks")).getByRole("button", { name: "Add blocked task" }),
    );
    await slot.findByText("No tasks.");
    expect(slot.queryByRole("alert")).toBeNull();
    expect(within(slot.getByRole("listbox")).queryByRole("status")).toBeNull();
    expect(slot.queryByRole("option")).toBeNull();
  });

  it("keeps partial catalog failures distinct from empty choices and retries from page one", async () => {
    let fail = true;
    const slot = renderDetail([], {
      catalog: (input) => {
        if (!input.cursor) return { tasks: [baseTask(3)], nextCursor: "page-2" };
        if (fail) throw new Error("Catalog offline");
        return { tasks: [baseTask(4)], nextCursor: null };
      },
    });
    fireEvent.click(
      (await section(slot, "Blocked by")).getByRole("button", { name: "Add blocker" }),
    );
    expect((await slot.findByRole("alert")).textContent).toContain("Catalog offline");
    expect(slot.queryByText("No tasks.")).toBeNull();
    expect(slot.queryByRole("option")).toBeNull();
    await closePicker(slot);
    fireEvent.click(
      (await section(slot, "Blocks")).getByRole("button", { name: "Add blocked task" }),
    );
    await slot.findByRole("alert");
    expect(catalogReads(slot)).toHaveLength(2);
    fail = false;
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    await slot.findByRole("option", { name: /ABC-4/ });
    expect(
      catalogReads(slot).map(({ input }) => (input as Record<string, unknown>).cursor),
    ).toEqual([undefined, "page-2", undefined, "page-2"]);
  });

  it("keeps cross-project choices and excludes self and links on both sides", async () => {
    const other = makeTask({
      id: "other-project-task",
      projectId: "other-project",
      key: "XYZ-1",
      title: "Other project",
    });
    const slot = renderDetail(
      [
        [3, 5],
        [5, 4],
      ],
      { extraTasks: [other] },
    );
    const blocks = await section(slot, "Blocks");
    fireEvent.click(blocks.getByRole("button", { name: "Add blocked task" }));
    await slot.findByRole("option", { name: /XYZ-1/ });
    expect(slot.getAllByRole("option")).toHaveLength(1);
    fireEvent.click(slot.getByRole("option", { name: /XYZ-1/ }));
    await blocks.findByText("XYZ-1");
    expect(slot.rpcCalls).toContainEqual(
      expect.objectContaining({
        method: "addTaskDependency",
        input: { blockerTaskId: baseTask(5).id, blockedTaskId: other.id },
      }),
    );
  });

  it("reloads on invalidation and rejects older successful results", async () => {
    const old = deferred<{ tasks: Task[]; nextCursor: null }>();
    let reads = 0;
    const slot = renderDetail([], {
      catalog: () => (++reads === 1 ? old.promise : { tasks: [baseTask(4)], nextCursor: null }),
    });
    fireEvent.click(
      (await section(slot, "Blocked by")).getByRole("button", { name: "Add blocker" }),
    );
    await findPickerStatus(slot);
    await slot.behavior.emitRealtime("tasks:changed", {});
    await slot.findByRole("option", { name: /ABC-4/ });
    await act(async () => old.resolve({ tasks: [baseTask(3)], nextCursor: null }));
    expect(slot.queryByRole("option", { name: /ABC-3/ })).toBeNull();
    expect(catalogReads(slot)).toHaveLength(2);
    await closePicker(slot);
    fireEvent.click(slot.getByRole("button", { name: "Refresh tasks" }));
    await act(async () => {});
    fireEvent.click(
      (await section(slot, "Blocks")).getByRole("button", { name: "Add blocked task" }),
    );
    await slot.findByRole("option", { name: /ABC-4/ });
    expect(catalogReads(slot)).toHaveLength(3);
  });

  it.each(["success", "failure"])(
    "does not publish an earlier task's %s in a replacement picker",
    async (result) => {
      const old = deferred<{ tasks: Task[]; nextCursor: null }>();
      const current = deferred<{ tasks: Task[]; nextCursor: null }>();
      let reads = 0;
      const slot = renderDetail([], {
        catalog: () => (++reads === 1 ? old.promise : current.promise),
      });
      fireEvent.click(
        (await section(slot, "Blocked by")).getByRole("button", { name: "Add blocker" }),
      );
      await findPickerStatus(slot);
      await selectTask(slot, 4);
      expect(slot.queryByRole("combobox")).toBeNull();
      expect(catalogReads(slot)).toHaveLength(1);
      fireEvent.click(
        (await section(slot, "Blocks")).getByRole("button", { name: "Add blocked task" }),
      );
      await act(async () => {
        if (result === "success") old.resolve({ tasks: [baseTask(3)], nextCursor: null });
        else old.reject(new Error("Old task failure"));
      });
      expect(slot.queryByRole("option")).toBeNull();
      expect(slot.queryByRole("alert")).toBeNull();
      expect(within(slot.getByRole("listbox")).getByRole("status").textContent).toContain(
        "Loading tasks",
      );
      await act(async () => current.resolve({ tasks: [baseTask(5)], nextCursor: null }));
      await slot.findByRole("option", { name: /ABC-5/ });
      expect(catalogReads(slot)).toHaveLength(2);
    },
  );

  it("adds a blocker from the picker", async () => {
    const slot = renderDetail();
    const blockedBy = await section(slot, "Blocked by");

    fireEvent.click(blockedBy.getByRole("button", { name: "Add blocker" }));
    fireEvent.click(await slot.findByRole("option", { name: /ABC-3/ }));

    await waitFor(() => expect(blockedBy.getByText("ABC-3")).toBeTruthy());
    expect(slot.rpcCalls).toContainEqual(
      expect.objectContaining({
        method: "addTaskDependency",
        input: {
          blockerTaskId: baseTask(3).id,
          blockedTaskId: baseTask(5).id,
        },
      }),
    );
  });

  it("adds a blocked task from the Blocks picker", async () => {
    const slot = renderDetail();
    const blocks = await section(slot, "Blocks");

    fireEvent.click(blocks.getByRole("button", { name: "Add blocked task" }));
    fireEvent.click(await slot.findByRole("option", { name: /ABC-4/ }));

    await waitFor(() => expect(blocks.getByText("ABC-4")).toBeTruthy());
  });

  it("removes a link", async () => {
    const slot = renderDetail([[3, 5]]);
    const blockedBy = await section(slot, "Blocked by");
    await blockedBy.findByText("ABC-3");

    fireEvent.click(blockedBy.getByRole("button", { name: "Remove ABC-3 from Blocked by" }));

    await waitFor(() => expect(blockedBy.queryByText("ABC-3")).toBeNull());
  });

  it("opens a linked task on click", async () => {
    const slot = renderDetail([[3, 5]]);
    const blockedBy = await section(slot, "Blocked by");

    fireEvent.click(await blockedBy.findByText("Task 3"));

    await waitFor(() =>
      expect(slot.navigateCalls).toContainEqual({
        method: "toPluginPanel",
        path: "tasks",
        options: { subPath: "task/ABC-3" },
      }),
    );
  });

  it("shows the cycle error and keeps the sections", async () => {
    const slot = renderDetail([[5, 4]], { cycleOn: [3, 5] });
    const blockedBy = await section(slot, "Blocked by");

    fireEvent.click(blockedBy.getByRole("button", { name: "Add blocker" }));
    fireEvent.click(await slot.findByRole("option", { name: /ABC-3/ }));

    await slot.findByText(/this makes a cycle/);
    expect(blockedBy.queryByText("ABC-3")).toBeNull();
    expect((await section(slot, "Blocks")).getByText("ABC-4")).toBeTruthy();
  });
});
