import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it } from "vitest";
import { createStore } from "./api";
import plugin from "./server";
import { tasksRpcContract } from "./shared/contract";

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (disposers.length) await disposers.pop()?.();
});

async function fixture() {
  let thread = makeThreadResponse({ id: "thr_creator", status: "idle" });
  const host = createFakePluginHost({
    pluginId: "tasks",
    sdk: { threads: { get: async () => thread } },
  });
  disposers.push(() => host.harness.dispose());
  await plugin(host.bb);
  const store = createStore(host.bb);
  const project = store.tasks.createProject({ name: "Creator", prefix: "CRT", color: "blue" });
  const cli = (args: string[], inside = false) =>
    host.harness.runCli(args, inside ? { threadId: thread.id } : {});
  const create = async (inside: boolean) => {
    const result = await cli(
      ["create", "--project", "CRT", "--title", "Follow-up", "--json"],
      inside,
    );
    expect(result, result.stderr).toMatchObject({ exitCode: 0 });
    return tasksRpcContract.getTask.output.parse({ task: JSON.parse(result.stdout!).task }).task!;
  };
  const list = async (filter: "--blocked" | "--ready") => {
    const result = await cli(["list", "--project", "CRT", filter, "--json"]);
    expect(result, result.stderr).toMatchObject({ exitCode: 0 });
    return JSON.parse(result.stdout!).tasks;
  };
  const lifecycle = async (archived: boolean) => {
    thread = { ...thread, archivedAt: archived ? 1 : null };
    await host.harness.behavior.emitThreadEvent(
      archived ? "thread.archived" : "thread.unarchived",
      { thread },
    );
  };
  return { ...host, store, project, cli, create, list, lifecycle };
}

