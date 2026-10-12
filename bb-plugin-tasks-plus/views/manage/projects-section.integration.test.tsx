// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { renderSlot, type RenderedSlot } from "@get-bb/plugin-sdk/testing/app";
import { describe, expect, it } from "vitest";
import { createStore, registerTasksApi } from "../../api/index.js";
import { createTasksStore } from "../../db/index.js";
import { TASK_STATUSES, tasksRpcContract } from "../../shared/contract.js";
import { app } from "./manage.test-support.js";

describe("production project table persistence and consumer refresh", () => {
  it("deletes every task and owned record from a linked project, refreshes choices and leaves BB resources intact", async () => {
    const workspace = { id: "proj_fixture", name: "Unchanged BB workspace", color: "red" };
    const thread = makeThreadResponse({ id: "thr_fixture_keep", projectId: workspace.id });
    const workspaceDirectory = await mkdtemp(join(tmpdir(), "tasks-project-delete-workspace-"));
    const workspaceFile = join(workspaceDirectory, "keep.txt");
    await writeFile(workspaceFile, "Workspace file is not a Tasks attachment.");
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks-project-deletion-integration",
      sdk: {
        projects: { get: async () => ({ ...workspace }) },
        threads: { get: async () => ({ ...thread }) },
      },
    });
    const slots: RenderedSlot[] = [];
    try {
      const store = createStore(bb);
      registerTasksApi(bb, store);
      const folder = store.tasks.createFolder({ name: "Shared folder" });
      const target = store.tasks.createProject({
        name: "Home Lab",
        prefix: "HOME",
        color: "blue",
        folderId: folder.id,
        linkedBbProjectId: workspace.id,
      });
      const survivor = store.tasks.createProject({
        name: "Work",
        prefix: "WORK",
        color: "red",
        folderId: folder.id,
      });
      const survivingTask = store.tasks.createTask({
        projectId: survivor.id,
        title: "Keep this task",
      });
      const roots = TASK_STATUSES.map((status) =>
        store.tasks.createTask({ projectId: target.id, title: `Root ${status}`, status }),
      );
      const children = TASK_STATUSES.map((status) =>
        store.tasks.createTask({
          projectId: target.id,
          title: `Child ${status}`,
          status,
          parentTaskId: roots[0]!.id,
        }),
      );
      const ownedTasks = [...roots, ...children];
      const taskThread = store.tasks.upsertTaskThread({
        taskId: roots[0]!.id,
        threadId: thread.id,
        title: "Retained BB worker",
        presetName: "Fixture",
        liveStatus: "idle",
      });
      const comment = store.tasks.createComment({
        taskId: children[0]!.id,
        body: "Owned comment",
        authorName: "Fixture",
        kind: "user",
      });
      const rpc = Object.fromEntries(
        Object.keys(tasksRpcContract).map((method) => [
          method,
          async (raw: unknown) => {
            const before = harness.inspection.realtimeSignals.length;
            const result = await harness.behavior.callRpc(method, raw ?? null);
            for (const event of harness.inspection.realtimeSignals.slice(before)) {
              if (event.channel === "projects:changed")
                for (const slot of slots)
                  await slot.behavior.emitRealtime(event.channel, event.payload);
            }
            return result;
          },
        ]),
      );
      const editor = renderSlot(
        app.navPanels[0]!,
        { subPath: "manage" },
        { rpc, context: { projectId: workspace.id } },
      );
      slots.push(editor);
      const browse = renderSlot(
        app.navPanels[0]!,
        { subPath: `${survivor.id}?view=list` },
        { rpc },
      );
      slots.push(browse);
      await browse.findByRole("button", { name: "Project: Work" });
      fireEvent.pointerDown(browse.getByRole("button", { name: "Project: Work" }), {
        button: 0,
        ctrlKey: false,
      });
      const initialPicker = await within(document.body).findByRole("menu");
      expect(within(initialPicker).getByRole("menuitemradio", { name: "Home Lab" })).toBeDefined();
      fireEvent.keyDown(initialPicker, { key: "Escape" });
      await waitFor(() => expect(within(document.body).queryByRole("menu")).toBeNull());
      fireEvent.mouseDown(editor.getByRole("tab", { name: "Projects" }));
      await editor.findByRole("textbox", { name: "Project name for HOME" });
      fireEvent.click(editor.getByRole("button", { name: "Delete HOME" }));
      const dialog = await within(document.body).findByRole("dialog", {
        name: "Delete Home Lab (HOME)?",
      });
      await within(dialog).findByText(
        "Delete this project and all 12 tasks? This cannot be undone.",
      );
      fireEvent.change(within(dialog).getByRole("textbox", { name: "Type HOME to confirm" }), {
        target: { value: "HOME" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "Delete project and tasks" }));
      await waitFor(() => expect(within(document.body).queryByRole("dialog")).toBeNull());
      await editor.findByText("Deleted Home Lab (HOME) and all its tasks.");
      expect(editor.inspection.rpcCalls.filter((call) => call.method === "deleteProject")).toEqual([
        { method: "deleteProject", input: { projectId: target.id, force: true } },
      ]);
      const persisted = createTasksStore(bb.storage.database());
      expect(persisted.getProject(target.id)).toBeUndefined();
      expect(persisted.listTasks({ projectId: target.id })).toEqual([]);
      for (const task of ownedTasks) expect(persisted.getTask(task.id)).toBeUndefined();
      expect(persisted.getTaskThread(taskThread.id)).toBeUndefined();
      expect(persisted.getComment(comment.id)).toBeUndefined();
      expect(persisted.getProject(survivor.id)).toEqual(store.tasks.getProject(survivor.id));
      expect(persisted.getTask(survivingTask.id)).toEqual(survivingTask);
      expect(persisted.getFolder(folder.id)).toEqual(folder);
      expect(await bb.sdk.projects.get({ projectId: workspace.id })).toEqual(workspace);
      expect(await bb.sdk.threads.get({ threadId: thread.id })).toEqual(thread);
      expect(await readFile(workspaceFile, "utf8")).toBe(
        "Workspace file is not a Tasks attachment.",
      );
      expect(
        harness.inspection.sdk.calls.filter((call) =>
          /^(projects\.(create|update|delete)|threads\.(delete|archive|stop)|files\.)/.test(
            call.path,
          ),
        ),
      ).toEqual([]);
      expect(
        harness.inspection.realtimeSignals.filter((event) => event.channel === "projects:changed"),
      ).toHaveLength(1);
      expect(editor.queryByRole("textbox", { name: "Project name for HOME" })).toBeNull();
      fireEvent.pointerDown(browse.getByRole("button", { name: "Project: Work" }), {
        button: 0,
        ctrlKey: false,
      });
      const picker = await within(document.body).findByRole("menu");
      expect(within(picker).queryByRole("menuitemradio", { name: "Home Lab" })).toBeNull();
      expect(within(picker).getByRole("menuitemradio", { name: /^Work$/ })).toBeDefined();
      for (const slot of slots) {
        expect(slot.inspection.navigateCalls).toEqual([]);
        expect(
          slot.inspection.sdkCalls.filter((call) =>
            /^(projects\.(create|update|delete)|threads\.(delete|archive|stop)|files\.)/.test(
              call.method,
            ),
          ),
        ).toEqual([]);
      }
    } finally {
      cleanup();
      await harness.lifecycle.dispose();
      await rm(workspaceDirectory, { recursive: true, force: true });
    }
  });

  it.each([null, "Purple"])(
    "persists and refreshes project name/color with palette choice %s without changing routes, identity or BB workspace",
    async (choice) => {
      const { bb, harness } = createFakePluginHost({
        pluginId: "tasks-project-settings-integration",
      });
      const slots: RenderedSlot[] = [];
      const workspace = { id: "proj_fixture", name: "Unchanged BB workspace", color: "red" };
      const originalWorkspace = { ...workspace };
      try {
        const store = createStore(bb);
        registerTasksApi(bb, store);
        const folder = store.tasks.createFolder({ name: "Fixture folder" });
        const project = store.tasks.createProject({
          name: "Home Lab",
          prefix: "HOME",
          color: "#aBbCcD",
          folderId: folder.id,
          linkedBbProjectId: workspace.id,
        });
        const task = store.tasks.createTask({ projectId: project.id, title: "Fixture task" });
        const original = store.tasks.getProject(project.id)!;
        const expectedColor = choice === null ? original.color : "mediumpurple";
        const rpc = Object.fromEntries(
          Object.keys(tasksRpcContract).map((method) => [
            method,
            async (raw: unknown) => {
              const before = harness.inspection.realtimeSignals.length;
              const result = await harness.behavior.callRpc(method, raw ?? null);
              // Deliver only real backend publications, before returning the response,
              // to exercise the supported event-before-response ordering.
              const events = harness.inspection.realtimeSignals.slice(before);
              for (const event of events) {
                if (event.channel === "projects:changed") {
                  for (const slot of slots)
                    await slot.behavior.emitRealtime(event.channel, event.payload);
                }
              }
              return result;
            },
          ]),
        );
        const options = { rpc, context: { projectId: workspace.id } };
        const editor = renderSlot(app.navPanels[0]!, { subPath: "manage" }, options);
        slots.push(editor);
        const browse = renderSlot(
          app.navPanels[0]!,
          { subPath: `${project.id}?view=list` },
          options,
        );
        slots.push(browse);
        await browse.findByRole("button", { name: "Project: Home Lab" });
        await browse.findByRole("button", { name: `Open ${task.key}: Fixture task` });
        fireEvent.mouseDown(editor.getByRole("tab", { name: "Projects" }));
        const input = await editor.findByRole("textbox", { name: "Project name for HOME" });
        if (choice !== null) {
          fireEvent.click(editor.getByRole("button", { name: "Colour for HOME: #aBbCcD" }));
          const palette = await within(document.body).findByRole("radiogroup", { name: "Color" });
          fireEvent.click(within(palette).getByRole("radio", { name: choice }));
        }
        fireEvent.change(input, { target: { value: "  Updated project  " } });
        fireEvent.click(editor.getByRole("button", { name: "Save HOME" }));
        await waitFor(() => expect(input).toHaveProperty("value", "Updated project"));
        const trigger = await browse.findByRole("button", { name: "Project: Updated project" });
        expect(browse.queryByRole("button", { name: "Project: Home Lab" })).toBeNull();
        expect(
          trigger.querySelector('[style*="background-color"]')?.getAttribute("style"),
        ).toContain(choice === null ? "rgb(171, 188, 205)" : "mediumpurple");
        expect(
          editor.inspection.rpcCalls.filter((call) => call.method === "updateProject"),
        ).toEqual([
          {
            method: "updateProject",
            input: { projectId: project.id, name: "Updated project", color: expectedColor },
          },
        ]);
        expect(
          harness.inspection.realtimeSignals.filter(
            (event) => event.channel === "projects:changed",
          ),
        ).toHaveLength(1);
        expect(
          harness.inspection.realtimeSignals.find((event) => event.channel === "projects:changed")
            ?.payload,
        ).toMatchObject({ projectId: project.id });
        // Reconstruct a reader over real temporary SQLite, not the edited React
        // state or a mocked array. It must see the persisted name and identity.
        const persisted = createTasksStore(bb.storage.database());
        expect(persisted.getProject(project.id)).toEqual({
          ...original,
          name: "Updated project",
          color: expectedColor,
        });
        expect(persisted.getTask(task.id)).toEqual(task);
        expect(persisted.getFolder(folder.id)).toEqual(folder);
        expect(workspace).toEqual(originalWorkspace);
        expect(
          harness.inspection.sdk.calls.filter((call) =>
            /^projects\.(update|delete|create)/.test(call.path),
          ),
        ).toEqual([]);
        for (const slot of slots) {
          expect(slot.inspection.navigateCalls).toEqual([]);
          expect(
            slot.inspection.sdkCalls.filter((call) =>
              /^projects\.(update|delete|create)/.test(call.method),
            ),
          ).toEqual([]);
        }
        expect(
          browse.getByRole("button", { name: `Open ${task.key}: Fixture task` }),
        ).toBeDefined();
      } finally {
        cleanup();
        await harness.lifecycle.dispose();
      }
    },
  );
});
