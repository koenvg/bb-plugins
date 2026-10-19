// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginCommandContext } from "@get-bb/plugin-sdk/app";
import type { Preset } from "../shared/contract.js";
import { makeTask, rpcInput } from "../test-fixtures.js";
import { TASKS_COMMANDS } from "./commands.js";

const app = await loadPluginApp(() => import("../app"));
const Panel = app.navPanels[0]!.component;
const context: PluginCommandContext = { threadId: null, projectId: null, openPanel: () => false };
const command = TASKS_COMMANDS.find(({ id }) => id === "task-dispatch")!;
const available = () => command.isAvailable?.(context);
const run = () => act(() => void command.run(context));
const project = {
  id: "project-1",
  name: "Dispatch fixture",
  prefix: "TSK",
  nextTaskNumber: 3,
  color: "blue",
  folderId: null,
  linkedBbProjectId: null,
  createdAt: "2026-07-15T00:00:00.000Z",
};
const worker: Preset = {
  id: "worker",
  name: "Worker",
  providerId: "claude-code",
  modelId: "fixture-model",
  reasoningLevel: "medium",
  serviceTier: null,
  permissionMode: "accept-edits",
  environmentKind: "project-default",
  baseBranch: null,
  machineId: null,
  instructions: "",
  builtin: false,
  createdAt: project.createdAt,
};
const other = { ...worker, id: "other", name: "Other" };
let shown: "inline" | "rail" = "inline";

function fixture({
  presets = () => ({ presets: [worker, other] }) as unknown,
  delegate = (_input: Record<string, unknown>) => ({ ok: true }) as unknown,
  blocked = false,
} = {}) {
  const tasks = [1, 2].map((number) =>
    makeTask({
      id: `task-${number}`,
      projectId: project.id,
      number,
      key: `TSK-${number}`,
      title: `Task ${number}`,
      status: "todo",
      ...(blocked
        ? {
            openBlockerCount: 1,
            blockedBy: [{ id: "blocker", key: "TSK-9", title: "Blocker", status: "todo" as const }],
          }
        : {}),
    }),
  );
  const calls: Record<string, unknown>[] = [];
  const slot = renderSlot(
    app.navPanels[0]!,
    { subPath: "task/TSK-1" },
    {
      rpc: {
        listProjects: () => ({ projects: [project] }),
        listFolders: () => ({ folders: [] }),
        listPresets: presets,
        listLabels: () => ({ labels: [] }),
        sidebarSummary: () => ({ projects: [] }),
        listTasks: (raw) => ({
          tasks: rpcInput(raw).parentTaskId ? [] : tasks,
          nextCursor: null,
        }),
        getTaskByKey: (raw) => ({
          task: tasks.find((task) => task.key === rpcInput(raw).taskKey) ?? null,
        }),
        getTask: () => ({ task: null }),
        listAttachments: () => ({ attachments: [] }),
        listTaskThreads: () => ({ taskThreads: [] }),
        listTaskPullRequests: () => ({ pullRequests: [], unavailableThreadIds: [] }),
        listBbProjects: () => ({ bbProjects: [] }),
        delegate: (raw) => {
          const input = rpcInput(raw);
          calls.push(input);
          return delegate(input);
        },
      },
    },
  );
  return { slot, calls };
}
async function ready(slot: ReturnType<typeof fixture>["slot"], title = "Task 1") {
  await waitFor(() =>
    expect(slot.getByRole("textbox", { name: "Task title" }).textContent).toBe(title),
  );
}
function properties(slot: ReturnType<typeof fixture>["slot"], layout = shown) {
  return within(
    slot.container.querySelector(`[data-properties-layout="${layout}"]`) as HTMLElement,
  );
}
function trigger(slot: ReturnType<typeof fixture>["slot"]) {
  return properties(slot).getByRole("button", { name: "Choose dispatch preset" });
}
async function choose(slot: ReturnType<typeof fixture>["slot"], name = "Worker") {
  const item = await slot.findByRole("menuitem", { name: new RegExp(`^${name}`) });
  fireEvent.keyDown(item, { key: "Enter" });
}

