// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Project } from "../../shared/contract.js";
import { rpcInput } from "../../test-fixtures.js";
import { app, project } from "./manage.test-support.js";

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fixtures(): Project[] {
  return [
    {
      ...project,
      name: "Home Lab",
      prefix: "HOME",
      color: "#aBbCcD",
      folderId: "folder-fixture",
      linkedBbProjectId: "proj_fixture",
    },
    {
      ...project,
      id: "01HZZZZZZZZZZZZZZZZZZZZZP2",
      name: "Home Lab",
      prefix: "WORK",
      color: "steelblue",
    },
  ];
}

function setup(initial = fixtures()) {
  let rows = initial;
  const calls: Record<string, unknown>[] = [];
  const deleteCalls: Record<string, unknown>[] = [];
  let list: () => { projects: Project[] } | Promise<{ projects: Project[] }> = () => ({
    projects: rows.map((row) => ({ ...row })),
  });
  let update: (
    input: Record<string, unknown>,
  ) => { project: Project } | Promise<{ project: Project }> = (input) => {
    const saved = {
      ...rows.find((row) => row.id === input.projectId)!,
      name: String(input.name),
      color: String(input.color),
    };
    rows = rows.map((row) => (row.id === saved.id ? saved : row));
    return { project: saved };
  };
  const slot = renderSlot(
    app.navPanels[0]!,
    { subPath: "manage" },
    {
      rpc: {
        listProjects: () => list(),
        listFolders: () => ({ folders: [] }),
        listPresets: () => ({ presets: [] }),
        listLabels: () => ({ labels: [] }),
        listTasks: () => ({ tasks: [] }),
        deleteProject: (raw: unknown) => {
          const input = rpcInput(raw);
          deleteCalls.push(input);
          rows = rows.filter((row) => row.id !== input.projectId);
          return { ok: true, deleted: true };
        },
        sidebarSummary: () => ({ projects: [] }),
        updateProject: (raw: unknown) => {
          const input = rpcInput(raw);
          calls.push(input);
          return update(input);
        },
      },
    },
  );
  return {
    slot,
    calls,
    deleteCalls,
    setRows: (next: Project[]) => {
      rows = next;
    },
    setList: (next: typeof list) => {
      list = next;
    },
    setUpdate: (next: typeof update) => {
      update = next;
    },
    getRows: () => rows,
  };
}

function openProjects(slot: ReturnType<typeof setup>["slot"]) {
  fireEvent.mouseDown(slot.getByRole("tab", { name: "Projects" }));
}

async function loaded(env: ReturnType<typeof setup>) {
  openProjects(env.slot);
  return env.slot.findByRole("textbox", { name: "Project name for HOME" });
}

async function ready(env: ReturnType<typeof setup>) {
  await waitFor(() =>
    expect(env.slot.getByRole("table", { name: "Projects" }).getAttribute("aria-busy")).toBe(
      "false",
    ),
  );
}

async function changeInventory(env: ReturnType<typeof setup>, rows: Project[]) {
  env.setRows(rows);
  await env.slot.emitRealtime("projects:changed", {});
  await ready(env);
}

