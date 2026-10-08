// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { rpcInput } from "../../test-fixtures.js";
import { app, createdTask, PROJECT_ID, project } from "./manage.test-support.js";

afterEach(cleanup);

describe("NewTaskDialog", () => {
  it.each([
    {
      name: "Ctrl+Enter in title",
      field: "Task title",
      ctrlKey: true,
      metaKey: false,
    },
    {
      name: "Meta+Enter in title",
      field: "Task title",
      ctrlKey: false,
      metaKey: true,
    },
    {
      name: "Enter in title",
      field: "Task title",
      ctrlKey: false,
      metaKey: false,
    },
    {
      name: "Ctrl+Enter in due date",
      field: "Due date",
      ctrlKey: true,
      metaKey: false,
    },
  ])("submits exactly once for $name", async ({ field, ctrlKey, metaKey }) => {
    const createCalls: Array<Record<string, unknown>> = [];
    const slot = renderSlot(
      app.navPanels[0]!,
      { subPath: PROJECT_ID },
      {
        rpc: {
          listProjects: () => ({ projects: [project] }),
          listFolders: () => ({ folders: [] }),
          listPresets: () => ({ presets: [] }),
          sidebarSummary: () => ({ projects: [] }),
          listTasks: () => ({ tasks: [] }),
          listLabels: () => ({ labels: [] }),
          createTask: (raw: unknown) => {
            const input = rpcInput(raw);
            createCalls.push(input);
            return { ok: true, task: createdTask(input) };
          },
        },
      },
    );
    fireEvent.click(await slot.findByRole("button", { name: /New task/ }));
    fireEvent.change(await slot.findByLabelText("Task title"), {
      target: { value: "Keyboard submission" },
    });
    fireEvent.keyDown(slot.getByLabelText(field), {
      key: "Enter",
      ctrlKey,
      metaKey,
    });
    await waitFor(() => expect(slot.navigateCalls).not.toHaveLength(0));
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]).toMatchObject({ title: "Keyboard submission" });
  });

  it("creates a task in the route's project with column defaults and navigates to it", async () => {
    const createCalls: Array<Record<string, unknown>> = [];
    const slot = renderSlot(
      app.navPanels[0]!,
      { subPath: PROJECT_ID },
      {
        rpc: {
          listProjects: () => ({ projects: [project] }),
          listFolders: () => ({ folders: [] }),
          listPresets: () => ({ presets: [] }),
          sidebarSummary: () => ({ projects: [] }),
          listTasks: () => ({ tasks: [] }),
          listLabels: () => ({ labels: [] }),
          createTask: (raw: unknown) => {
            const input = rpcInput(raw);
            createCalls.push(input);
            return { ok: true, task: createdTask(input) };
          },
        },
      },
    );
    fireEvent.click(await slot.findByRole("button", { name: /New task/ }));
    const title = await slot.findByLabelText("Task title");
    fireEvent.change(title, { target: { value: "  Ship the dialog  " } });
    fireEvent.click(slot.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(createCalls).toHaveLength(1));
    expect(createCalls[0]).toMatchObject({
      projectId: PROJECT_ID,
      title: "Ship the dialog",
      status: "todo",
      priority: "none",
      dueDate: null,
      parentTaskId: null,
      labelIds: [],
    });
    await waitFor(() =>
      expect(slot.navigateCalls).toContainEqual({
        method: "toPluginPanel",
        path: "tasks",
        options: { subPath: "task/TSK-5" },
      }),
    );
  });

  it("keeps the dialog open and clears the draft when Create more is on", async () => {
    const createCalls: Array<Record<string, unknown>> = [];
    const slot = renderSlot(
      app.navPanels[0]!,
      { subPath: PROJECT_ID },
      {
        rpc: {
          listProjects: () => ({ projects: [project] }),
          listFolders: () => ({ folders: [] }),
          listPresets: () => ({ presets: [] }),
          sidebarSummary: () => ({ projects: [] }),
          listTasks: () => ({ tasks: [] }),
          listLabels: () => ({ labels: [] }),
          createTask: (raw: unknown) => {
            const input = rpcInput(raw);
            createCalls.push(input);
            return { ok: true, task: createdTask(input) };
          },
        },
      },
    );
    fireEvent.click(await slot.findByRole("button", { name: /New task/ }));
    fireEvent.click(await slot.findByRole("checkbox", { name: "Create more" }));
    const title = await slot.findByLabelText("Task title");
    fireEvent.change(title, { target: { value: "First" } });
    fireEvent.click(slot.getByRole("button", { name: "Create task" }));
    await waitFor(() => expect(createCalls).toHaveLength(1));
    expect((slot.getByLabelText("Task title") as HTMLInputElement).value).toBe("");
    expect(slot.navigateCalls).toEqual([]);
  });

  it("surfaces domain errors returned by createTask", async () => {
    const slot = renderSlot(
      app.navPanels[0]!,
      { subPath: PROJECT_ID },
      {
        rpc: {
          listProjects: () => ({ projects: [project] }),
          listFolders: () => ({ folders: [] }),
          listPresets: () => ({ presets: [] }),
          sidebarSummary: () => ({ projects: [] }),
          listTasks: () => ({ tasks: [] }),
          listLabels: () => ({ labels: [] }),
          createTask: () => ({
            ok: false,
            error: {
              code: "subtask_depth_exceeded",
              message: "Sub-tasks cannot have their own sub-tasks",
            },
          }),
        },
      },
    );
    fireEvent.click(await slot.findByRole("button", { name: /New task/ }));
    fireEvent.change(await slot.findByLabelText("Task title"), {
      target: { value: "Nested" },
    });
    fireEvent.click(slot.getByRole("button", { name: "Create task" }));
    await slot.findByText("Sub-tasks cannot have their own sub-tasks");
    expect(slot.getByLabelText("Task title")).toBeDefined();
  });

  it("offers a compact create-label action when the query matches no label", async () => {
    const createLabelCalls: Array<Record<string, unknown>> = [];
    const slot = renderSlot(
      app.navPanels[0]!,
      { subPath: PROJECT_ID },
      {
        rpc: {
          listProjects: () => ({ projects: [project] }),
          listFolders: () => ({ folders: [] }),
          listPresets: () => ({ presets: [] }),
          sidebarSummary: () => ({ projects: [] }),
          listTasks: () => ({ tasks: [] }),
          listLabels: () => ({
            labels: [
              {
                id: "01HLABELDOCS0000000000000",
                projectId: PROJECT_ID,
                name: "docs",
                color: "#888",
              },
            ],
          }),
          createLabel: (raw: unknown) => {
            const input = rpcInput(raw);
            createLabelCalls.push(input);
            return {
              label: {
                id: "01HLABELNEW00000000000000",
                projectId: PROJECT_ID,
                name: input.name,
                color: input.color,
              },
            };
          },
        },
      },
    );
    fireEvent.click(await slot.findByRole("button", { name: /New task/ }));
    fireEvent.click(await slot.findByRole("button", { name: /Labels/ }));
    const search = await slot.findByPlaceholderText("Add labels…");
    fireEvent.change(search, { target: { value: "  dank  " } });

    const createBtn = await slot.findByRole("button", {
      name: /Create .*dank/,
    });
    const emptyContainer = createBtn.closest("[cmdk-empty]");
    expect(emptyContainer).not.toBeNull();

    fireEvent.click(createBtn);
    await waitFor(() => expect(createLabelCalls).toHaveLength(1));
    expect(createLabelCalls[0]).toMatchObject({
      projectId: PROJECT_ID,
      name: "dank",
    });
  });
});