beforeEach(() => {
  shown = "inline";
  window.localStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(window, "matchMedia").mockImplementation((media) => ({
    matches: false,
    media,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }));
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (
    this: HTMLElement,
  ) {
    const owner = this.closest<HTMLElement>("[data-properties-layout]");
    return (owner && owner.dataset.propertiesLayout !== shown
      ? []
      : [{ width: 900, height: 600 }]) as unknown as DOMRectList;
  });
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("dispatch task command", () => {
  it.each(["inline", "rail"] as const)(
    "opens and cancels only the shown %s menu, then delegates an explicit choice once",
    async (layout) => {
      shown = layout;
      window.localStorage.setItem("bb-tasks:last-dispatch-preset", "other");
      const { slot, calls } = fixture();
      await ready(slot);
      await waitFor(() => expect(available()).toBe(true));
      fireEvent.keyDown(document, { key: "F9" });
      run();
      const first = await slot.findByRole("menuitem", { name: /^Worker/ });
      await waitFor(() => expect(document.activeElement).toBe(first));
      expect(slot.getAllByRole("menu")).toHaveLength(1);
      expect(calls).toEqual([]);
      fireEvent.keyDown(first, { key: "Escape" });
      await waitFor(() => expect(document.activeElement).toBe(trigger(slot)));
      expect(slot.queryByRole("menu")).toBeNull();
      expect(calls).toEqual([]);
      run();
      await choose(slot);
      await waitFor(() => expect(calls).toEqual([{ taskId: "task-1", presetId: "worker" }]));
    },
  );

  it.each(["loading", "missing", "failed"])(
    "rejects %s presets without queued menu intent",
    async (state) => {
      const { slot, calls } = fixture({
        presets: () => {
          if (state === "loading") return new Promise(() => {});
          if (state === "failed") throw new Error("Presets unavailable");
          return { presets: [] };
        },
      });
      await ready(slot);
      expect(available()).toBe(false);
      run();
      run();
      fireEvent.keyDown(window, { key: "d" });
      await act(async () => {});
      expect(slot.queryByRole("menu")).toBeNull();
      expect(calls).toEqual([]);
    },
  );

  it("does not replay invocations made before presets load", async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const { slot, calls } = fixture({ presets: () => pending });
    await ready(slot);
    expect(available()).toBe(false);
    run();
    run();
    fireEvent.keyDown(window, { key: "d" });
    await act(async () => resolve({ presets: [worker] }));
    await waitFor(() => expect(available()).toBe(true));
    expect(slot.queryByRole("menu")).toBeNull();
    expect(calls).toEqual([]);
    run();
    await choose(slot);
    await waitFor(() => expect(calls).toEqual([{ taskId: "task-1", presetId: "worker" }]));
  });

  it("rejects refresh loading and failure even with previously loaded presets", async () => {
    let lookup = 0;
    let reject!: (error: Error) => void;
    const pending = new Promise((_, fail) => {
      reject = fail;
    });
    const { slot, calls } = fixture({
      presets: () => (++lookup === 1 ? { presets: [worker] } : pending),
    });
    await ready(slot);
    await waitFor(() => expect(available()).toBe(true));
    await act(async () => {
      await slot.emitRealtime("projects:changed", {});
    });
    await waitFor(() => expect(available()).toBe(false));
    run();
    await act(async () => reject(new Error("Refresh failed")));
    expect(available()).toBe(false);
    run();
    expect(slot.queryByRole("menu")).toBeNull();
    expect(calls).toEqual([]);
  });

  it.each(["inline", "rail"] as const)(
    "uses live %s readiness rather than an idle hidden duplicate and queues nothing while busy",
    async (layout) => {
      shown = layout;
      let resolve!: (value: unknown) => void;
      const pending = new Promise((done) => {
        resolve = done;
      });
      const { slot, calls } = fixture({ delegate: () => pending });
      await ready(slot);
      await waitFor(() => expect(available()).toBe(true));
      fireEvent.keyDown(document, { key: "F9" });
      run();
      await choose(slot);
      await waitFor(() => expect(calls).toEqual([{ taskId: "task-1", presetId: "worker" }]));
      expect(available()).toBe(false);
      run();
      run();
      fireEvent.keyDown(window, { key: "d" });
      await waitFor(() => expect(slot.queryByRole("menu")).toBeNull());
      const busyLayout = shown;
      shown = layout === "inline" ? "rail" : "inline";
      expect(available()).toBe(true);
      shown = busyLayout;
      expect(available()).toBe(false);
      await act(async () => resolve({ ok: true }));
      await waitFor(() => expect(available()).toBe(true));
      expect(slot.queryByRole("menu")).toBeNull();
      expect(calls).toEqual([{ taskId: "task-1", presetId: "worker" }]);
    },
  );

  it("checks live layout again between listing, execution and the palette handoff", async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const { slot, calls } = fixture({ delegate: () => pending });
    await ready(slot);
    await waitFor(() => expect(available()).toBe(true));
    fireEvent.click(properties(slot, "inline").getByRole("button", { name: "Other" }));
    await waitFor(() => expect(calls).toEqual([{ taskId: "task-1", presetId: "other" }]));
    shown = "rail";
    expect(available()).toBe(true);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    run();
    shown = "inline";
    act(() => {
      frames.shift()!(0);
      frames.shift()!(0);
    });
    expect(slot.queryByRole("menu")).toBeNull();
    expect(available()).toBe(false);
    run();
    expect(frames).toHaveLength(0);
    await act(async () => resolve({ ok: true }));
    expect(calls).toEqual([{ taskId: "task-1", presetId: "other" }]);
  });

  it("retargets a listed command and preset selection to the current task", async () => {
    const { slot, calls } = fixture();
    await ready(slot);
    await waitFor(() => expect(available()).toBe(true));
    slot.rerender(<Panel subPath="task/TSK-2" />);
    await ready(slot, "Task 2");
    run();
    await choose(slot, "Other");
    await waitFor(() => expect(calls).toEqual([{ taskId: "task-2", presetId: "other" }]));
    expect(slot.navigateCalls).toEqual([]);
  });

  it.each(["switch", "unmount"])("cancels stale palette frames after %s", async (change) => {
    const { slot, calls } = fixture();
    await ready(slot);
    await waitFor(() => expect(available()).toBe(true));
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const cancel = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancel);
    run();
    act(() => frames.shift()!(0));
    if (change === "switch") {
      slot.rerender(<Panel subPath="task/TSK-2" />);
      await ready(slot, "Task 2");
    } else slot.unmount();
    expect(cancel).toHaveBeenCalledWith(1);
    act(() => {
      for (const callback of frames.splice(0)) callback(0);
    });
    expect(slot.queryByRole("menu")).toBeNull();
    expect(calls).toEqual([]);
    if (change === "unmount") expect(available()).toBe(false);
  });

  it("keeps blocked confirmation busy, cancels safely and preserves failure/retry", async () => {
    let attempt = 0;
    const { slot, calls } = fixture({
      blocked: true,
      delegate: () => {
        if (++attempt === 1) throw new Error("Fixture dispatch failed");
        return { ok: true };
      },
    });
    await ready(slot);
    await waitFor(() => expect(available()).toBe(true));
    fireEvent.keyDown(document, { key: "F9" });
    run();
    await choose(slot);
    await slot.findByRole("dialog", { name: "TSK-1 is blocked" });
    expect(available()).toBe(false);
    run();
    run();
    expect(slot.getAllByRole("dialog")).toHaveLength(1);
    expect(calls).toEqual([]);
    fireEvent.click(slot.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(available()).toBe(true));
    expect(slot.queryByRole("menu")).toBeNull();
    expect(calls).toEqual([]);
    run();
    await choose(slot);
    fireEvent.click(await slot.findByRole("button", { name: "Start anyway" }));
    await slot.findByText("Fixture dispatch failed");
    await waitFor(() => expect(available()).toBe(true));
    expect(calls).toEqual([{ taskId: "task-1", presetId: "worker" }]);
    run();
    await choose(slot);
    fireEvent.click(await slot.findByRole("button", { name: "Start anyway" }));
    await waitFor(() =>
      expect(calls).toEqual([
        { taskId: "task-1", presetId: "worker" },
        { taskId: "task-1", presetId: "worker" },
      ]),
    );
    await waitFor(() => expect(available()).toBe(true));
  });

  it("d opens a menu without using the last preset, while the mouse primary button still uses it", async () => {
    window.localStorage.setItem("bb-tasks:last-dispatch-preset", "other");
    const { slot, calls } = fixture();
    await ready(slot);
    await waitFor(() => expect(available()).toBe(true));
    fireEvent.keyDown(window, { key: "d" });
    const item = await slot.findByRole("menuitem", { name: /^Worker/ });
    expect(calls).toEqual([]);
    fireEvent.keyDown(item, { key: "Escape" });
    await waitFor(() => expect(slot.queryByRole("menu")).toBeNull());
    fireEvent.click(properties(slot, "inline").getByRole("button", { name: "Other" }));
    await waitFor(() => expect(calls).toEqual([{ taskId: "task-1", presetId: "other" }]));
  });
});
