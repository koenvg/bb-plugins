// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { rpcInput } from "../../test-fixtures.js";
import { app, PROJECT_ID, project } from "./manage.test-support.js";

afterEach(cleanup);

describe("Manage folders", () => {
  const parentFolder = {
    id: "01HZZZZZZZZZZZZZZZZZZZZZF1",
    name: "bb",
    parentFolderId: null,
    createdAt: "2026-07-15T00:00:00.000Z",
  };
  const childFolder = {
    id: "01HZZZZZZZZZZZZZZZZZZZZZF2",
    name: "archive",
    parentFolderId: parentFolder.id,
    createdAt: "2026-07-15T00:00:00.000Z",
  };

  function renderFolders(overrides: Record<string, unknown> = {}) {
    return renderSlot(
      app.navPanels[0]!,
      { subPath: "manage" },
      {
        rpc: {
          listProjects: () => ({
            projects: [{ ...project, folderId: parentFolder.id }],
          }),
          listFolders: () => ({ folders: [parentFolder, childFolder] }),
          listPresets: () => ({ presets: [] }),
          sidebarSummary: () => ({ projects: [] }),
          listTasks: () => ({ tasks: [] }),
          listLabels: () => ({ labels: [] }),
          ...overrides,
        },
      },
    );
  }

  it.each(["button", "Enter"])(
    "keeps the rename editor and draft after a rejected save and closes it after retry via %s",
    async (submitWith) => {
      const renameCalls: Array<Record<string, unknown>> = [];
      const slot = renderFolders({
        renameFolder: async (raw: unknown) => {
          const input = rpcInput(raw);
          renameCalls.push(input);
          if (renameCalls.length === 1) throw new Error("Folder rename unavailable");
          return { folder: { ...parentFolder, name: input.name } };
        },
      });
      fireEvent.mouseDown(await slot.findByRole("tab", { name: "Folders" }));
      fireEvent.click(await slot.findByRole("button", { name: "Rename folder bb" }));
      const panel = within(slot.getByRole("tabpanel"));
      fireEvent.change(panel.getByRole("textbox"), { target: { value: "  Planning  " } });
      const submit = () => {
        if (submitWith === "Enter") fireEvent.keyDown(panel.getByRole("textbox"), { key: "Enter" });
        else fireEvent.click(panel.getByRole("button", { name: "Save" }));
      };

      submit();
      expect((await panel.findByRole("alert")).textContent).toBe("Folder rename unavailable");
      expect(panel.getByRole("textbox")).toHaveProperty("value", "  Planning  ");
      expect(panel.getByRole("button", { name: "Save" })).toHaveProperty("disabled", false);
      expect(panel.getByRole("button", { name: "Cancel" })).toBeDefined();

      submit();
      await waitFor(() => expect(panel.queryByRole("textbox")).toBeNull());
      expect(panel.queryByRole("button", { name: "Save" })).toBeNull();
      expect(panel.queryByRole("alert")).toBeNull();
      expect(panel.getByRole("button", { name: "Rename folder bb" })).toBeDefined();
      expect(renameCalls).toEqual([
        { folderId: parentFolder.id, name: "Planning" },
        { folderId: parentFolder.id, name: "Planning" },
      ]);
    },
  );

  it("deletes a folder after naming what the delete unfiles", async () => {
    const deleteCalls: Array<Record<string, unknown>> = [];
    const slot = renderFolders({
      deleteFolder: (input: Record<string, unknown>) => {
        deleteCalls.push(input);
        return {
          deleted: true,
          movedProjectIds: [PROJECT_ID],
          movedFolderIds: [childFolder.id],
        };
      },
    });
    fireEvent.mouseDown(await slot.findByRole("tab", { name: "Folders" }));
    fireEvent.click(await slot.findByRole("button", { name: "Delete folder bb" }));

    await slot.findByText("1 project and 1 subfolder move to the top level. No tasks are deleted.");
    fireEvent.click(slot.getByRole("button", { name: "Delete folder" }));
    await waitFor(() => expect(deleteCalls).toHaveLength(1));
    expect(deleteCalls[0]).toMatchObject({ folderId: parentFolder.id });
  });

  it("withholds the delete impact until the project list has loaded", async () => {
    let releaseProjects: (() => void) | undefined;
    const projectsLoaded = new Promise<void>((resolve) => {
      releaseProjects = resolve;
    });
    const deleteCalls: Array<Record<string, unknown>> = [];
    const slot = renderFolders({
      listProjects: async () => {
        await projectsLoaded;
        return { projects: [{ ...project, folderId: parentFolder.id }] };
      },
      deleteFolder: (input: Record<string, unknown>) => {
        deleteCalls.push(input);
        return {
          deleted: true,
          movedProjectIds: [PROJECT_ID],
          movedFolderIds: [childFolder.id],
        };
      },
    });
    fireEvent.mouseDown(await slot.findByRole("tab", { name: "Folders" }));
    fireEvent.click(await slot.findByRole("button", { name: "Delete folder bb" }));

    await slot.findByText("Checking what the folder contains…");
    expect(slot.queryByText(/The folder is empty/)).toBeNull();
    const confirm = slot.getByRole("button", { name: "Delete folder" });
    expect(confirm).toHaveProperty("disabled", true);
    fireEvent.click(confirm);
    expect(deleteCalls).toHaveLength(0);

    releaseProjects!();
    await slot.findByText("1 project and 1 subfolder move to the top level. No tasks are deleted.");
    await waitFor(() =>
      expect(slot.getByRole("button", { name: "Delete folder" })).toHaveProperty("disabled", false),
    );
    fireEvent.click(slot.getByRole("button", { name: "Delete folder" }));
    await waitFor(() => expect(deleteCalls).toHaveLength(1));
  });

  it("reports a failed project load instead of an empty folder", async () => {
    const slot = renderFolders({
      listProjects: () => {
        throw new Error("projects unavailable");
      },
    });
    fireEvent.mouseDown(await slot.findByRole("tab", { name: "Folders" }));
    fireEvent.click(await slot.findByRole("button", { name: "Delete folder bb" }));
    await slot.findByText("Could not load the folder's contents: projects unavailable");
    expect(slot.getByRole("button", { name: "Delete folder" })).toHaveProperty("disabled", true);
  });

  it("blocks deleting on stale rows after a refresh fails", async () => {
    let projectsUnavailable = false;
    const deleteCalls: Array<Record<string, unknown>> = [];
    const slot = renderFolders({
      listProjects: () => {
        if (projectsUnavailable) throw new Error("projects unavailable");
        return { projects: [{ ...project, folderId: parentFolder.id }] };
      },
      deleteFolder: (input: Record<string, unknown>) => {
        deleteCalls.push(input);
        return { deleted: true, movedProjectIds: [], movedFolderIds: [] };
      },
    });
    fireEvent.mouseDown(await slot.findByRole("tab", { name: "Folders" }));
    fireEvent.click(await slot.findByRole("button", { name: "Delete folder bb" }));
    await slot.findByText("1 project and 1 subfolder move to the top level. No tasks are deleted.");
    fireEvent.click(slot.getByRole("button", { name: "Cancel" }));

    projectsUnavailable = true;
    await slot.behavior.emitRealtime("projects:changed", {
      projectId: PROJECT_ID,
    });
    fireEvent.click(await slot.findByRole("button", { name: "Delete folder bb" }));
    await slot.findByText("Could not load the folder's contents: projects unavailable");
    expect(slot.queryByText(/move to the top level/)).toBeNull();
    const confirm = slot.getByRole("button", { name: "Delete folder" });
    expect(confirm).toHaveProperty("disabled", true);
    fireEvent.click(confirm);
    expect(deleteCalls).toHaveLength(0);
  });

  it("surfaces a failed delete instead of silently closing", async () => {
    const slot = renderFolders({
      deleteFolder: () => {
        throw new Error("Folder not found");
      },
    });
    fireEvent.mouseDown(await slot.findByRole("tab", { name: "Folders" }));
    fireEvent.click(await slot.findByRole("button", { name: "Delete folder archive" }));
    await slot.findByText("The folder is empty.");
    fireEvent.click(slot.getByRole("button", { name: "Delete folder" }));
    await slot.findByRole("alert");
  });

  it("treats deleted: false as a conflict and refetches", async () => {
    let folderCalls = 0;
    const slot = renderFolders({
      listFolders: () => {
        folderCalls += 1;
        return { folders: [parentFolder, childFolder] };
      },
      deleteFolder: () => ({
        deleted: false,
        movedProjectIds: [],
        movedFolderIds: [],
      }),
    });
    fireEvent.mouseDown(await slot.findByRole("tab", { name: "Folders" }));
    fireEvent.click(await slot.findByRole("button", { name: "Delete folder archive" }));
    await slot.findByText("The folder is empty.");
    const callsBeforeDelete = folderCalls;
    fireEvent.click(slot.getByRole("button", { name: "Delete folder" }));
    const alert = await slot.findByRole("alert");
    expect(alert.textContent).toBe("Folder “archive” was already deleted.");
    await waitFor(() => expect(folderCalls).toBeGreaterThan(callsBeforeDelete));
  });
});
