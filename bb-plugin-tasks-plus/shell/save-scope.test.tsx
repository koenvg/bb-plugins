// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Project } from "../shared/contract.js";
import { makeTask, rpcInput } from "../test-fixtures.js";
import {
  BROWSE_PREFERENCE_STORAGE_KEY,
  browsePreference,
  resetBrowsePreferenceStateForTest,
} from "./browse-preference.js";
import { storeViewMode } from "./view-preference.js";

const app = await loadPluginApp(() => import("../app"));
const panel = app.navPanels[0]!;
const Panel = panel.component;
const rememberedProject: Project = {
  id: "01HZZZZZZZZZZZZZZZZZZZZZP1",
  name: "Tenet",
  prefix: "TEN",
  nextTaskNumber: 2,
  color: "blue",
  folderId: null,
  linkedBbProjectId: null,
  createdAt: "2026-07-15T00:00:00.000Z",
};
const taskProject: Project = {
  ...rememberedProject,
  id: "01HZZZZZZZZZZZZZZZZZZZZZP2",
  name: "ClassSpotter",
  prefix: "CS",
};
const task = makeTask({
  projectId: taskProject.id,
  key: "CS-1",
  title: "Keep editing this ticket",
  description: "Original description",
});

beforeEach(resetBrowsePreferenceStateForTest);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function editDescription(container: HTMLElement, value: string) {
  await act(async () => {
    const editor = container.querySelector<HTMLElement>(".tiptap")!;
    editor.innerHTML = `<p>${value}</p>`;
    fireEvent.input(editor);
  });
}

