import { act, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeTask, rpcInput } from "../test-fixtures.js";

const app = await loadPluginApp(() => import("../app"));
export const panel = app.navPanels[0]!;
export const Panel = panel.component;
export const project = {
  id: "01HZZZZZZZZZZZZZZZZZZZZZP1",
  name: "Tasks Plugin",
  prefix: "TSK",
  nextTaskNumber: 4,
  color: "blue",
  folderId: null,
  linkedBbProjectId: null,
  createdAt: "2026-07-15T00:00:00.000Z",
};
export const tasks = [1, 2, 3].map((n) =>
  makeTask({
    id: `01HZZZZZZZZZZZZZZZZZZZZZT${n}`,
    projectId: project.id,
    key: `TSK-${n}`,
    number: n,
    title: `Title ${n}`,
    description: `Description ${n}`,
  }),
);
export const panelSize = { width: 1000 };
export function useWorkspaceTestLifecycle() {
  beforeEach(() => {
    panelSize.width = 1000;
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.tagName === "MAIN" ? panelSize.width : 0;
      },
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
}
export function setup(
  subPath = "all",
  overrides: Record<string, (raw: unknown) => unknown> = {},
) {
  return renderSlot(
    panel,
    { subPath },
    {
      rpc: {
        listProjects: () => ({ projects: [project] }),
        listFolders: () => ({ folders: [] }),
        listLabels: () => ({ labels: [] }),
        listPresets: () => ({ presets: [] }),
        listTasks: (raw) => ({
          tasks: rpcInput(raw).parentTaskId ? [] : tasks,
          nextCursor: null,
        }),
        getTaskByKey: (raw) => ({
          task: tasks.find((t) => t.key === rpcInput(raw).taskKey) ?? null,
        }),
        getTask: () => ({ task: null }),
        listAttachments: () => ({ attachments: [] }),
        listComments: () => ({ comments: [] }),
        listTaskThreads: () => ({ taskThreads: [] }),
        listTaskDependencies: () => ({ blockers: [], blocking: [] }),
        listTaskPullRequests: () => ({
          pullRequests: [],
          unavailableThreadIds: [],
        }),
        ...overrides,
      },
    },
  );
}
// The SDK records navigation; only the host delivers accepted subpath props.
export async function acceptNavigation(slot: ReturnType<typeof setup>) {
  const call = slot.inspection.navigateCalls.at(-1);
  expect(call?.method).toBe("toPluginPanel");
  if (call?.method !== "toPluginPanel") throw new Error("Expected navigation");
  slot.lifecycle.rerender(<Panel subPath={call.options?.subPath ?? ""} />);
  await act(async () => {});
}
export const row = (slot: ReturnType<typeof setup>, n: number) =>
  slot.getByRole("button", { name: `Open TSK-${n}: Title ${n}` });
export async function select(slot: ReturnType<typeof setup>, n: number) {
  fireEvent.click(row(slot, n));
  await acceptNavigation(slot);
  await slot.findByRole("textbox", { name: "Task title" });
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export async function edit(
  slot: ReturnType<typeof setup>,
  text: string,
  index = 0,
) {
  await act(async () => {
    const editor = slot.container.querySelectorAll<HTMLElement>(
      ' .tiptap[contenteditable="true"]',
    )[index]!;
    editor.innerHTML = `<p>${text}</p>`;
    fireEvent.input(editor);
  });
}
