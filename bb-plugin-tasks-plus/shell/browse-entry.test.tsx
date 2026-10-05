// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Project } from "../shared/contract.js";
import { storeViewMode } from "./view-preference.js";
import {
  BROWSE_PREFERENCE_STORAGE_KEY,
  resetBrowsePreferenceStateForTest,
} from "./browse-preference.js";
import { querySnapshotStorageKey } from "./query-snapshot.js";
import { makeTask } from "../test-fixtures.js";
import { storeListPreference } from "../views/list/list-preference.js";
import { TASKS_COMMANDS } from "./commands.js";

const app = await loadPluginApp(() => import("../app"));
const panel = app.navPanels[0]!;
const Panel = panel.component;
const project: Project = {
  id: "01HZZZZZZZZZZZZZZZZZZZZZP1",
  name: "Tenet",
  prefix: "TEN",
  nextTaskNumber: 2,
  color: "blue",
  folderId: null,
  linkedBbProjectId: null,
  createdAt: "2026-07-15T00:00:00.000Z",
};
const other: Project = {
  ...project,
  id: "01HZZZZZZZZZZZZZZZZZZZZZP2",
  name: "ClassSpotter",
  prefix: "CS",
};
const storageKey = BROWSE_PREFERENCE_STORAGE_KEY;
beforeEach(resetBrowsePreferenceStateForTest);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const rpc = {
  listProjects: () => ({ projects: [project, other] }),
  listTasks: () => ({ tasks: [], nextCursor: null }),
  listLabels: () => ({ labels: [] }),
  listFolders: () => ({ folders: [] }),
  listPresets: () => ({ presets: [] }),
};
function open(subPath = "", overrides = {}, bbProject = "proj_one") {
  return renderSlot(
    panel,
    { subPath },
    {
      rpc: { ...rpc, ...overrides },
      context: { projectId: bbProject, threadId: null },
    },
  );
}
function remembered() {
  return JSON.parse(window.localStorage.getItem(storageKey) ?? "null")?.scope;
}
function destination(subPath: string, replace = false) {
  return {
    method: "toPluginPanel",
    path: "tasks",
    options: { subPath, ...(replace ? { replace: true } : {}) },
  };
}