describe("save-before-switch with remembered browse scope", () => {
  it.each([
    { source: "host", destination: "project" },
    { source: "host", destination: "all" },
    { source: "internal", destination: "project" },
    { source: "internal", destination: "all" },
    { source: "menu", destination: "all" },
  ] as const)(
    "keeps the committed task and scope through a failed $source request to $destination, then retries",
    async ({ source, destination }) => {
      const originalScope = {
        kind: "project",
        projectId: rememberedProject.id,
      } as const;
      browsePreference().store(originalScope);
      storeViewMode(taskProject.id, "board");
      const storedBefore = window.localStorage.getItem(
        BROWSE_PREFERENCE_STORAGE_KEY,
      );
      const storageWrites = vi.spyOn(Storage.prototype, "setItem");
      const firstSave = deferred<unknown>();
      const retrySave = deferred<unknown>();
      const writes: Record<string, unknown>[] = [];
      const slot = renderSlot(
        panel,
        { subPath: `task/${task.key}` },
        {
          rpc: {
            listProjects: () => ({
              projects: [rememberedProject, taskProject],
            }),
            listTasks: (raw) => ({
              tasks: rpcInput(raw).parentTaskId ? [] : [task],
              nextCursor: null,
            }),
            listLabels: () => ({ labels: [] }),
            listFolders: () => ({ folders: [] }),
            listPresets: () => ({ presets: [] }),
            getTaskByKey: () => ({ task }),
            getTask: () => ({ task: null }),
            listAttachments: () => ({ attachments: [] }),
            listComments: () => ({ comments: [] }),
            listTaskDependencies: () => ({ blockers: [], blocking: [] }),
            listTaskThreads: () => ({ taskThreads: [] }),
            listTaskPullRequests: () => ({
              pullRequests: [],
              unavailableThreadIds: [],
            }),
            updateTask: (raw) => {
              writes.push(rpcInput(raw));
              return writes.length === 1
                ? firstSave.promise
                : retrySave.promise;
            },
          },
        },
      );
      await slot.findByRole("textbox", { name: "Task title" });
      await slot.findByRole("button", { name: taskProject.name });
      await editDescription(slot.container, "Pending description");
      const target = destination === "all" ? "all" : taskProject.id;
      const assertOrigin = (draft: string) => {
        expect(
          slot.getByRole("textbox", { name: "Task title" }).textContent,
        ).toBe(task.title);
        expect(slot.container.querySelector("header")?.textContent).toContain(
          task.key,
        );
        expect(slot.container.querySelector(".tiptap")?.textContent).toBe(
          draft,
        );
        expect(window.localStorage.getItem(BROWSE_PREFERENCE_STORAGE_KEY)).toBe(
          storedBefore,
        );
        expect(browsePreference().load()).toEqual(originalScope);
        expect(
          storageWrites.mock.calls.filter(
            ([key]) => key === BROWSE_PREFERENCE_STORAGE_KEY,
          ),
        ).toEqual([]);
      };
      if (source === "host") {
        // Host URLs may already have changed before props arrive. The rendered
        // origin and remembered scope must still wait. All also coalesces a
        // pending project request without ever remembering that intermediate scope.
        if (destination === "all")
          slot.lifecycle.rerender(<Panel subPath={taskProject.id} />);
        slot.lifecycle.rerender(<Panel subPath={target} />);
      } else if (source === "menu") {
        fireEvent.keyDown(
          slot.getByRole("button", { name: "Tasks navigation" }),
          { key: "ArrowDown" },
        );
        fireEvent.click(
          await slot.findByRole("menuitem", { name: "All projects" }),
        );
      } else {
        fireEvent.click(
          slot.getByRole("button", {
            name: destination === "all" ? "Back (Esc)" : taskProject.name,
          }),
        );
      }
      await waitFor(() => expect(writes).toHaveLength(1));
      assertOrigin("Pending description");
      expect(slot.inspection.navigateCalls).toEqual([]);
      await act(async () =>
        firstSave.resolve({ ok: false, error: { message: "Save refused" } }),
      );
      expect((await slot.findByRole("alert")).textContent).toContain(
        "Save refused",
      );
      await editDescription(slot.container, "Retained latest description");
      assertOrigin("Retained latest description");
      expect(slot.inspection.navigateCalls).toEqual([]);

      fireEvent.click(slot.getByRole("button", { name: "Retry save" }));
      await waitFor(() => expect(writes).toHaveLength(2));
      expect(writes[1]).toMatchObject({
        taskId: task.id,
        description: "Retained latest description",
      });
      assertOrigin("Retained latest description");
      expect(slot.inspection.navigateCalls).toEqual([]);
      await act(async () =>
        retrySave.resolve({
          ok: true,
          task: { ...task, description: "Retained latest description" },
        }),
      );
      if (source !== "host") {
        expect(slot.inspection.navigateCalls).toEqual([
          {
            method: "toPluginPanel",
            path: "tasks",
            options: { subPath: target },
          },
        ]);
        // The SDK harness records navigation, but does not deliver host props.
        // Even a successful navigation request must not write scope prematurely.
        expect(window.localStorage.getItem(BROWSE_PREFERENCE_STORAGE_KEY)).toBe(
          storedBefore,
        );
        slot.lifecycle.rerender(<Panel subPath={target} />);
      } else {
        expect(slot.inspection.navigateCalls).toEqual([]);
      }
      await slot.findByRole("button", { name: "New task" });
      expect(slot.queryByRole("textbox", { name: "Task title" })).toBeNull();
      const expectedScope =
        destination === "all"
          ? { kind: "all" }
          : { kind: "project", projectId: taskProject.id };
      expect(browsePreference().load()).toEqual(expectedScope);
      expect(
        JSON.parse(window.localStorage.getItem(BROWSE_PREFERENCE_STORAGE_KEY)!),
      ).toEqual({ version: 1, scope: expectedScope });
      const committedWrites = storageWrites.mock.calls.filter(
        ([key]) => key === BROWSE_PREFERENCE_STORAGE_KEY,
      );
      expect(committedWrites.length).toBeGreaterThan(0);
      for (const [, value] of committedWrites)
        expect(JSON.parse(value).scope).toEqual(expectedScope);
      if (destination === "all") {
        expect(slot.getByText("All projects")).toBeTruthy();
      } else {
        expect(
          slot
            .getByRole("button", { name: "Board" })
            .getAttribute("aria-pressed"),
        ).toBe("true");
      }
    },
  );
});
