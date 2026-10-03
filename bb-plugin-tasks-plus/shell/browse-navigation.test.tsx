// @vitest-environment jsdom
import { cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Project } from "../shared/contract.js";
import { act, waitFor } from "@testing-library/react";
import { makeTask } from "../test-fixtures.js";
import { storeListPreference } from "../views/list/list-preference.js";
import { BROWSE_PREFERENCE_STORAGE_KEY } from "./browse-preference.js";
import { CompactViewportOverrideProvider } from "../components/ui/hooks/use-compact-viewport.js";

const app = await loadPluginApp(() => import("../app"));
const panel = app.navPanels[0]!;
const project: Project = {
  id: "01HZZZZZZZZZZZZZZZZZZZZZP1",
  name: "Tenet",
  prefix: "TEN",
  nextTaskNumber: 2,
  color: "blue",
  folderId: "01HZZZZZZZZZZZZZZZZZZZZZF1",
  linkedBbProjectId: null,
  createdAt: "2026-07-15T00:00:00.000Z",
};
const other: Project = {
  ...project,
  id: "01HZZZZZZZZZZZZZZZZZZZZZP2",
  name: "ClassSpotter",
  prefix: "CS",
  folderId: null,
};
const rpc = {
  listProjects: () => ({ projects: [project, other] }),
  listFolders: () => ({
    folders: [
      {
        id: project.folderId,
        name: "Work",
        parentFolderId: null,
        createdAt: project.createdAt,
      },
    ],
  }),
  listTasks: () => ({ tasks: [], nextCursor: null }),
  listLabels: () => ({ labels: [] }),
  listPresets: () => ({ presets: [] }),
};
afterEach(cleanup);

function openMenu(trigger: HTMLElement) {
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
}

const CompactPanel = ({ subPath }: { subPath: string }) => {
  const Panel = panel.component;
  return (
    <CompactViewportOverrideProvider isCompactViewport>
      <Panel subPath={subPath} />
    </CompactViewportOverrideProvider>
  );
};
const compactPanel = { ...panel, component: CompactPanel };