function rememberProject() {
  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      version: 1,
      scope: { kind: "project", projectId: project.id },
    }),
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
describe("remembered Tasks entry", () => {
  it("reopens a project across BB projects, respects its board preference and replaces entry only once", async () => {
    storeViewMode(project.id, "board");
    const explicit = open(project.id);
    await explicit.findByText("Tenet");
    expect(remembered()).toEqual({ kind: "project", projectId: project.id });
    explicit.lifecycle.unmount();

    const reopened = open("", {}, "proj_two");
    await reopened.findByText("Tenet");
    expect(reopened.getByRole("button", { name: "Board" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(reopened.navigateCalls).toEqual([destination(`${project.id}?view=board`, true)]);
    reopened.lifecycle.rerender(<Panel subPath={`${project.id}?view=board`} />);
    fireEvent.click(reopened.getByRole("button", { name: "Refresh tasks" }));
    await waitFor(() =>
      expect(
        reopened.getByRole("button", { name: "Refresh tasks" }).getAttribute("aria-busy"),
      ).toBe("false"),
    );
    expect(reopened.navigateCalls).toHaveLength(1);
  });
  it("defaults first use to All after authoritative inventory and preserves explicit All on reopen", async () => {
    const slot = open();
    await slot.findByText("All projects");
    expect(slot.navigateCalls).toEqual([destination("all", true)]);
    slot.lifecycle.unmount();
    rememberProject();
    const all = open("all");
    await all.findByText("All projects");
    expect(remembered()).toEqual({ kind: "all" });
    all.lifecycle.unmount();
    const reopened = open();
    await reopened.findByText("All projects");
    expect(reopened.navigateCalls).toEqual([destination("all", true)]);
  });

  it.each([{ snapshot: [] }, { snapshot: [other] }])(
    "does not invalidate remembered scope from stale snapshot $snapshot",
    async ({ snapshot }) => {
      rememberProject();
      window.localStorage.setItem(querySnapshotStorageKey("projects"), JSON.stringify(snapshot));
      const inventory = deferred<{ projects: Project[] }>();
      const slot = open("", { listProjects: () => inventory.promise });
      expect(slot.getByRole("status").textContent).toBe("Loading projects…");
      expect(slot.queryByText("No projects yet")).toBeNull();
      expect(slot.navigateCalls).toEqual([]);
      expect(remembered()).toEqual({ kind: "project", projectId: project.id });
      await act(async () => inventory.resolve({ projects: [project, other] }));
      await slot.findByText("Tenet");
      expect(slot.navigateCalls).toEqual([destination(`${project.id}?view=list`, true)]);
    },
  );

  it("falls back once only after successful confirmation of a deleted project", async () => {
    rememberProject();
    window.localStorage.setItem(querySnapshotStorageKey("projects"), JSON.stringify([project]));
    const inventory = deferred<{ projects: Project[] }>();
    const slot = open("", { listProjects: () => inventory.promise });
    expect(slot.navigateCalls).toEqual([]);
    await act(async () => inventory.resolve({ projects: [other] }));
    await slot.findByText("All projects");
    expect(remembered()).toEqual({ kind: "all" });
    expect(slot.navigateCalls).toEqual([destination("all", true)]);
    slot.lifecycle.rerender(<Panel subPath="all" />);
    expect(slot.navigateCalls).toHaveLength(1);
  });

  it("retains scope on inventory failure, exposes retry, and waits through the retry", async () => {
    rememberProject();
    window.localStorage.setItem(querySnapshotStorageKey("projects"), JSON.stringify([]));
    const retry = deferred<{ projects: Project[] }>();
    let retrying = false;
    const slot = open("", {
      listProjects: () => (retrying ? retry.promise : Promise.reject(new Error("offline"))),
    });
    await slot.findByRole("alert");
    expect(remembered()).toEqual({ kind: "project", projectId: project.id });
    expect(slot.navigateCalls).toEqual([]);
    retrying = true;
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    expect(slot.getByRole("status").textContent).toBe("Loading projects…");
    expect(slot.queryByRole("alert")).toBeNull();
    expect(remembered()).toEqual({ kind: "project", projectId: project.id });
    await act(async () => retry.resolve({ projects: [project] }));
    await slot.findByText("Tenet");
    expect(slot.navigateCalls).toEqual([destination(`${project.id}?view=list`, true)]);
  });

  it.each(["active", "manage"])(
    "honors explicit %s while inventory fails and leaves memory alone",
    async (subPath) => {
      rememberProject();
      const slot = open(subPath, {
        listProjects: () => Promise.reject(new Error("offline")),
      });
      await slot.findAllByText(subPath === "active" ? "Active" : "Manage");
      expect(slot.queryByText("Could not load projects")).toBeNull();
      expect(slot.navigateCalls).toEqual([]);
      expect(remembered()).toEqual({ kind: "project", projectId: project.id });
      slot.lifecycle.unmount();
      const reopened = open();
      await reopened.findByText("Tenet");
    },
  );

  it("opens a direct cross-project ticket independently of inventory without changing scope", async () => {
    rememberProject();
    const task = makeTask({
      projectId: other.id,
      key: "CS-1",
      title: "Cross-project task",
    });
    const slot = open("task/CS-1", {
      listProjects: () => new Promise(() => {}),
      getTaskByKey: () => ({ task }),
      listAttachments: () => ({ attachments: [] }),
      listComments: () => ({ comments: [] }),
      listTaskThreads: () => ({ taskThreads: [] }),
      listTaskDependencies: () => ({ blockers: [], blocking: [] }),
    });
    expect((await slot.findByRole("textbox", { name: "Task title" })).textContent).toBe(
      "Cross-project task",
    );
    expect(slot.navigateCalls).toEqual([]);
    expect(remembered()).toEqual({ kind: "project", projectId: project.id });
    slot.lifecycle.unmount();
    const reopened = open();
    await reopened.findByText("Tenet");
  });

  it("honors a different explicit project and its view before inventory settles", async () => {
    rememberProject();
    storeViewMode(other.id, "board");
    const slot = open(`${other.id}?view=list`, {
      listProjects: () => new Promise(() => {}),
    });
    expect(slot.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("true");
    expect(slot.navigateCalls).toEqual([]);
    expect(remembered()).toEqual({ kind: "project", projectId: other.id });
    slot.lifecycle.unmount();
    const reopened = open();
    await reopened.findByText("ClassSpotter");
    // Explicit URL views do not rewrite the existing view preference.
    expect(reopened.getByRole("button", { name: "Board" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("does not redirect a later explicit destination when old inventory completes", async () => {
    rememberProject();
    const inventory = deferred<{ projects: Project[] }>();
    const slot = open("", { listProjects: () => inventory.promise });
    slot.lifecycle.rerender(<Panel subPath="active" />);
    await act(async () => inventory.resolve({ projects: [] }));
    expect(slot.navigateCalls).toEqual([]);
    expect(remembered()).toEqual({ kind: "project", projectId: project.id });
  });

  it.each(["write", "access"])(
    "restores session choices across remounts with blocked storage %s",
    async (failure) => {
      if (failure === "access") {
        vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
          throw new Error("blocked");
        });
      } else {
        rememberProject();
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
          throw new Error("full");
        });
      }
      const selected = open(other.id);
      await selected.findByText("ClassSpotter");
      selected.lifecycle.unmount();
      const restored = open();
      await restored.findByText("ClassSpotter");
      expect(restored.navigateCalls).toEqual([destination(`${other.id}?view=list`, true)]);
      restored.lifecycle.unmount();
      const all = open("all");
      await all.findByText("All projects");
      all.lifecycle.unmount();
      const reopened = open();
      await reopened.findByText("All projects");
      expect(reopened.navigateCalls).toEqual([destination("all", true)]);
    },
  );

  it.each([
    "invalid JSON",
    JSON.stringify({
      version: 99,
      scope: { kind: "project", projectId: project.id },
    }),
  ])(
    "defaults unsupported storage safely, accepts new choices, and preserves future documents",
    async (raw) => {
      window.localStorage.setItem(storageKey, raw);
      const initial = open();
      await initial.findByText("All projects");
      initial.lifecycle.rerender(<Panel subPath={other.id} />);
      await initial.findByText("ClassSpotter");
      initial.lifecycle.unmount();
      const reopened = open();
      await reopened.findByText("ClassSpotter");
      if (raw.includes("99")) expect(window.localStorage.getItem(storageKey)).toBe(raw);
    },
  );

  it("retains the project's scoped filters and sort without modifying other preference documents", async () => {
    rememberProject();
    storeListPreference(`project:${project.id}`, {
      filters: { statuses: ["todo"], priorities: [], labelNames: [] },
      sort: "priority",
    });
    const before = window.localStorage.getItem("bb-tasks:list-preferences");
    const slot = open("", {
      listTasks: () => ({
        tasks: [
          makeTask({ title: "Visible task", status: "todo" }),
          makeTask({
            id: "01HZZZZZZZZZZZZZZZZZZZZZT2",
            key: "TEN-2",
            title: "Filtered task",
            status: "done",
          }),
        ],
      }),
    });
    await slot.findByText("Visible task");
    expect(slot.queryByText("Filtered task")).toBeNull();
    expect(window.localStorage.getItem("bb-tasks:list-preferences")).toBe(before);
  });

  it.each([
    ["go-all", "all", "All projects"],
    ["go-active", "active", "Active"],
    ["go-manage", "manage", "Manage"],
  ])("palette %s has explicit precedence over remembered project", async (id, subPath, label) => {
    rememberProject();
    const slot = open(project.id);
    await slot.findByText("Tenet");
    act(() => {
      void TASKS_COMMANDS.find((command) => command.id === id)!.run({
        projectId: "unrelated-bb-project",
        threadId: null,
        openPanel: () => false,
      });
    });
    expect(slot.navigateCalls).toEqual([destination(subPath)]);
    // The SDK harness records navigation but does not update host routes.
    slot.lifecycle.rerender(<Panel subPath={subPath} />);
    await slot.findAllByText(label);
    expect(remembered()).toEqual(
      subPath === "all" ? { kind: "all" } : { kind: "project", projectId: project.id },
    );
  });

  it("the project navigation command wins over remembered All", async () => {
    const slot = open("all");
    await slot.findByText("All projects");
    fireEvent.keyDown(slot.getByRole("button", { name: "Project: All projects" }), {
      key: "ArrowDown",
    });
    fireEvent.click(await slot.findByRole("menuitemradio", { name: "ClassSpotter" }));
    expect(slot.navigateCalls).toEqual([destination(other.id)]);
    slot.lifecycle.rerender(<Panel subPath={other.id} />);
    expect(remembered()).toEqual({ kind: "project", projectId: other.id });
  });

  it.each(["manual", "realtime"])(
    "waits for a fresh inventory when entering during %s refresh",
    async (mode) => {
      const nextInventory = deferred<{ projects: Project[] }>();
      let refreshing = false;
      const slot = open("active", {
        listProjects: () => (refreshing ? nextInventory.promise : { projects: [other] }),
      });
      await waitFor(() =>
        expect(window.localStorage.getItem(querySnapshotStorageKey("projects"))).toContain(
          other.id,
        ),
      );
      rememberProject();
      refreshing = true;
      if (mode === "manual") fireEvent.click(slot.getByRole("button", { name: "Refresh tasks" }));
      else await slot.behavior.emitRealtime("projects:changed", {});
      slot.lifecycle.rerender(<Panel subPath="" />);
      expect(slot.getByRole("status").textContent).toBe("Loading projects…");
      expect(remembered()).toEqual({ kind: "project", projectId: project.id });
      expect(slot.navigateCalls).toEqual([]);
      await act(async () => nextInventory.resolve({ projects: [project, other] }));
      await slot.findByText("Tenet");
      expect(slot.navigateCalls).toEqual([destination(`${project.id}?view=list`, true)]);
    },
  );

  it("does not turn background inventory refresh into a new explicit scope selection", async () => {
    const slot = open(other.id);
    await slot.findByText("ClassSpotter");
    // Another browser tab deliberately selects Tenet while this tab stays open.
    rememberProject();
    fireEvent.click(slot.getByRole("button", { name: "Refresh tasks" }));
    await waitFor(() =>
      expect(slot.getByRole("button", { name: "Refresh tasks" }).getAttribute("aria-busy")).toBe(
        "false",
      ),
    );
    expect(remembered()).toEqual({ kind: "project", projectId: project.id });
    slot.lifecycle.unmount();
    resetBrowsePreferenceStateForTest(); // A fresh JavaScript session reads durable storage.
    const refreshed = open();
    await refreshed.findByText("Tenet");
  });
});