describe("creator-thread blockers through CLI and UI RPC", () => {
  it("records CLI context, leaves human creation null and exposes show/list metadata", async () => {
    const f = await fixture();
    const agent = await f.create(true);
    const human = await f.create(false);
    expect(agent.createdByThreadId).toBe("thr_creator");
    expect(human.createdByThreadId).toBeNull();
    expect(await f.list("--blocked")).toMatchObject([
      { id: agent.id, openBlockerCount: 1, blocked: true },
    ]);
    expect(await f.list("--ready")).toMatchObject([{ id: human.id, createdByThreadId: null }]);
    const show = await f.cli(["show", agent.key, "--json"]);
    expect(JSON.parse(show.stdout!).task.createdByThreadId).toBe("thr_creator");
  });

  it("refuses todo atomically through CLI, detail updates and board moves", async () => {
    const f = await fixture();
    const task = await f.create(true);
    const result = await f.cli(["update", task.key, "--status", "todo", "--json"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("thr_creator");
    for (const method of ["updateTask", "boardMove"] as const) {
      const response = await f.harness.callRpc(method, {
        taskId: task.id,
        status: "todo",
        ...(method === "updateTask" ? { title: "Must roll back" } : {}),
      });
      expect(response).toMatchObject({
        ok: false,
        error: { code: "creator_thread_open", message: expect.stringContaining("thr_creator") },
      });
      expect(f.store.tasks.getTask(task.id)).toMatchObject({
        title: "Follow-up",
        status: "backlog",
      });
    }
  });

  it("updates counts, filters and realtime on archive/unarchive without changing task blockers", async () => {
    const f = await fixture();
    const task = await f.create(true);
    const blocker = f.store.tasks.createTask({ projectId: f.project.id, title: "Other blocker" });
    f.store.tasks.addTaskDependency(blocker.id, task.id);
    expect((await f.list("--blocked")).find((t: { id: string }) => t.id === task.id)).toMatchObject(
      { openBlockerCount: 2 },
    );
    await f.lifecycle(true);
    expect(f.harness.realtimeSignals).toContainEqual({
      channel: "tasks:changed",
      payload: { taskId: task.id, projectId: task.projectId },
    });
    expect((await f.list("--blocked")).find((t: { id: string }) => t.id === task.id)).toMatchObject(
      { openBlockerCount: 1 },
    );
    f.store.tasks.updateTask(blocker.id, { status: "done" });
    expect((await f.list("--ready")).some((t: { id: string }) => t.id === task.id)).toBe(true);
    const moved = await f.cli(["update", task.key, "--status", "todo", "--json"]);
    expect(moved, moved.stderr).toMatchObject({ exitCode: 0 });
    await f.lifecycle(false);
    expect((await f.list("--blocked")).find((t: { id: string }) => t.id === task.id)).toMatchObject(
      { openBlockerCount: 1 },
    );
    expect((await f.list("--ready")).some((t: { id: string }) => t.id === task.id)).toBe(false);
  });

  it("clears a deleted creator but retains its identity", async () => {
    const f = await fixture();
    const task = await f.create(true);
    await f.harness.behavior.emitThreadEvent("thread.deleted", {
      thread: makeThreadResponse({ id: "thr_creator", deletedAt: 1 }),
    });
    const response = await f.harness.callRpc("getTask", { taskId: task.id });
    expect(response).toMatchObject({
      task: { createdByThreadId: "thr_creator", blocked: false, openBlockerCount: 0 },
    });
  });

  it("leaves UI-created tasks without a creator and refuses direct creation in todo", async () => {
    const f = await fixture();
    const human = await f.harness.callRpc("createTask", {
      projectId: f.project.id,
      title: "UI task",
      status: "todo",
    });
    expect(human).toMatchObject({ ok: true, task: { createdByThreadId: null, blocked: false } });
    const agent = await f.harness.callRpc("createTask", {
      projectId: f.project.id,
      title: "Agent",
      status: "todo",
      createdByThreadId: "thr_creator",
    });
    expect(agent).toMatchObject({ ok: false, error: { code: "creator_thread_open" } });
    expect(f.store.tasks.listTasks().map((task) => task.title)).toEqual(["UI task"]);
  });

  it("guards storage callers and invalidates filtered cursors on lifecycle changes", async () => {
    const f = await fixture();
    const task = await f.create(true);
    await f.create(true);
    expect(() => f.store.tasks.updateTask(task.id, { status: "todo", title: "Forbidden" })).toThrow(
      "thr_creator",
    );
    expect(() => f.store.tasks.updatePosition(task.id, { status: "todo" })).toThrow("thr_creator");
    const page = tasksRpcContract.listTasks.output.parse(
      await f.harness.callRpc("listTasks", {
        projectId: f.project.id,
        dependency: "blocked",
        limit: 1,
      }),
    );
    expect(page.nextCursor).not.toBeNull();
    await f.lifecycle(true);
    await expect(
      f.harness.callRpc("listTasks", {
        projectId: f.project.id,
        dependency: "blocked",
        limit: 1,
        cursor: page.nextCursor,
      }),
    ).rejects.toThrow(/changed|stale/i);
  });

  it("never lets overlapping creator lookups authorize todo from an old clear cache", async () => {
    type Thread = ReturnType<typeof makeThreadResponse>;
    let get = async (): Promise<Thread> => makeThreadResponse({ id: "thr_creator", archivedAt: 1 });
    const { bb, harness } = createFakePluginHost({
      pluginId: "creator-race",
      sdk: { threads: { get: () => get() } },
    });
    disposers.push(() => harness.dispose());
    await plugin(bb);
    const store = createStore(bb);
    const project = store.tasks.createProject({ name: "Race", prefix: "RACE", color: "blue" });
    const created = tasksRpcContract.createTask.output.parse(
      await harness.callRpc("createTask", {
        projectId: project.id,
        title: "Original",
        createdByThreadId: "thr_creator",
      }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("Creation failed");
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let firstReply!: (thread: Thread) => void;
    let secondReply!: (thread: Thread) => void;
    const firstRead = new Promise<Thread>((resolve) => {
      firstReply = resolve;
    });
    const secondRead = new Promise<Thread>((resolve) => {
      secondReply = resolve;
    });
    let reads = 0;
    get = () => {
      entered();
      return reads++ === 0 ? firstRead : secondRead;
    };
    const first = harness.callRpc("updateTask", {
      taskId: created.task.id,
      status: "todo",
      title: "First edit",
    });
    await started;
    const second = harness.callRpc("updateTask", {
      taskId: created.task.id,
      status: "todo",
      title: "Second edit",
    });
    await Promise.resolve();
    firstReply(makeThreadResponse({ id: "thr_creator" }));
    try {
      expect(await first).toMatchObject({ ok: false, error: { code: "creator_thread_open" } });
      expect(await second).toMatchObject({ ok: false, error: { code: "creator_thread_open" } });
      expect(store.tasks.getTask(created.task.id)).toMatchObject({
        status: "backlog",
        title: "Original",
      });
    } finally {
      secondReply(makeThreadResponse({ id: "thr_creator" }));
      await Promise.all([first, second]);
    }
  });
});
