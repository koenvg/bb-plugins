// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { tasksRpcContract, type Project, type Task } from "../../shared/contract.js";
import { TASKS_PAGE_MAX_LIMIT } from "../../shared/pagination.js";
import { makeTask, rpcInput } from "../../test-fixtures.js";
import { COMPACT_VIEWPORT_QUERY } from "../../components/ui/hooks/use-compact-viewport.js";
import { app, project } from "./manage.test-support.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type DeleteResult = ReturnType<typeof tasksRpcContract.deleteProject.output.parse>;
type TaskPage = { tasks: Task[]; nextCursor?: string | null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  const state = {
    projects: [
      { ...project, name: "Home Lab", prefix: "HOME" },
      { ...project, id: "01HZZZZZZZZZZZZZZZZZZZZZP2", name: "Work", prefix: "WORK" },
    ],
  };
  const handlers: {
    projects: () => { projects: Project[] } | Promise<{ projects: Project[] }>;
    tasks: (input: Record<string, unknown>) => TaskPage | Promise<TaskPage>;
    remove: (input: Record<string, unknown>) => DeleteResult | Promise<DeleteResult>;
    save: (input: Record<string, unknown>) => { project: Project } | Promise<{ project: Project }>;
  } = {
    projects: () => ({ projects: state.projects.map((row) => ({ ...row })) }),
    tasks: () => ({ tasks: [] }),
    remove: (input) => {
      state.projects = state.projects.filter((row) => row.id !== input.projectId);
      return { ok: true, deleted: true };
    },
    save: (input) => ({
      project: {
        ...state.projects.find((row) => row.id === input.projectId)!,
        name: String(input.name),
      },
    }),
  };
  const slot = renderSlot(
    app.navPanels[0]!,
    { subPath: "manage" },
    {
      rpc: {
        listProjects: () => handlers.projects(),
        listFolders: () => ({ folders: [] }),
        listPresets: () => ({ presets: [] }),
        listLabels: () => ({ labels: [] }),
        sidebarSummary: () => ({ projects: [] }),
        listTasks: (raw: unknown) => handlers.tasks(rpcInput(raw)),
        deleteProject: (raw: unknown) => handlers.remove(rpcInput(raw)),
        updateProject: (raw: unknown) => handlers.save(rpcInput(raw)),
      },
    },
  );
  return {
    slot,
    state,
    handlers,
    calls: (method: string) => slot.inspection.rpcCalls.filter((call) => call.method === method),
  };
}

async function load(env: ReturnType<typeof setup>) {
  fireEvent.mouseDown(env.slot.getByRole("tab", { name: "Projects" }));
  const input = await env.slot.findByRole("textbox", { name: "Project name for HOME" });
  await waitFor(() =>
    expect(env.slot.getByRole("table", { name: "Projects" }).getAttribute("aria-busy")).toBe(
      "false",
    ),
  );
  return input;
}

async function open(env: ReturnType<typeof setup>, prefix = "HOME") {
  fireEvent.click(env.slot.getByRole("button", { name: `Delete ${prefix}` }));
  return within(document.body).findByRole("dialog");
}

async function confirm(dialog: HTMLElement, prefix = "HOME") {
  const input = within(dialog).getByRole("textbox", { name: `Type ${prefix} to confirm` });
  fireEvent.change(input, { target: { value: prefix } });
  const button = within(dialog).getByRole("button", { name: "Delete project and tasks" });
  await waitFor(() => expect(button).toHaveProperty("disabled", false));
  return { input, button };
}