async function chooseColor(env: ReturnType<typeof setup>, prefix: string, label: string) {
  fireEvent.click(env.slot.getByRole("button", { name: new RegExp(`^Colour for ${prefix}:`) }));
  const palette = await within(document.body).findByRole("radiogroup", { name: "Color" });
  fireEvent.click(within(palette).getByRole("radio", { name: label }));
  await waitFor(() => expect(palette.isConnected).toBe(false));
}
describe("Manage production project table", () => {
  it("opens confirmation for saved identity, cancels safely and restores focus without losing drafts", async () => {
    const env = setup();
    const home = await loaded(env);
    const work = env.slot.getByRole("textbox", { name: "Project name for WORK" });
    fireEvent.change(home, { target: { value: "Unsaved home" } });
    fireEvent.change(work, { target: { value: "Unsaved work" } });
    const trigger = env.slot.getByRole("button", { name: "Delete HOME" });
    for (const dismissal of ["cancel", "escape"]) {
      fireEvent.click(trigger);
      const dialog = await within(document.body).findByRole("dialog", {
        name: "Delete Home Lab (HOME)?",
      });
      const cancel = within(dialog).getByRole("button", { name: "Cancel" });
      await waitFor(() => expect(document.activeElement).toBe(cancel));
      const description = document.getElementById(dialog.getAttribute("aria-describedby")!);
      expect(description?.className).toContain("text-sm");
      expect(description?.querySelector('[role="status"]')).not.toBeNull();
      expect(description?.textContent).toContain(
        "BB workspaces, threads and files remain unchanged.",
      );
      expect(
        within(dialog).getByText(/BB workspaces, threads and files remain unchanged/),
      ).toBeDefined();
      if (dismissal === "cancel") fireEvent.click(cancel);
      else fireEvent.keyDown(dialog, { key: "Escape" });
      await waitFor(() => expect(within(document.body).queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    }
    expect(home).toHaveProperty("value", "Unsaved home");
    expect(work).toHaveProperty("value", "Unsaved work");
    expect(env.calls).toEqual([]);
    expect(env.deleteCalls).toEqual([]);
  });

  it("requires an exact prefix and known zero count before explicit deletion, then removes only that row", async () => {
    const env = setup();
    await loaded(env);
    const work = env.slot.getByRole("textbox", { name: "Project name for WORK" });
    fireEvent.change(work, { target: { value: "Keep this draft" } });
    fireEvent.click(env.slot.getByRole("button", { name: "Delete HOME" }));
    const dialog = await within(document.body).findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getByRole("status").textContent).toBe(
        "Delete this project and all 0 tasks? This cannot be undone.",
      ),
    );
    const prefix = within(dialog).getByRole("textbox", { name: "Type HOME to confirm" });
    const button = within(dialog).getByRole("button", { name: "Delete project and tasks" });
    for (const value of ["", "home", "WORK", " HOME", "HOME "]) {
      fireEvent.change(prefix, { target: { value } });
      expect(button).toHaveProperty("disabled", true);
    }
    fireEvent.change(prefix, { target: { value: "HOME" } });
    expect(button).toHaveProperty("disabled", false);
    expect(env.deleteCalls).toEqual([]);
    fireEvent.click(button);
    await waitFor(() =>
      expect(env.slot.queryByRole("textbox", { name: "Project name for HOME" })).toBeNull(),
    );
    expect(env.deleteCalls).toEqual([{ projectId: project.id, force: true }]);
    expect(work).toHaveProperty("value", "Keep this draft");
    await waitFor(() =>
      expect(document.activeElement).toBe(env.slot.getByRole("heading", { name: "Projects" })),
    );
    expect(env.slot.getByText(/Deleted Home Lab/)).toBeDefined();
  });

  it("uses named icon actions and keeps the existing Save/Cancel behaviour", async () => {
    const env = setup();
    const input = await loaded(env);
    for (const name of ["Save HOME", "Cancel HOME", "Delete HOME"]) {
      const button = env.slot.getByRole("button", { name });
      expect(button.querySelector("svg")).not.toBeNull();
      expect(button.textContent).toBe("");
      expect(button.className).toContain("h-9 w-9");
    }
    expect(
      (env.slot.getByRole("button", { name: "Save HOME" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(input, { target: { value: "Local draft" } });
    fireEvent.click(env.slot.getByRole("button", { name: "Cancel HOME" }));
    expect((input as HTMLInputElement).value).toBe("Home Lab");
    fireEvent.change(input, { target: { value: "Saved name" } });
    fireEvent.click(env.slot.getByRole("button", { name: "Save HOME" }));
    await waitFor(() => expect(env.calls).toHaveLength(1));
    expect(env.calls[0]?.name).toBe("Saved name");
    fireEvent.keyDown(document, { key: "Tab" });
    fireEvent.focus(env.slot.getByRole("button", { name: "Cancel HOME" }));
    expect((await within(document.body).findByRole("tooltip")).textContent).toBe("Cancel HOME");
  });

  it("offers the existing named palette without replacing custom colours until an explicit choice", async () => {
    const env = setup();
    await loaded(env);
    fireEvent.click(env.slot.getByRole("button", { name: "Colour for HOME: #aBbCcD" }));
    const palette = await within(document.body).findByRole("radiogroup", { name: "Color" });
    const choices = within(palette).getAllByRole("radio");
    expect(choices.map((choice) => choice.getAttribute("aria-label"))).toEqual([
      "Indigo",
      "Blue",
      "Teal",
      "Green",
      "Yellow",
      "Orange",
      "Red",
      "Pink",
      "Purple",
      "Gray",
    ]);
    expect(choices.every((choice) => choice.getAttribute("aria-checked") === "false")).toBe(true);
    expect(env.calls).toEqual([]);
    fireEvent.click(within(palette).getByRole("radio", { name: "Purple" }));
    expect(env.slot.getByRole("button", { name: "Colour for HOME: Purple" })).toBeDefined();
    expect(env.calls).toEqual([]);
    fireEvent.click(env.slot.getByRole("button", { name: "Save HOME" }));
    await waitFor(() => expect(env.calls).toHaveLength(1));
    expect(env.calls[0]).toEqual({
      projectId: project.id,
      name: "Home Lab",
      color: "mediumpurple",
    });
    await waitFor(() =>
      expect(env.slot.getByRole("button", { name: "Save HOME" })).toHaveProperty("disabled", true),
    );
    fireEvent.click(env.slot.getByRole("button", { name: "Colour for HOME: Purple" }));
    const savedPalette = await within(document.body).findByRole("radiogroup", { name: "Color" });
    expect(
      within(savedPalette).getByRole("radio", { name: "Purple" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      within(savedPalette).getByRole("radio", { name: "Blue" }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(within(savedPalette).getAllByRole("radio")).toHaveLength(10);
    expect(env.calls).toHaveLength(1);
  });

  it("keeps both row drafts independent and cancels only the chosen row", async () => {
    const env = setup();
    const home = await loaded(env);
    await chooseColor(env, "WORK", "Blue");
    expect(env.slot.getByRole("button", { name: "Save WORK" })).toHaveProperty("disabled", true);
    const work = env.slot.getByRole("textbox", { name: "Project name for WORK" });
    fireEvent.change(home, { target: { value: "Local HOME" } });
    fireEvent.change(work, { target: { value: "Local WORK" } });
    await chooseColor(env, "HOME", "Purple");
    await chooseColor(env, "WORK", "Green");
    fireEvent.click(env.slot.getByRole("button", { name: "Cancel HOME" }));
    expect(home).toHaveProperty("value", "Home Lab");
    expect(env.slot.getByRole("button", { name: "Colour for HOME: #aBbCcD" })).toBeDefined();
    expect(work).toHaveProperty("value", "Local WORK");
    expect(env.slot.getByRole("button", { name: "Colour for WORK: Green" })).toBeDefined();
    expect(env.calls).toEqual([]);
    expect(env.slot.navigateCalls).toEqual([]);
  });

  it("locks colour controls table-wide and retains both failed fields for a combined retry", async () => {
    const env = setup();
    const home = await loaded(env);
    fireEvent.change(home, { target: { value: "  Combined HOME  " } });
    await chooseColor(env, "HOME", "Purple");
    await chooseColor(env, "WORK", "Green");
    fireEvent.click(env.slot.getByRole("button", { name: "Colour for WORK: Green" }));
    const openPalette = await within(document.body).findByRole("radiogroup", { name: "Color" });
    const blockedChoice = within(openPalette).getByRole("radio", { name: "Red" });
    const request = deferred<{ project: Project }>();
    env.setUpdate(() => request.promise);
    act(() => {
      fireEvent.click(env.slot.getByRole("button", { name: "Save HOME" }));
      fireEvent.submit(home.closest("form")!);
      fireEvent.click(env.slot.getByRole("button", { name: "Save WORK" }));
      fireEvent.click(blockedChoice);
    });
    for (const prefix of ["HOME", "WORK"])
      expect(
        env.slot.getByRole("button", { name: new RegExp(`^Colour for ${prefix}:`) }),
      ).toHaveProperty("disabled", true);
    expect(env.calls).toEqual([
      { projectId: project.id, name: "Combined HOME", color: "mediumpurple" },
    ]);
    request.reject(new Error("Combined save unavailable"));
    await env.slot.findByRole("alert");
    expect(home).toHaveProperty("value", "  Combined HOME  ");
    expect(env.slot.getByRole("button", { name: "Colour for HOME: Purple" })).toBeDefined();
    expect(env.slot.getByRole("button", { name: "Colour for WORK: Green" })).toBeDefined();
    env.setUpdate(() => ({
      project: { ...fixtures()[0]!, name: "Returned HOME", color: "indianred" },
    }));
    fireEvent.click(env.slot.getByRole("button", { name: "Save HOME" }));
    await waitFor(() => expect(home).toHaveProperty("value", "Returned HOME"));
    expect(env.slot.getByRole("button", { name: "Colour for HOME: Red" })).toBeDefined();
    expect(env.slot.getByRole("button", { name: "Colour for WORK: Green" })).toBeDefined();
    expect(env.calls[1]).toEqual(env.calls[0]);
    expect(env.slot.queryByRole("alert")).toBeNull();
  });

  it("keeps Labels default, replaces selection with distinct rows and keeps row drafts independent", async () => {
    const env = setup();
    const { slot, calls } = env;
    expect(slot.getByRole("tab", { name: "Labels" }).getAttribute("aria-selected")).toBe("true");
    for (const name of ["Labels", "Presets", "Folders", "Projects"])
      expect(slot.getByRole("tab", { name })).toBeDefined();
    const home = await loaded(env);
    const work = slot.getByRole("textbox", { name: "Project name for WORK" });
    const panel = within(slot.getByRole("tabpanel"));
    expect(panel.getAllByRole("row")).toHaveLength(3);
    expect(panel.queryByRole("combobox")).toBeNull();
    expect(panel.queryByRole("radio")).toBeNull();
    expect(panel.getByRole("button", { name: "Colour for HOME: #aBbCcD" })).toBeDefined();
    expect(home).toHaveProperty("value", "Home Lab");
    expect(work).toHaveProperty("value", "Home Lab");
    fireEvent.change(home, { target: { value: "Unsaved HOME" } });
    fireEvent.change(work, { target: { value: "Unsaved WORK" } });
    fireEvent.blur(home);
    expect(calls).toEqual([]);
    fireEvent.click(slot.getByRole("button", { name: "Cancel HOME" }));
    expect(home).toHaveProperty("value", "Home Lab");
    expect(work).toHaveProperty("value", "Unsaved WORK");
    expect(calls).toEqual([]);
    expect(slot.navigateCalls).toEqual([]);
  });

  it("blocks blank and unchanged names and saves only the trimmed name and exact custom colour for the row identity", async () => {
    const env = setup();
    const home = await loaded(env);
    const save = env.slot.getByRole("button", { name: "Save HOME" });
    expect(save).toHaveProperty("disabled", true);
    for (const value of ["  Home Lab  ", "", "   "]) {
      fireEvent.change(home, { target: { value } });
      expect(save).toHaveProperty("disabled", true);
      fireEvent.submit(home.closest("form")!);
    }
    expect(env.calls).toEqual([]);
    expect(home.getAttribute("aria-invalid")).toBe("true");
    await chooseColor(env, "HOME", "Purple");
    expect(save).toHaveProperty("disabled", true);
    fireEvent.submit(home.closest("form")!);
    expect(env.calls).toEqual([]);
    fireEvent.click(env.slot.getByRole("button", { name: "Cancel HOME" }));
    fireEvent.change(home, { target: { value: "  Renamed  " } });
    fireEvent.submit(home.closest("form")!);
    await waitFor(() => expect(home).toHaveProperty("value", "Renamed"));
    expect(env.calls).toEqual([{ projectId: project.id, name: "Renamed", color: "#aBbCcD" }]);
    expect(env.getRows()[0]).toEqual({ ...fixtures()[0], name: "Renamed" });
    expect(save).toHaveProperty("disabled", true);
    expect(env.slot.getByRole("textbox", { name: "Project name for WORK" })).toHaveProperty(
      "value",
      "Home Lab",
    );
    expect(env.slot.navigateCalls).toEqual([]);
  });

  it("synchronously blocks repeated/cross-row saves, editing and Cancel, then retains a failed draft for manual retry", async () => {
    const env = setup();
    const home = await loaded(env);
    const work = env.slot.getByRole("textbox", { name: "Project name for WORK" });
    fireEvent.change(home, { target: { value: "Retry HOME" } });
    fireEvent.change(work, { target: { value: "Keep WORK" } });
    const request = deferred<{ project: Project }>();
    env.setUpdate(() => request.promise);
    act(() => {
      fireEvent.click(env.slot.getByRole("button", { name: "Save HOME" }));
      fireEvent.submit(home.closest("form")!);
      fireEvent.click(env.slot.getByRole("button", { name: "Save WORK" }));
      fireEvent.change(home, { target: { value: "Must not change" } });
      fireEvent.change(work, { target: { value: "Must not change" } });
      fireEvent.click(env.slot.getByRole("button", { name: "Cancel HOME" }));
      fireEvent.click(env.slot.getByRole("button", { name: "Cancel WORK" }));
    });
    await waitFor(() => expect(env.calls).toHaveLength(1));
    expect(home).toHaveProperty("value", "Retry HOME");
    expect(work).toHaveProperty("value", "Keep WORK");
    for (const input of [home, work]) expect(input).toHaveProperty("disabled", true);
    for (const name of ["Save HOME", "Save WORK", "Cancel HOME", "Cancel WORK"])
      expect(env.slot.getByRole("button", { name })).toHaveProperty("disabled", true);
    expect(env.slot.getByRole("button", { name: "Save HOME" }).getAttribute("aria-busy")).toBe(
      "true",
    );
    request.reject(new Error("Fixture save unavailable"));
    expect((await env.slot.findByRole("alert")).textContent).toBe(
      "Could not save HOME: Fixture save unavailable",
    );
    expect(home).toHaveProperty("value", "Retry HOME");
    expect(work).toHaveProperty("value", "Keep WORK");
    env.setUpdate(() => ({ project: { ...fixtures()[0]!, name: "Returned HOME" } }));
    fireEvent.click(env.slot.getByRole("button", { name: "Save HOME" }));
    await waitFor(() => expect(home).toHaveProperty("value", "Returned HOME"));
    expect(env.calls).toHaveLength(2);
    expect(env.calls[1]).toEqual(env.calls[0]);
    expect(env.slot.queryByRole("alert")).toBeNull();
    expect(env.slot.getByRole("button", { name: "Save HOME" })).toHaveProperty("disabled", true);
    expect(work).toHaveProperty("value", "Keep WORK");
  });

  it("updates clean rows on refresh, preserves dirty drafts and uses latest loaded values and colour on Cancel/save", async () => {
    const env = setup();
    const home = await loaded(env);
    const work = env.slot.getByRole("textbox", { name: "Project name for WORK" });
    fireEvent.change(home, { target: { value: "Local draft" } });
    await chooseColor(env, "HOME", "Purple");
    const rows = fixtures().map((row) => ({
      ...row,
      name: `Remote ${row.prefix}`,
      color: "#Ff00Aa",
    }));
    await changeInventory(env, rows);
    expect(home).toHaveProperty("value", "Local draft");
    expect(work).toHaveProperty("value", "Remote WORK");
    expect(env.slot.getByRole("button", { name: "Colour for HOME: Purple" })).toBeDefined();
    expect(env.slot.getByRole("button", { name: "Colour for WORK: #Ff00Aa" })).toBeDefined();
    fireEvent.click(env.slot.getByRole("button", { name: "Cancel HOME" }));
    expect(home).toHaveProperty("value", "Remote HOME");
    expect(env.slot.getByRole("button", { name: "Colour for HOME: #Ff00Aa" })).toBeDefined();
    expect(env.calls).toEqual([]);
    fireEvent.change(home, { target: { value: "After refresh" } });
    fireEvent.click(env.slot.getByRole("button", { name: "Save HOME" }));
    await waitFor(() => expect(env.calls).toHaveLength(1));
    expect(env.calls[0]).toEqual({
      projectId: project.id,
      name: "After refresh",
      color: "#Ff00Aa",
    });
  });

  it("keeps the table/status mounted on cold loading without guessing row count and retains rows during refresh", async () => {
    const env = setup();
    const read = deferred<{ projects: Project[] }>();
    env.setList(() => read.promise);
    openProjects(env.slot);
    const table = env.slot.getByRole("table", { name: "Projects" });
    const status = env.slot.getByRole("status");
    expect(table.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toBe("Loading projects…");
    expect(table.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(env.slot.queryByRole("textbox")).toBeNull();
    expect(table.querySelectorAll("tbody tr")).toHaveLength(0);
    await act(async () => {
      read.resolve({ projects: fixtures() });
      await read.promise;
    });
    const home = await env.slot.findByRole("textbox", { name: "Project name for HOME" });
    fireEvent.change(home, { target: { value: "Keep draft" } });
    await chooseColor(env, "HOME", "Purple");
    const refresh = deferred<{ projects: Project[] }>();
    env.setList(() => refresh.promise);
    await env.slot.emitRealtime("projects:changed", {});
    expect(env.slot.getByRole("table", { name: "Projects" })).toBe(table);
    expect(env.slot.getByRole("status")).toBe(status);
    expect(status.textContent).toBe("Refreshing projects…");
    expect(home).toHaveProperty("value", "Keep draft");
    expect(env.slot.getByRole("button", { name: "Colour for HOME: Purple" })).toBeDefined();
    expect(env.slot.getByRole("button", { name: "Save HOME" })).toHaveProperty("disabled", true);
    fireEvent.submit(home.closest("form")!);
    expect(env.calls).toEqual([]);
    await act(async () => {
      refresh.resolve({ projects: fixtures() });
      await refresh.promise;
    });
    await ready(env);
    expect(status.textContent).toBe("");
    expect(home).toHaveProperty("value", "Keep draft");
    expect(env.slot.getByRole("textbox", { name: "Project name for HOME" })).toBe(home);
  });

  it("distinguishes cold failure with manual Retry from successful empty inventory", async () => {
    const env = setup();
    env.setList(() => Promise.reject(new Error("Inventory offline")));
    openProjects(env.slot);
    expect((await env.slot.findByRole("alert")).textContent).toBe(
      "Could not load projects: Inventory offline",
    );
    expect(env.slot.queryByText(/No projects yet/)).toBeNull();
    expect(env.slot.queryByRole("textbox")).toBeNull();
    expect(env.slot.queryByRole("button", { name: /Save / })).toBeNull();
    const empty = deferred<{ projects: Project[] }>();
    env.setList(() => empty.promise);
    fireEvent.click(env.slot.getByRole("button", { name: "Retry" }));
    expect(env.slot.getByRole("status").textContent).toBe("Loading projects…");
    await act(async () => {
      empty.resolve({ projects: [] });
      await empty.promise;
    });
    expect(await env.slot.findByText(/No projects yet/)).toBeDefined();
    expect(env.slot.queryByRole("alert")).toBeNull();
    expect(
      env.slot.getByRole("table", { name: "Projects" }).querySelectorAll("tbody tr"),
    ).toHaveLength(0);
  });

  it("retains cached drafts on failed refresh, blocks stale saves and retries inventory separately", async () => {
    const env = setup();
    const home = await loaded(env);
    fireEvent.change(home, { target: { value: "Keep through failure" } });
    await chooseColor(env, "HOME", "Purple");
    env.setList(() => Promise.reject(new Error("Read failed")));
    await env.slot.emitRealtime("projects:changed", {});
    expect((await env.slot.findByRole("alert")).textContent).toBe(
      "Could not load projects: Read failed",
    );
    expect(home).toHaveProperty("value", "Keep through failure");
    expect(env.slot.getByRole("button", { name: "Colour for HOME: Purple" })).toBeDefined();
    expect(env.slot.getByRole("button", { name: "Save HOME" })).toHaveProperty("disabled", true);
    fireEvent.submit(home.closest("form")!);
    expect(env.calls).toEqual([]);
    expect(env.slot.queryByText(/No projects yet/)).toBeNull();
    const reads = env.slot.rpcCalls.filter((call) => call.method === "listProjects").length;
    await act(async () => {
      await Promise.resolve();
    });
    expect(env.slot.rpcCalls.filter((call) => call.method === "listProjects")).toHaveLength(reads);
    env.setList(() => ({
      projects: fixtures().map((row) => ({ ...row, name: "Retry baseline", color: "indianred" })),
    }));
    fireEvent.click(env.slot.getByRole("button", { name: "Retry" }));
    await ready(env);
    expect(home).toHaveProperty("value", "Keep through failure");
    expect(env.slot.queryByRole("alert")).toBeNull();
    fireEvent.click(env.slot.getByRole("button", { name: "Cancel HOME" }));
    expect(home).toHaveProperty("value", "Retry baseline");
    expect(env.slot.getByRole("button", { name: "Colour for HOME: Red" })).toBeDefined();
    expect(env.calls).toEqual([]);
  });

  it("removes only successful inventory removals and never transfers a removed row draft", async () => {
    const env = setup();
    const home = await loaded(env);
    const work = env.slot.getByRole("textbox", { name: "Project name for WORK" });
    fireEvent.change(home, { target: { value: "Removed draft" } });
    fireEvent.change(work, { target: { value: "Keep WORK draft" } });
    await chooseColor(env, "HOME", "Purple");
    await chooseColor(env, "WORK", "Green");
    const replacement = { ...fixtures()[0]!, id: "01HZZZZZZZZZZZZZZZZZZZZZP3", prefix: "OPS" };
    await changeInventory(env, [fixtures()[1]!, replacement]);
    expect(env.slot.queryByRole("textbox", { name: "Project name for HOME" })).toBeNull();
    expect(env.slot.getByRole("textbox", { name: "Project name for WORK" })).toBe(work);
    expect(work).toHaveProperty("value", "Keep WORK draft");
    expect(env.slot.getByRole("button", { name: "Colour for WORK: Green" })).toBeDefined();
    expect(env.slot.getByRole("button", { name: "Colour for OPS: #aBbCcD" })).toBeDefined();
    expect(env.slot.getByRole("textbox", { name: "Project name for OPS" })).toHaveProperty(
      "value",
      "Home Lab",
    );
    await changeInventory(env, fixtures());
    expect(env.slot.getByRole("textbox", { name: "Project name for HOME" })).not.toBe(home);
    expect(env.slot.getByRole("textbox", { name: "Project name for HOME" })).toHaveProperty(
      "value",
      "Home Lab",
    );
    expect(env.slot.getByRole("button", { name: "Colour for HOME: #aBbCcD" })).toBeDefined();
    expect(env.calls).toEqual([]);
  });

  it("lets the save response win over an event inventory completed before the response", async () => {
    const env = setup();
    const home = await loaded(env);
    const save = deferred<{ project: Project }>();
    env.setUpdate(() => save.promise);
    fireEvent.change(home, { target: { value: "Pending draft" } });
    await chooseColor(env, "HOME", "Purple");
    fireEvent.click(env.slot.getByRole("button", { name: "Save HOME" }));
    await changeInventory(
      env,
      fixtures().map((row) => ({ ...row, name: "Earlier event value", color: "slategray" })),
    );
    expect(home).toHaveProperty("value", "Pending draft");
    expect(env.slot.getByRole("button", { name: "Colour for HOME: Purple" })).toBeDefined();
    await act(async () => {
      save.resolve({
        project: { ...fixtures()[0]!, name: "Returned baseline", color: "indianred" },
      });
      await save.promise;
    });
    await waitFor(() => expect(home).toHaveProperty("value", "Returned baseline"));
    fireEvent.change(home, { target: { value: "Another draft" } });
    fireEvent.click(env.slot.getByRole("button", { name: "Cancel HOME" }));
    expect(home).toHaveProperty("value", "Returned baseline");
    expect(env.slot.getByRole("button", { name: "Colour for HOME: Red" })).toBeDefined();
    await changeInventory(
      env,
      fixtures().map((row) => ({
        ...row,
        name: "Later independent value",
        color: "mediumseagreen",
      })),
    );
    expect(home).toHaveProperty("value", "Later independent value");
    expect(env.slot.getByRole("button", { name: "Colour for HOME: Green" })).toBeDefined();
  });

  it("preserves a returned baseline when an overlapping inventory finishes after the response", async () => {
    const env = setup();
    const home = await loaded(env);
    const save = deferred<{ project: Project }>();
    const read = deferred<{ projects: Project[] }>();
    env.setUpdate(() => save.promise);
    fireEvent.change(home, { target: { value: "Pending draft" } });
    await chooseColor(env, "HOME", "Purple");
    fireEvent.click(env.slot.getByRole("button", { name: "Save HOME" }));
    env.setList(() => read.promise);
    await env.slot.emitRealtime("projects:changed", {});
    await act(async () => {
      save.resolve({
        project: { ...fixtures()[0]!, name: "Returned baseline", color: "indianred" },
      });
      await save.promise;
    });
    await waitFor(() => expect(home).toHaveProperty("value", "Returned baseline"));
    await act(async () => {
      read.resolve({
        projects: fixtures().map((row) => ({ ...row, name: "Stale read", color: "slategray" })),
      });
      await read.promise;
    });
    await ready(env);
    expect(home).toHaveProperty("value", "Returned baseline");
    fireEvent.change(home, { target: { value: "New local draft" } });
    fireEvent.click(env.slot.getByRole("button", { name: "Cancel HOME" }));
    expect(home).toHaveProperty("value", "Returned baseline");
    expect(env.slot.getByRole("button", { name: "Colour for HOME: Red" })).toBeDefined();
    env.setList(() => ({
      projects: fixtures().map((row) => ({
        ...row,
        name: "Later fresh value",
        color: "mediumseagreen",
      })),
    }));
    await env.slot.emitRealtime("projects:changed", {});
    await ready(env);
    expect(home).toHaveProperty("value", "Later fresh value");
    expect(env.slot.getByRole("button", { name: "Colour for HOME: Green" })).toBeDefined();
    expect(env.calls).toHaveLength(1);
  });

  it("accepts a later read that supersedes an overlapping read after Save, including Cancel and saved colour", async () => {
    const env = setup();
    const home = await loaded(env);
    const save = deferred<{ project: Project }>();
    const overlapping = deferred<{ projects: Project[] }>();
    const later = deferred<{ projects: Project[] }>();
    env.setUpdate(() => save.promise);
    fireEvent.change(home, { target: { value: "Pending draft" } });
    await chooseColor(env, "HOME", "Purple");
    fireEvent.click(env.slot.getByRole("button", { name: "Save HOME" }));
    env.setList(() => overlapping.promise);
    await env.slot.emitRealtime("projects:changed", {});
    await act(async () => {
      save.resolve({ project: { ...fixtures()[0]!, name: "Saved response", color: "indianred" } });
      await save.promise;
    });
    await waitFor(() => expect(home).toHaveProperty("value", "Saved response"));
    env.setList(() => later.promise);
    await env.slot.emitRealtime("projects:changed", {});
    const freshRows = fixtures().map((row) => ({
      ...row,
      name: "Later independent",
      color: "#Ff00Aa",
    }));
    await act(async () => {
      later.resolve({ projects: freshRows });
      await later.promise;
    });
    await ready(env);
    expect(home).toHaveProperty("value", "Later independent");
    await act(async () => {
      overlapping.resolve({
        projects: fixtures().map((row) => ({
          ...row,
          name: "Stale overlapping",
          color: "slategray",
        })),
      });
      await overlapping.promise;
    });
    expect(home).toHaveProperty("value", "Later independent");
    fireEvent.change(home, { target: { value: "Discard this draft" } });
    await chooseColor(env, "HOME", "Green");
    fireEvent.click(env.slot.getByRole("button", { name: "Cancel HOME" }));
    expect(home).toHaveProperty("value", "Later independent");
    expect(env.slot.getByRole("button", { name: "Colour for HOME: #Ff00Aa" })).toBeDefined();
    env.setUpdate(() => ({ project: { ...freshRows[0]!, name: "Next save" } }));
    fireEvent.change(home, { target: { value: "Next save" } });
    fireEvent.click(env.slot.getByRole("button", { name: "Save HOME" }));
    await waitFor(() => expect(env.calls).toHaveLength(2));
    expect(env.calls[1]).toEqual({ projectId: project.id, name: "Next save", color: "#Ff00Aa" });
  });

  it("separates failed post-save inventory from successful save and keeps the returned baseline through Retry", async () => {
    const env = setup();
    const home = await loaded(env);
    const save = deferred<{ project: Project }>();
    const read = deferred<{ projects: Project[] }>();
    env.setUpdate(() => save.promise);
    fireEvent.change(home, { target: { value: "Pending draft" } });
    await chooseColor(env, "HOME", "Purple");
    fireEvent.click(env.slot.getByRole("button", { name: "Save HOME" }));
    env.setList(() => read.promise);
    await env.slot.emitRealtime("projects:changed", {});
    await act(async () => {
      save.resolve({ project: { ...fixtures()[0]!, name: "Saved response", color: "indianred" } });
      await save.promise;
    });
    await waitFor(() => expect(home).toHaveProperty("value", "Saved response"));
    read.reject(new Error("Post-save read failed"));
    expect((await env.slot.findByRole("alert")).textContent).toBe(
      "Could not load projects: Post-save read failed",
    );
    expect(home).toHaveProperty("value", "Saved response");
    fireEvent.change(home, { target: { value: "Edit during failure" } });
    fireEvent.click(env.slot.getByRole("button", { name: "Cancel HOME" }));
    expect(home).toHaveProperty("value", "Saved response");
    expect(env.slot.getByRole("button", { name: "Colour for HOME: Red" })).toBeDefined();
    env.setList(() => ({
      projects: fixtures().map((row) => ({ ...row, name: "Saved response", color: "indianred" })),
    }));
    fireEvent.click(env.slot.getByRole("button", { name: "Retry" }));
    await ready(env);
    expect(env.slot.queryByRole("alert")).toBeNull();
    expect(home).toHaveProperty("value", "Saved response");
    expect(env.calls).toHaveLength(1);
  });

  it("uses an inventory completed during a failed save as Cancel's latest baseline and clears only the row error", async () => {
    const env = setup();
    const home = await loaded(env);
    const save = deferred<{ project: Project }>();
    env.setUpdate(() => save.promise);
    fireEvent.change(home, { target: { value: "Failed draft" } });
    await chooseColor(env, "HOME", "Purple");
    fireEvent.click(env.slot.getByRole("button", { name: "Save HOME" }));
    await changeInventory(
      env,
      fixtures().map((row) => ({ ...row, name: "Latest loaded", color: "#ABCdef" })),
    );
    expect(home).toHaveProperty("value", "Failed draft");
    save.reject(new Error("Save failed"));
    await env.slot.findByRole("alert");
    expect(home).toHaveProperty("value", "Failed draft");
    expect(env.slot.getByRole("button", { name: "Colour for HOME: Purple" })).toBeDefined();
    fireEvent.click(env.slot.getByRole("button", { name: "Cancel HOME" }));
    expect(home).toHaveProperty("value", "Latest loaded");
    expect(env.slot.queryByRole("alert")).toBeNull();
    expect(env.slot.getByRole("button", { name: "Colour for HOME: #ABCdef" })).toBeDefined();
    expect(env.calls).toHaveLength(1);
  });

  it("clears a retry's old alert but keeps its hidden layout space until saving ends", async () => {
    const env = setup();
    const home = await loaded(env);
    env.setUpdate(() => Promise.reject(new Error("Retry layout failure")));
    fireEvent.change(home, { target: { value: "Retry layout" } });
    fireEvent.click(env.slot.getByRole("button", { name: "Save HOME" }));
    const alert = await env.slot.findByRole("alert");
    expect(alert.textContent).toBe("Could not save HOME: Retry layout failure");
    const retry = deferred<{ project: Project }>();
    env.setUpdate(() => retry.promise);
    fireEvent.click(env.slot.getByRole("button", { name: "Save HOME" }));
    expect(env.slot.queryByRole("alert")).toBeNull();
    const reserved = env.slot.getByText("Could not save HOME: Retry layout failure");
    expect(reserved.getAttribute("aria-hidden")).toBe("true");
    expect(reserved.closest("tr")?.contains(home)).toBe(true);
    await act(async () => {
      retry.resolve({ project: { ...fixtures()[0]!, name: "Retry layout" } });
      await retry.promise;
    });
    await waitFor(() =>
      expect(env.slot.queryByText("Could not save HOME: Retry layout failure")).toBeNull(),
    );
    expect(home).toHaveProperty("value", "Retry layout");
  });

  it("keeps the same row and single-flight guard when switching Manage tabs during a save", async () => {
    const env = setup();
    const home = await loaded(env);
    const save = deferred<{ project: Project }>();
    env.setUpdate(() => save.promise);
    fireEvent.change(home, { target: { value: "Pending tab draft" } });
    await chooseColor(env, "HOME", "Purple");
    fireEvent.click(env.slot.getByRole("button", { name: "Save HOME" }));
    await waitFor(() => expect(env.calls).toHaveLength(1));
    try {
      fireEvent.mouseDown(env.slot.getByRole("tab", { name: "Labels" }));
      expect(env.slot.queryByRole("table", { name: "Projects" })).toBeNull();
      openProjects(env.slot);
      expect(env.slot.getByRole("textbox", { name: "Project name for HOME" })).toBe(home);
      expect(home).toHaveProperty("value", "Pending tab draft");
      expect(home).toHaveProperty("disabled", true);
      expect(env.slot.getByRole("button", { name: "Colour for HOME: Purple" })).toHaveProperty(
        "disabled",
        true,
      );
      expect(env.slot.getByRole("button", { name: "Save HOME" }).getAttribute("aria-busy")).toBe(
        "true",
      );
      fireEvent.submit(home.closest("form")!);
      expect(env.calls).toHaveLength(1);
    } finally {
      await act(async () => {
        save.resolve({
          project: { ...fixtures()[0]!, name: "Pending tab draft", color: "mediumpurple" },
        });
        await save.promise;
      });
    }
    await waitFor(() => expect(home).toHaveProperty("disabled", false));
    expect(home).toHaveProperty("value", "Pending tab draft");
  });

  it.each(["success", "failure"])(
    "releases the table lock after a pending row is removed and its save ends in %s",
    async (outcome) => {
      const env = setup();
      const home = await loaded(env);
      const work = env.slot.getByRole("textbox", { name: "Project name for WORK" });
      const save = deferred<{ project: Project }>();
      env.setUpdate(() => save.promise);
      fireEvent.change(home, { target: { value: "Removed pending draft" } });
      fireEvent.change(work, { target: { value: "Keep other draft" } });
      await chooseColor(env, "HOME", "Purple");
      await chooseColor(env, "WORK", "Green");
      fireEvent.click(env.slot.getByRole("button", { name: "Save HOME" }));
      await changeInventory(env, [fixtures()[1]!]);
      expect(env.slot.queryByRole("textbox", { name: "Project name for HOME" })).toBeNull();
      expect(work).toHaveProperty("disabled", true);
      if (outcome === "success")
        save.resolve({ project: { ...fixtures()[0]!, name: "Removed pending draft" } });
      else save.reject(new Error("Removed row failed"));
      await waitFor(() => expect(work).toHaveProperty("disabled", false));
      expect(work).toHaveProperty("value", "Keep other draft");
      expect(env.slot.getByRole("button", { name: "Colour for WORK: Green" })).toHaveProperty(
        "disabled",
        false,
      );
      expect(env.slot.queryByRole("textbox", { name: "Project name for HOME" })).toBeNull();
      expect(env.slot.getByRole("button", { name: "Save WORK" })).toHaveProperty("disabled", false);
      expect(env.calls).toHaveLength(1);
    },
  );
});