describe("compact Tasks navigation drawers", () => {
  it("shows nested folders, selected scope and All, and switches projects through the drawer", async () => {
    const slot = renderSlot(
      compactPanel,
      { subPath: project.id },
      {
        rpc: {
          ...rpc,
          listFolders: () => ({
            folders: [
              {
                id: "parent",
                name: "Work",
                parentFolderId: null,
                createdAt: project.createdAt,
              },
              {
                id: project.folderId,
                name: "Products",
                parentFolderId: "parent",
                createdAt: project.createdAt,
              },
            ],
          }),
        },
      },
    );
    fireEvent.click(
      await slot.findByRole("button", { name: "Project: Tenet" }),
    );
    const drawer = await slot.findByRole("dialog", { name: "Choose project" });
    const group = await within(drawer).findByRole("group", {
      name: "Work / Products",
    });
    expect(
      within(group).getByRole("menuitemradio", {
        name: "Tenet",
        checked: true,
      }),
    ).toBeDefined();
    fireEvent.click(
      within(drawer).getByRole("menuitemradio", { name: "ClassSpotter" }),
    );
    expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
      options: { subPath: other.id },
    });
    await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
    slot.lifecycle.rerender(<CompactPanel subPath={other.id} />);
    fireEvent.click(
      await slot.findByRole("button", { name: "Project: ClassSpotter" }),
    );
    fireEvent.click(
      await slot.findByRole("menuitemradio", { name: "All projects" }),
    );
    expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
      options: { subPath: "all" },
    });
    await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
    slot.lifecycle.rerender(<CompactPanel subPath="all" />);
    fireEvent.click(
      await slot.findByRole("button", { name: "Project: All projects" }),
    );
    expect(
      await slot.findByRole("menuitemradio", {
        name: "All projects",
        checked: true,
      }),
    ).toBeDefined();
  });

  it("offers project-inventory retry in the compact drawer", async () => {
    let failed = true;
    const slot = renderSlot(
      compactPanel,
      { subPath: "all" },
      {
        rpc: {
          ...rpc,
          listProjects: () =>
            failed
              ? Promise.reject(new Error("offline"))
              : { projects: [project] },
        },
      },
    );
    fireEvent.click(
      await slot.findByRole("button", { name: "Project: All projects" }),
    );
    const retry = await slot.findByRole("menuitem", { name: "Retry projects" });
    failed = false;
    fireEvent.click(retry);
    await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
    fireEvent.click(
      slot.getByRole("button", { name: "Project: All projects" }),
    );
    expect(
      await slot.findByRole("menuitemradio", { name: "Tenet" }),
    ).toBeDefined();
  });

  it.each(["list", "board"])(
    "offers the alternate project view from the %s drawer",
    async (view) => {
      const slot = renderSlot(
        compactPanel,
        { subPath: `${project.id}?view=${view}` },
        { rpc },
      );
      fireEvent.click(
        await slot.findByRole("button", { name: "Tasks navigation" }),
      );
      const drawer = await slot.findByRole("dialog", {
        name: "Tasks navigation",
      });
      expect(
        await within(drawer).findByRole("menuitemradio", {
          name: view === "list" ? "List" : "Board",
          checked: true,
        }),
      ).toBeDefined();
      fireEvent.click(
        within(drawer).getByRole("menuitemradio", {
          name: view === "list" ? "Board" : "List",
        }),
      );
      expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
        options: {
          subPath: `${project.id}?view=${view === "list" ? "board" : "list"}`,
        },
      });
      await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
    },
  );
});
describe("inline Tasks navigation", () => {
  it("shows the current project above the list and groups picker choices by folder", async () => {
    const slot = renderSlot(panel, { subPath: project.id }, { rpc });
    const picker = await slot.findByRole("button", { name: "Project: Tenet" });
    expect(picker.closest("header")).not.toBeNull();
    openMenu(picker);
    const work = await slot.findByRole("group", { name: "Work" });
    expect(
      within(work).getByRole("menuitemradio", { name: "Tenet", checked: true }),
    ).toBeDefined();
    expect(
      slot.getByRole("menuitemradio", { name: "All projects" }),
    ).toBeDefined();
    fireEvent.click(slot.getByRole("menuitemradio", { name: "ClassSpotter" }));
    expect(slot.inspection.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "tasks",
      options: { subPath: other.id },
    });
  });
  it("commits list scope, labels, creation default, preferences and memory together", async () => {
    storeListPreference(`project:${project.id}`, {
      filters: { statuses: [], priorities: [], labelNames: [] },
      sort: "priority",
    });
    storeListPreference(`project:${other.id}`, {
      filters: { statuses: ["todo"], priorities: [], labelNames: [] },
      sort: "due",
    });
    const tenet = makeTask({
      key: "TEN-1",
      projectId: project.id,
      title: "Tenet work",
    });
    const classSpotter = makeTask({
      key: "CS-1",
      projectId: other.id,
      title: "ClassSpotter work",
    });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slot = renderSlot(
      panel,
      { subPath: project.id },
      {
        rpc: {
          ...rpc,
          listTasks: async (raw: unknown) => {
            const input = raw as { projectId?: string };
            if (input.projectId === other.id) {
              await pending;
              return { tasks: [classSpotter] };
            }
            return { tasks: [tenet] };
          },
          listLabels: async (raw: unknown) => {
            const input = raw as { projectId: string };
            if (input.projectId === other.id) await pending;
            return {
              labels: [
                {
                  id: input.projectId + "label",
                  projectId: input.projectId,
                  name: input.projectId === other.id ? "School" : "Engineering",
                  color: "blue",
                },
              ],
            };
          },
          listTaskThreads: () => ({ taskThreads: [] }),
          listAttachments: () => ({ attachments: [] }),
        },
      },
    );
    await slot.findByText("Tenet work");
    openMenu(slot.getByRole("button", { name: "Project: Tenet" }));
    fireEvent.click(
      await slot.findByRole("menuitemradio", { name: "ClassSpotter" }),
    );
    // A requested destination must not change memory before the host commits it.
    expect(
      JSON.parse(localStorage.getItem(BROWSE_PREFERENCE_STORAGE_KEY)!).scope,
    ).toEqual({ kind: "project", projectId: project.id });
    const Panel = panel.component;
    slot.lifecycle.rerender(<Panel subPath={other.id} />);
    await slot.findByRole("button", { name: "Project: ClassSpotter" });
    expect(slot.queryByText("Tenet work")).toBeNull();
    expect(slot.queryByRole("button", { name: "Label" })).toBeNull();
    expect(slot.getByRole("button", { name: /Sort.*Due date/ })).toBeDefined();
    expect(slot.getByRole("button", { name: /Status.*Todo/ })).toBeDefined();
    act(() => release());
    await slot.findByText("ClassSpotter work");
    openMenu(await slot.findByRole("button", { name: "Label" }));
    expect(
      await slot.findByRole("menuitemcheckbox", { name: "School" }),
    ).toBeDefined();
    expect(
      slot.queryByRole("menuitemcheckbox", { name: "Engineering" }),
    ).toBeNull();
    fireEvent.keyDown(slot.getByRole("menu"), { key: "Escape" });
    fireEvent.click(slot.getByRole("button", { name: "New task" }));
    const dialog = await slot.findByRole("dialog");
    expect(
      within(dialog).getByRole("combobox", { name: "Project" }).textContent,
    ).toContain("ClassSpotter");
    expect(
      JSON.parse(localStorage.getItem(BROWSE_PREFERENCE_STORAGE_KEY)!).scope,
    ).toEqual({ kind: "project", projectId: other.id });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
    openMenu(slot.getByRole("button", { name: "Project: ClassSpotter" }));
    fireEvent.click(await slot.findByRole("menuitemradio", { name: "Tenet" }));
    slot.lifecycle.rerender(<Panel subPath={project.id} />);
    await slot.findByText("Tenet work");
    expect(slot.getByRole("button", { name: /Sort.*Priority/ })).toBeDefined();
    expect(slot.getByRole("button", { name: "Status" })).toBeDefined();
    openMenu(slot.getByRole("button", { name: "Project: Tenet" }));
    fireEvent.click(
      await slot.findByRole("menuitemradio", { name: "All projects" }),
    );
    slot.lifecycle.rerender(<Panel subPath="all" />);
    await slot.findByRole("button", { name: "Project: All projects" });
    expect(
      JSON.parse(localStorage.getItem(BROWSE_PREFERENCE_STORAGE_KEY)!).scope,
    ).toEqual({ kind: "all" });
  });
  it("keeps Active cross-project and reaches Manage, preset editing, and preset creation", async () => {
    const preset = {
      id: "preset-1",
      name: "Review agent",
      providerId: "test",
      modelId: "test",
      reasoningLevel: null,
      serviceTier: null,
      permissionMode: "accept-edits",
      environmentKind: "project-default",
      baseBranch: null,
      machineId: null,
      instructions: "",
      builtin: false,
      createdAt: project.createdAt,
    };
    const slot = renderSlot(
      panel,
      { subPath: project.id },
      {
        rpc: {
          ...rpc,
          listPresets: () => ({ presets: [preset] }),
          listTasks: (raw: unknown) => {
            const input = raw as { activeOnly?: boolean };
            return {
              tasks: input.activeOnly
                ? [
                    makeTask({
                      projectId: other.id,
                      title: "Other project's active work",
                    }),
                  ]
                : [],
            };
          },
          listTaskThreads: () => ({ taskThreads: [] }),
          listAttachments: () => ({ attachments: [] }),
          listProviders: () => ({ providers: [] }),
          listMachines: () => ({ machines: [] }),
        },
      },
    );
    const Panel = panel.component;
    await slot.findByRole("button", { name: "Project: Tenet" });
    openMenu(slot.getByRole("button", { name: "Tasks navigation" }));
    fireEvent.click(await slot.findByRole("menuitem", { name: "Active" }));
    expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
      options: { subPath: "active" },
    });
    slot.lifecycle.rerender(<Panel subPath="active" />);
    await slot.findByText("Other project's active work");
    expect(
      slot.getByRole("button", { name: "Project: All projects" }),
    ).toBeDefined();
    const activeCalls = slot.inspection.rpcCalls.filter(
      (call) =>
        call.method === "listTasks" &&
        (call.input as { activeOnly?: boolean }).activeOnly,
    );
    expect(activeCalls.length).toBeGreaterThan(0);
    expect(
      activeCalls.every((call) => !("projectId" in (call.input as object))),
    ).toBe(true);
    openMenu(slot.getByRole("button", { name: "Tasks navigation" }));
    fireEvent.click(await slot.findByRole("menuitem", { name: "Manage" }));
    expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
      options: { subPath: "manage" },
    });
    slot.lifecycle.rerender(<Panel subPath="manage" />);
    fireEvent.mouseDown(await slot.findByRole("tab", { name: "Presets" }), {
      button: 0,
      ctrlKey: false,
    });
    await slot.findByText("Review agent");
    fireEvent.click(
      slot.getByRole("button", { name: "Edit preset Review agent" }),
    );
    await slot.findByRole("dialog");
    fireEvent.keyDown(slot.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
    fireEvent.click(slot.getByRole("button", { name: "New preset" }));
    await slot.findByRole("dialog");
    fireEvent.keyDown(slot.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
    expect(
      JSON.parse(localStorage.getItem(BROWSE_PREFERENCE_STORAGE_KEY)!).scope,
    ).toEqual({ kind: "project", projectId: project.id });
    openMenu(slot.getByRole("button", { name: "Tasks navigation" }));
    fireEvent.click(
      await slot.findByRole("menuitem", { name: "All projects" }),
    );
    expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
      options: { subPath: "all" },
    });
  });

  it.each(["picker", "navigation", "empty"])(
    "creates a project from the %s controls without eagerly querying the dialog",
    async (entry) => {
      const slot = renderSlot(
        panel,
        { subPath: "all" },
        {
          rpc: {
            ...rpc,
            listProjects: () => ({
              projects: entry === "empty" ? [] : [project],
            }),
            listBbProjects: () => ({ bbProjects: [] }),
            createProject: () => ({ project: other }),
          },
        },
      );
      if (entry === "empty") {
        await slot.findByText("No projects yet");
        expect(slot.queryByRole("button", { name: /^Project:/ })).toBeNull();
        expect(slot.queryByRole("button", { name: "New task" })).toBeNull();
        fireEvent.click(
          within(slot.getByRole("banner")).getByRole("button", {
            name: "New project",
          }),
        );
      } else {
        await slot.findByRole("button", { name: "Project: All projects" });
        expect(
          slot.inspection.rpcCalls.some(
            (call) => call.method === "listBbProjects",
          ),
        ).toBe(false);
        openMenu(
          slot.getByRole("button", {
            name:
              entry === "picker" ? "Project: All projects" : "Tasks navigation",
          }),
        );
        fireEvent.click(
          await slot.findByRole("menuitem", { name: "New project" }),
        );
      }
      const dialog = await slot.findByRole("dialog");
      fireEvent.change(
        within(dialog).getByPlaceholderText("e.g. Tasks Plugin"),
        { target: { value: "ClassSpotter" } },
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Create project" }),
      );
      await waitFor(() =>
        expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
          options: { subPath: other.id },
        }),
      );
      expect(
        slot.inspection.rpcCalls.some(
          (call) => call.method === "createProject",
        ),
      ).toBe(true);
    },
  );

  it("keeps nested folders and orphan projects reachable and refreshes grouping", async () => {
    let folderName = "Products";
    const slot = renderSlot(
      panel,
      { subPath: "all" },
      {
        rpc: {
          ...rpc,
          listProjects: () => ({
            projects: [project, { ...other, folderId: "missing" }],
          }),
          listFolders: () => ({
            folders: [
              {
                id: "parent",
                name: "Work",
                parentFolderId: null,
                createdAt: project.createdAt,
              },
              {
                id: project.folderId,
                name: folderName,
                parentFolderId: "parent",
                createdAt: project.createdAt,
              },
            ],
          }),
        },
      },
    );
    openMenu(
      await slot.findByRole("button", { name: "Project: All projects" }),
    );
    expect(
      within(
        await slot.findByRole("group", { name: "Work / Products" }),
      ).getByRole("menuitemradio", { name: "Tenet" }),
    ).toBeDefined();
    expect(
      slot.getByRole("menuitemradio", { name: "ClassSpotter" }),
    ).toBeDefined();
    folderName = "Applications";
    await slot.behavior.emitRealtime("projects:changed", {
      projectId: project.id,
    });
    await slot.findByRole("group", { name: "Work / Applications" });
    expect(slot.queryByRole("group", { name: "Work / Products" })).toBeNull();
  });

  it("keeps projects navigable when folders fail to load", async () => {
    const slot = renderSlot(
      panel,
      { subPath: "all" },
      {
        rpc: {
          ...rpc,
          listFolders: () => Promise.reject(new Error("folders offline")),
        },
      },
    );
    openMenu(
      await slot.findByRole("button", { name: "Project: All projects" }),
    );
    fireEvent.click(await slot.findByRole("menuitemradio", { name: "Tenet" }));
    expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
      options: { subPath: project.id },
    });
  });

  it.each(["list", "board"])(
    "keeps project switching and menu view controls reachable from %s",
    async (view) => {
      const slot = renderSlot(
        panel,
        { subPath: `${project.id}?view=${view}` },
        { rpc },
      );
      await slot.findByRole("button", { name: "Project: Tenet" });
      openMenu(slot.getByRole("button", { name: "Tasks navigation" }));
      fireEvent.click(
        await slot.findByRole("menuitemradio", {
          name: view === "list" ? "Board" : "List",
        }),
      );
      expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
        options: {
          subPath: `${project.id}?view=${view === "list" ? "board" : "list"}`,
        },
      });
    },
  );

  it("keeps navigation reachable from standalone task links", async () => {
    const slot = renderSlot(
      panel,
      { subPath: "task/TEN-99" },
      { rpc: { ...rpc, getTaskByKey: () => ({ task: null }) } },
    );
    await slot.findByText(/Task TEN-99 was not found/);
    openMenu(slot.getByRole("button", { name: "Tasks navigation" }));
    fireEvent.click(
      await slot.findByRole("menuitem", { name: "All projects" }),
    );
    expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
      options: { subPath: "all" },
    });
  });
  it("retries failed project inventory without trapping an explicit browse route", async () => {
    let failed = true;
    const slot = renderSlot(
      panel,
      { subPath: "all" },
      {
        rpc: {
          ...rpc,
          listProjects: () =>
            failed
              ? Promise.reject(new Error("offline"))
              : { projects: [project] },
        },
      },
    );
    openMenu(
      await slot.findByRole("button", { name: "Project: All projects" }),
    );
    const retry = await slot.findByRole("menuitem", { name: "Retry projects" });
    failed = false;
    fireEvent.click(retry);
    openMenu(slot.getByRole("button", { name: "Project: All projects" }));
    fireEvent.click(await slot.findByRole("menuitemradio", { name: "Tenet" }));
    expect(slot.inspection.navigateCalls.at(-1)).toMatchObject({
      options: { subPath: project.id },
    });
  });
});
