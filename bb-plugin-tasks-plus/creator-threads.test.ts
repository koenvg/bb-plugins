import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStore } from "./api";
import plugin from "./server";
import { type Task, tasksRpcContract } from "./shared/contract";

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (disposers.length) await disposers.pop()?.();
});

async function fixture() {
  const get = vi.fn(async () => makeThreadResponse({ id: "thr_creator", status: "idle" }));
  const host = createFakePluginHost({ pluginId: "tasks", sdk: { threads: { get } } });
  disposers.push(() => host.harness.dispose());
  await plugin(host.bb);
  const store = createStore(host.bb);
  const project = store.tasks.createProject({ name: "Creator", prefix: "CRT", color: "blue" });
  const cli = (args: string[], inside = false) =>
    host.harness.runCli(args, inside ? { threadId: "thr_creator" } : {});
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
    return (JSON.parse(result.stdout!) as { tasks: Task[] }).tasks;
  };
  return { ...host, store, project, cli, create, list, get };
}

describe("creator attribution without dependency policy", () => {
  it("captures open CLI context, retains full attribution and allows todo", async () => {
    const f = await fixture();
    const agent = await f.create(true);
    const human = await f.create(false);
    expect(agent).toMatchObject({
      createdByThreadId: "thr_creator",
      openBlockerCount: 0,
      blocked: false,
    });
    expect(agent).not.toHaveProperty("creatorThreadBlocked");
    expect(human.createdByThreadId).toBeNull();
    const update = await f.cli(["update", agent.key, "--status", "todo", "--json"], true);
    expect(update, update.stderr).toMatchObject({ exitCode: 0 });
    const show = await f.cli(["show", agent.key]);
    expect(show.stdout).toContain("thr_creator");
    expect(await f.list("--blocked")).toEqual([]);
    expect((await f.list("--ready")).map((task) => task.id).sort()).toEqual(
      [agent.id, human.id].sort(),
    );
    expect(f.get).not.toHaveBeenCalled();
  });

  it("accepts registered RPC attribution and todo create, update, move and reorder without lookup", async () => {
    const f = await fixture();
    f.get.mockRejectedValue(new Error("Creator unavailable"));
    for (const createdByThreadId of [undefined, "thr_creator"]) {
      const result = tasksRpcContract.createTask.output.parse(
        await f.harness.callRpc("createTask", {
          projectId: f.project.id,
          title: "Ready",
          status: "todo",
          createdByThreadId,
        }),
      );
      expect(result).toMatchObject({
        ok: true,
        task: { status: "todo", createdByThreadId: createdByThreadId ?? null, blocked: false },
      });
      if (!result.ok) throw new Error("Creation failed");
      expect(result.task).not.toHaveProperty("creatorThreadBlocked");
      const neighbor = f.store.tasks.createTask({
        projectId: f.project.id,
        title: "Neighbor",
        status: "todo",
      });
      for (const method of ["updateTask", "boardMove", "boardMove"] as const) {
        const response = await f.harness.callRpc(method, {
          taskId: result.task.id,
          status: "todo",
          ...(method === "updateTask" ? { title: "Edited" } : { beforeTaskId: neighbor.id }),
        });
        expect(response).toMatchObject({
          ok: true,
          task: { status: "todo", createdByThreadId: createdByThreadId ?? null },
        });
      }
    }
    expect(f.get).not.toHaveBeenCalled();
  });

  it("uses task edges alone for SQL filters and counts, including legacy blocked cache rows", async () => {
    const f = await fixture();
    const dependent = await f.create(true);
    const ready = await f.create(true);
    f.bb.storage
      .database()
      .prepare("INSERT OR REPLACE INTO task_creator_threads(thread_id, blocked) VALUES (?, ?)")
      .run("thr_creator", 1);
    const blocker = f.store.tasks.createTask({ projectId: f.project.id, title: "Actual blocker" });
    f.store.tasks.addTaskDependency(blocker.id, dependent.id);
    const blocked = await f.list("--blocked");
    expect(blocked).toMatchObject([
      { id: dependent.id, openBlockerCount: 1, blocked: true, blockedBy: [{ id: blocker.id }] },
    ]);
    expect((await f.list("--ready")).map((task) => task.id).sort()).toEqual(
      [ready.id, blocker.id].sort(),
    );
    const source = tasksRpcContract.getTask.output.parse(
      await f.harness.callRpc("getTask", { taskId: blocker.id }),
    ).task!;
    expect(source).toMatchObject({
      blockedBy: [],
      blocks: [{ id: dependent.id }],
      openBlockedCount: 1,
    });
    for (const status of ["done", "canceled"] as const) {
      f.store.tasks.updateTask(blocker.id, { status });
      expect(await f.list("--blocked")).toEqual([]);
      expect((await f.list("--ready")).find((task) => task.id === dependent.id)).toMatchObject({
        openBlockerCount: 0,
        blocked: false,
        blockedBy: [{ id: blocker.id, status }],
      });
    }
    f.store.tasks.updateTask(ready.id, { status: "todo" });
    f.store.tasks.updatePosition(ready.id, { status: "todo" });
    expect(f.store.tasks.getTask(ready.id)).toMatchObject({
      status: "todo",
      createdByThreadId: "thr_creator",
    });
    expect(f.get).not.toHaveBeenCalled();
  });

  it("paginates blocked and ready tasks independently of blocked, clear and missing legacy cache rows", async () => {
    const f = await fixture();
    const create = (title: string, createdByThreadId: string) =>
      f.store.tasks.createTask({
        projectId: f.project.id,
        title,
        status: "todo",
        createdByThreadId,
      });
    const blockedCache = create("Blocked cache only", "thr_creator");
    const clearCache = create("Clear cache only", "thr_clear");
    const blocker = create("Actual prerequisite", "thr_uncached");
    const dependents = [
      create("Dependent one", "thr_creator"),
      create("Dependent two", "thr_clear"),
    ];
    const cache = f.bb.storage
      .database()
      .prepare("INSERT INTO task_creator_threads(thread_id, blocked) VALUES (?, ?)");
    cache.run("thr_creator", 1);
    cache.run("thr_clear", 0);
    for (const dependent of dependents) f.store.tasks.addTaskDependency(blocker.id, dependent.id);
    for (const dependency of ["ready", "blocked"] as const) {
      const tasks: Task[] = [];
      let cursor: string | null = null;
      do {
        const page = tasksRpcContract.listTasks.output.parse(
          await f.harness.callRpc("listTasks", {
            projectId: f.project.id,
            dependency,
            limit: 1,
            ...(cursor ? { cursor } : {}),
          }),
        );
        tasks.push(...page.tasks);
        cursor = page.nextCursor;
      } while (cursor);
      expect(tasks.map((task) => task.id).sort()).toEqual(
        (dependency === "ready" ? [blockedCache, clearCache, blocker] : dependents)
          .map((task) => task.id)
          .sort(),
      );
      expect(tasks.map((task) => task.openBlockerCount)).toEqual(
        dependency === "ready" ? [0, 0, 0] : [1, 1],
      );
      expect(tasks.every((task) => task.blocked === (dependency === "blocked"))).toBe(true);
    }
    expect(f.get).not.toHaveBeenCalled();
  });

  it("does not change attribution or readiness on creator lifecycle events", async () => {
    const f = await fixture();
    const task = await f.create(true);
    const before = await f.harness.callRpc("getTask", { taskId: task.id });
    const signals = f.harness.realtimeSignals.length;
    for (const event of ["thread.archived", "thread.unarchived", "thread.deleted"] as const) {
      await f.harness.behavior.emitThreadEvent(event, {
        thread: makeThreadResponse({ id: "thr_creator" }),
      });
      expect(await f.harness.callRpc("getTask", { taskId: task.id })).toEqual(before);
    }
    expect(f.harness.realtimeSignals).toHaveLength(signals);
    expect(f.get).not.toHaveBeenCalled();
  });

  it("keeps creator ID validation and rejects removed strict contract fields and errors", async () => {
    const f = await fixture();
    expect(() =>
      f.store.tasks.createTask({
        projectId: f.project.id,
        title: "Invalid",
        createdByThreadId: "bad id",
      }),
    ).toThrow();
    const task = await f.create(true);
    expect(
      tasksRpcContract.getTask.output.safeParse({ task: { ...task, creatorThreadBlocked: false } })
        .success,
    ).toBe(false);
    expect(
      tasksRpcContract.updateTask.output.safeParse({
        ok: false,
        error: { code: "creator_thread_open", message: "Legacy" },
      }).success,
    ).toBe(false);
  });
});