describe("production project deletion safeguards", () => {
  it("counts every page without status, nesting or active filters, and waits for the final page", async () => {
    const env = setup();
    await load(env);
    const first = deferred<TaskPage>();
    const last = deferred<TaskPage>();
    env.handlers.tasks = (input) => (input.cursor ? last.promise : first.promise);
    const dialog = await open(env);
    const input = within(dialog).getByRole("textbox", { name: "Type HOME to confirm" });
    fireEvent.change(input, { target: { value: "HOME" } });
    const button = within(dialog).getByRole("button", { name: "Delete project and tasks" });
    expect(button).toHaveProperty("disabled", true);
    expect(within(dialog).getByRole("status").textContent).toContain("Counting all tasks");
    await act(async () => {
      first.resolve({ tasks: [makeTask({ status: "done" })], nextCursor: "second" });
    });
    await waitFor(() => expect(env.calls("listTasks")).toHaveLength(2));
    expect(button).toHaveProperty("disabled", true);
    expect(env.calls("listTasks").map((call) => call.input)).toEqual([
      { projectId: project.id, limit: TASKS_PAGE_MAX_LIMIT },
      { projectId: project.id, limit: TASKS_PAGE_MAX_LIMIT, cursor: "second" },
    ]);
    await act(async () => {
      last.resolve({
        tasks: [
          makeTask({ id: "child", status: "canceled", parentTaskId: "parent" }),
          makeTask({ id: "grandchild", parentTaskId: "child" }),
        ],
      });
    });
    await waitFor(() =>
      expect(within(dialog).getByRole("status").textContent).toBe(
        "Delete this project and all 3 tasks? This cannot be undone.",
      ),
    );
    expect(button).toHaveProperty("disabled", false);
    expect(env.calls("deleteProject")).toEqual([]);
  });

  it("announces count failure and permits manual Retry without inventing a zero or deleting", async () => {
    const env = setup();
    await load(env);
    env.handlers.tasks = () => {
      throw new Error("Count unavailable");
    };
    const dialog = await open(env);
    const input = within(dialog).getByRole("textbox", { name: "Type HOME to confirm" });
    fireEvent.change(input, { target: { value: "HOME" } });
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Count unavailable");
    const button = within(dialog).getByRole("button", { name: "Delete project and tasks" });
    expect(button).toHaveProperty("disabled", true);
    expect(within(dialog).getByRole("status").textContent).not.toContain("0 tasks");
    expect(env.calls("listTasks")).toHaveLength(1);
    const retry = deferred<TaskPage>();
    env.handlers.tasks = () => retry.promise;
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry task count" }));
    expect(button).toHaveProperty("disabled", true);
    await act(async () => {
      retry.resolve({ tasks: [] });
    });
    await waitFor(() => expect(button).toHaveProperty("disabled", false));
    expect(env.calls("listTasks")).toHaveLength(2);
    expect(env.calls("deleteProject")).toEqual([]);
  });

  it("ignores dismissed count results and resets confirmation when reopened for either identity", async () => {
    const env = setup();
    await load(env);
    const count = deferred<TaskPage>();
    env.handlers.tasks = () => count.promise;
    let dialog = await open(env);
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Type HOME to confirm" }), {
      target: { value: "HOME" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(within(document.body).queryByRole("dialog")).toBeNull());
    env.handlers.tasks = () => ({ tasks: [] });
    dialog = await open(env, "WORK");
    const workInput = within(dialog).getByRole("textbox", { name: "Type WORK to confirm" });
    expect(workInput).toHaveProperty("value", "");
    await act(async () => {
      count.resolve({ tasks: Array.from({ length: 42 }, () => makeTask()) });
    });
    await waitFor(() =>
      expect(within(dialog).getByRole("status").textContent).toContain("all 0 tasks"),
    );
    expect(workInput).toHaveProperty("value", "");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(within(document.body).queryByRole("dialog")).toBeNull());
    dialog = await open(env);
    expect(within(dialog).getByRole("textbox", { name: "Type HOME to confirm" })).toHaveProperty(
      "value",
      "",
    );
    expect(env.calls("deleteProject")).toEqual([]);
  });

  it("uses the responsive drawer with Cancel focus, exact confirmation and focus return", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query === COMPACT_VIEWPORT_QUERY,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
    const env = setup();
    const home = await load(env);
    fireEvent.change(home, { target: { value: "Keep drawer draft" } });
    const trigger = env.slot.getByRole("button", { name: "Delete HOME" });
    const dialog = await open(env);
    const cancel = await within(dialog).findByRole("button", { name: "Cancel" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    await confirm(dialog);
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(within(document.body).queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(home).toHaveProperty("value", "Keep drawer draft");
    expect(env.calls("deleteProject")).toEqual([]);
  });

  it.each(["transport", "domain"])(
    "blocks pending edits, saves, dismissal and duplicate deletion, then retries %s failure manually",
    async (failure) => {
      const env = setup();
      const home = await load(env);
      const work = env.slot.getByRole("textbox", { name: "Project name for WORK" });
      fireEvent.change(home, { target: { value: "Keep home draft" } });
      fireEvent.change(work, { target: { value: "Keep work draft" } });
      const workSave = env.slot.getByRole("button", { name: "Save WORK" });
      const deleteWork = env.slot.getByRole("button", { name: "Delete WORK" });
      const pending = deferred<DeleteResult>();
      env.handlers.remove = () => pending.promise;
      const dialog = await open(env);
      const { input, button } = await confirm(dialog);
      const cancel = within(dialog).getByRole("button", { name: "Cancel" });
      await act(async () => {
        fireEvent.click(button);
        fireEvent.click(button);
        fireEvent.submit(work.closest("form")!);
        fireEvent.click(deleteWork);
        fireEvent.click(cancel);
        fireEvent.change(input, { target: { value: "WORK" } });
        fireEvent.change(work, { target: { value: "Changed while pending" } });
        fireEvent.keyDown(dialog, { key: "Escape" });
      });
      expect(env.calls("deleteProject")).toHaveLength(1);
      expect(env.calls("updateProject")).toEqual([]);
      for (const control of [home, work, input, cancel, workSave, deleteWork, button])
        expect(control).toHaveProperty("disabled", true);
      expect(input).toHaveProperty("value", "HOME");
      expect(work).toHaveProperty("value", "Keep work draft");
      expect(within(document.body).getByRole("dialog")).toBe(dialog);
      expect(button.textContent).toBe("Deleting…");
      await act(async () => {
        if (failure === "transport") pending.reject(new Error("Transport failed"));
        else
          pending.resolve({
            ok: false,
            error: { code: "project_not_empty", message: "Domain refused deletion" },
          });
      });
      expect((await within(dialog).findByRole("alert")).textContent).toContain(
        failure === "transport" ? "Transport failed" : "Domain refused deletion",
      );
      expect(home).toHaveProperty("value", "Keep home draft");
      expect(input).toHaveProperty("value", "HOME");
      expect(cancel).toHaveProperty("disabled", false);
      expect(env.calls("deleteProject")).toHaveLength(1);
      env.handlers.remove = (payload) => {
        env.state.projects = env.state.projects.filter((row) => row.id !== payload.projectId);
        return { ok: true, deleted: true };
      };
      fireEvent.click(button);
      await waitFor(() => expect(within(document.body).queryByRole("dialog")).toBeNull());
      expect(env.calls("deleteProject")).toHaveLength(2);
      expect(work).toHaveProperty("value", "Keep work draft");
    },
  );

  it("excludes delete activation while a save holds the synchronous table lock", async () => {
    const env = setup();
    const home = await load(env);
    const trigger = env.slot.getByRole("button", { name: "Delete WORK" });
    const save = deferred<{ project: Project }>();
    env.handlers.save = () => save.promise;
    fireEvent.change(home, { target: { value: "Pending save" } });
    await act(async () => {
      fireEvent.submit(home.closest("form")!);
      fireEvent.click(trigger);
    });
    expect(env.calls("updateProject")).toHaveLength(1);
    expect(env.calls("deleteProject")).toEqual([]);
    expect(within(document.body).queryByRole("dialog")).toBeNull();
    await act(async () => {
      save.resolve({ project: { ...env.state.projects[0]!, name: "Pending save" } });
    });
    await waitFor(() => expect(trigger).toHaveProperty("disabled", false));
  });

  it.each(["loading", "failure", "removed"])(
    "prevents a confirmed deletion when the inventory becomes %s",
    async (state) => {
      const env = setup();
      await load(env);
      const dialog = await open(env);
      const { button } = await confirm(dialog);
      const read = deferred<{ projects: Project[] }>();
      env.handlers.projects = () => read.promise;
      await env.slot.emitRealtime("projects:changed", {});
      if (state === "failure")
        await act(async () => {
          read.reject(new Error("Inventory unavailable"));
        });
      if (state === "removed")
        await act(async () => {
          read.resolve({ projects: [env.state.projects[1]!] });
        });
      await waitFor(() => expect(button).toHaveProperty("disabled", true));
      fireEvent.click(button);
      expect(env.calls("deleteProject")).toEqual([]);
      if (state === "loading")
        await act(async () => {
          read.resolve({ projects: env.state.projects });
        });
    },
  );
  it("retains the delete lock and confirmation through Manage-tab transitions", async () => {
    const env = setup();
    await load(env);
    const work = env.slot.getByRole("textbox", { name: "Project name for WORK" });
    const labels = env.slot.getByRole("tab", { name: "Labels" });
    const projects = env.slot.getByRole("tab", { name: "Projects" });
    const deletion = deferred<DeleteResult>();
    env.handlers.remove = () => deletion.promise;
    let dialog = await open(env);
    const { button } = await confirm(dialog);
    fireEvent.click(button);
    fireEvent.mouseDown(labels);
    expect(env.slot.queryByRole("table", { name: "Projects" })).toBeNull();
    fireEvent.mouseDown(projects);
    dialog = await within(document.body).findByRole("dialog");
    expect(within(dialog).getByRole("textbox", { name: "Type HOME to confirm" })).toHaveProperty(
      "value",
      "HOME",
    );
    expect(work).toHaveProperty("disabled", true);
    fireEvent.submit(work.closest("form")!);
    expect(env.calls("updateProject")).toEqual([]);
    expect(env.calls("deleteProject")).toHaveLength(1);
    await act(async () => {
      deletion.reject(new Error("Transition fixture failure"));
    });
    await within(dialog).findByRole("alert");
    expect(work).toHaveProperty("disabled", false);
    expect(within(dialog).getByRole("textbox", { name: "Type HOME to confirm" })).toHaveProperty(
      "value",
      "HOME",
    );
  });

  it("reports an already absent project without claiming this request deleted it", async () => {
    const env = setup();
    await load(env);
    env.handlers.remove = () => ({ ok: true, deleted: false });
    env.handlers.projects = () => ({ projects: [env.state.projects[1]!] });
    const dialog = await open(env);
    const { button } = await confirm(dialog);
    fireEvent.click(button);
    await env.slot.findByText("Home Lab (HOME) is already absent.");
    expect(env.slot.queryByText(/^Deleted /)).toBeNull();
    expect(env.slot.queryByRole("textbox", { name: "Project name for HOME" })).toBeNull();
    expect(env.calls("listProjects").length).toBeGreaterThan(1);
  });

  it("keeps a confirmed removal through stale reads and a failed refresh, then preserves other drafts on Retry", async () => {
    const env = setup();
    await load(env);
    const work = env.slot.getByRole("textbox", { name: "Project name for WORK" });
    fireEvent.change(work, { target: { value: "Surviving draft" } });
    const deletion = deferred<DeleteResult>();
    env.handlers.remove = () => deletion.promise;
    const dialog = await open(env);
    const { button } = await confirm(dialog);
    fireEvent.click(button);
    const overlap = deferred<{ projects: Project[] }>();
    env.handlers.projects = () => overlap.promise;
    await env.slot.emitRealtime("projects:changed", {});
    await act(async () => {
      deletion.resolve({ ok: true, deleted: true });
    });
    await waitFor(() => expect(within(document.body).queryByRole("dialog")).toBeNull());
    expect(env.slot.queryByRole("textbox", { name: "Project name for HOME" })).toBeNull();
    await act(async () => {
      overlap.resolve({ projects: env.state.projects });
    });
    await waitFor(() => expect(work).toHaveProperty("disabled", false));
    expect(env.slot.queryByRole("textbox", { name: "Project name for HOME" })).toBeNull();
    env.handlers.projects = () => {
      throw new Error("Post-delete read failed");
    };
    await env.slot.emitRealtime("projects:changed", {});
    expect((await env.slot.findByRole("alert")).textContent).toContain("Post-delete read failed");
    expect(env.slot.queryByRole("textbox", { name: "Project name for HOME" })).toBeNull();
    expect(env.slot.getByText("Deleted Home Lab (HOME) and all its tasks.")).toBeDefined();
    expect(work).toHaveProperty("value", "Surviving draft");
    env.handlers.projects = () => ({ projects: [env.state.projects[1]!] });
    fireEvent.click(env.slot.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(env.slot.queryByRole("alert")).toBeNull());
    expect(work).toHaveProperty("value", "Surviving draft");
    expect(env.calls("deleteProject")).toHaveLength(1);
  });
});
