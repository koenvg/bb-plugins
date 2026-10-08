// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { app, PROJECT_ID, project } from "./manage.test-support.js";

const { derivePrefix } = await import("./shared.js");

afterEach(cleanup);

describe("derivePrefix", () => {
  it("suggests initials for multi-word names and letters otherwise", () => {
    expect(derivePrefix("Tasks Plugin")).toBe("TP");
    expect(derivePrefix("Connect")).toBe("CON");
    expect(derivePrefix("home-lab v2")).toBe("HLV");
    expect(derivePrefix("2fa Rollout")).toBe("R");
    expect(derivePrefix("123")).toBe("");
    expect(derivePrefix("a b c d e f g h i j k l")).toHaveLength(10);
  });
});

describe("NewProjectDialog", () => {
  function renderEmptyState(overrides: Record<string, unknown> = {}) {
    return renderSlot(
      app.navPanels[0]!,
      { subPath: "" },
      {
        rpc: {
          listProjects: () => ({ projects: [] }),
          listFolders: () => ({ folders: [] }),
          listPresets: () => ({ presets: [] }),
          sidebarSummary: () => ({ projects: [] }),
          listTasks: () => ({ tasks: [] }),
          ...overrides,
        },
      },
    );
  }

  it("derives the prefix from the name and creates the project", async () => {
    const createCalls: Array<Record<string, unknown>> = [];
    const slot = renderEmptyState({
      createProject: (input: Record<string, unknown>) => {
        createCalls.push(input);
        return { project: { ...project, ...input, id: PROJECT_ID } };
      },
    });
    fireEvent.click(
      await within(slot.getByRole("banner")).findByRole("button", {
        name: "New project",
      }),
    );
    fireEvent.change(await slot.findByPlaceholderText("e.g. Tasks Plugin"), {
      target: { value: "Home Lab" },
    });
    expect((slot.getByPlaceholderText("TSK") as HTMLInputElement).value).toBe("HL");
    fireEvent.click(slot.getByRole("button", { name: "Create project" }));
    await waitFor(() => expect(createCalls).toHaveLength(1));
    expect(createCalls[0]).toMatchObject({
      name: "Home Lab",
      prefix: "HL",
      folderId: null,
      linkedBbProjectId: null,
    });
    await waitFor(() =>
      expect(slot.navigateCalls).toContainEqual({
        method: "toPluginPanel",
        path: "tasks",
        options: { subPath: PROJECT_ID },
      }),
    );
  });

  it("flags malformed prefixes before submit", async () => {
    const slot = renderEmptyState();
    fireEvent.click(
      await within(slot.getByRole("banner")).findByRole("button", {
        name: "New project",
      }),
    );
    const prefix = slot.getByPlaceholderText("TSK");
    fireEvent.change(prefix, { target: { value: "9x" } });
    expect((prefix as HTMLInputElement).value).toBe("9X");
    await slot.findByText("Use 1–10 uppercase letters and digits, starting with a letter.");
    expect(
      (
        slot.getByRole("button", {
          name: "Create project",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("links the personal project from the discovered project picker", async () => {
    const createCalls: Array<Record<string, unknown>> = [];
    const slot = renderEmptyState({
      listBbProjects: () => ({
        bbProjects: [{ id: "proj_personal", name: "Personal" }],
      }),
      createProject: (input: Record<string, unknown>) => {
        createCalls.push(input);
        return { project: { ...project, ...input, id: PROJECT_ID } };
      },
    });
    fireEvent.click(
      await within(slot.getByRole("banner")).findByRole("button", {
        name: "New project",
      }),
    );
    fireEvent.change(await slot.findByPlaceholderText("e.g. Tasks Plugin"), {
      target: { value: "Personal Tasks" },
    });
    fireEvent.click(slot.getByLabelText("Linked bb project"));
    fireEvent.click(await slot.findByRole("option", { name: "Personal" }));
    fireEvent.click(slot.getByRole("button", { name: "Create project" }));

    await waitFor(() => expect(createCalls).toHaveLength(1));
    expect(createCalls[0]).toMatchObject({
      linkedBbProjectId: "proj_personal",
    });
    expect(slot.queryByPlaceholderText("proj_…")).toBeNull();
  });
});
