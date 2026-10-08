// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { renderSlot, type RenderedSlot } from "@get-bb/plugin-sdk/testing/app";
import { describe, expect, it } from "vitest";
import { createStore, registerTasksApi } from "../../api/index.js";
import { createTasksStore } from "../../db/index.js";
import { tasksRpcContract } from "../../shared/contract.js";
import { app } from "./manage.test-support.js";

describe("production project table persistence and consumer refresh", () => {
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
