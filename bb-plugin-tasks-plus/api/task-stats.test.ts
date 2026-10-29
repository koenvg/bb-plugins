import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it } from "vitest";
import { createStore } from ".";
import { tasksRpcContract, type TaskStatus } from "../shared/contract.js";
import plugin from "../server";

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (disposers.length) await disposers.pop()!();
});

async function setup() {
  const { bb, harness } = createFakePluginHost({ pluginId: "task-stats" });
  disposers.push(() => harness.dispose());
  await plugin(bb);
  const store = createStore(bb);
  const db = bb.storage.database();
  const alpha = store.tasks.createProject({ name: "Alpha", prefix: "A", color: "blue" });
  const beta = store.tasks.createProject({ name: "Beta", prefix: "B", color: "green" });
  function task(
    projectId: string,
    title: string,
    statuses: TaskStatus[],
    milliseconds: number,
    parentTaskId?: string,
  ) {
    const created = store.tasks.createTask({ projectId, title, status: "todo", parentTaskId });
    for (const status of statuses) store.tasks.updateTask(created.id, { status });
    const history = store.tasks.listTaskStatusTransitions(created.id);
    for (const [index, transition] of history.entries()) {
      db.prepare("UPDATE task_status_transitions SET changed_at = ? WHERE id = ?").run(
        new Date(index === 0 ? 0 : milliseconds).toISOString(),
        transition.id,
      );
    }
    return created;
  }
  return { harness, store, db, alpha, beta, task };
}

describe("public getTaskStats RPC", () => {
  it("reads more than 500 tasks across projects and counts subtasks independently", async () => {
    const f = await setup();
    f.db.transaction(() => {
      const parent = f.task(f.alpha.id, "Parent", ["in_progress", "done"], 10);
      for (let i = 1; i < 501; i++)
        f.task(
          f.alpha.id,
          `Alpha ${i}`,
          ["in_progress", "done"],
          10,
          i === 1 ? parent.id : undefined,
        );
      f.task(f.beta.id, "Beta", ["in_progress", "done"], 20);
    })();
    const all = tasksRpcContract.getTaskStats.output.parse(
      await f.harness.behavior.callRpc("getTaskStats", {}),
    );
    expect(all).toMatchObject({
      summary: { count: 502, medianMs: 10, averageMs: 5030 / 502 },
      byProject: [
        { id: f.alpha.id, count: 501, medianMs: 10, averageMs: 10 },
        { id: f.beta.id, count: 1, medianMs: 20, averageMs: 20 },
      ],
      interrupted: { count: 0 },
      canceledCount: 0,
      unavailableCompletedCount: 0,
    });
    const beta = tasksRpcContract.getTaskStats.output.parse(
      await f.harness.behavior.callRpc("getTaskStats", { projectId: f.beta.id }),
    );
    expect(beta).toMatchObject({
      summary: { count: 1, medianMs: 20, averageMs: 20 },
      byProject: [{ id: f.beta.id, count: 1 }],
      slowest: [{ key: "B-1", milliseconds: 20 }],
    });
    expect(beta.byProject).toHaveLength(1);
    expect(all.slowest).toHaveLength(5);
  });

  it("keeps interruptions separate, includes review/reopen time, and never infers missing history", async () => {
    const f = await setup();
    const review = f.task(
      f.alpha.id,
      "Review and reopen",
      ["in_progress", "in_review", "done", "in_progress", "done"],
      40,
    );
    const history = f.store.tasks.listTaskStatusTransitions(review.id);
    f.db
      .prepare("UPDATE task_status_transitions SET changed_at = ? WHERE id = ?")
      .run(new Date(100).toISOString(), history[1]!.id);
    f.task(f.alpha.id, "Zero", ["in_progress", "done"], 0);
    f.task(f.beta.id, "Interrupted", ["in_progress", "todo", "in_progress", "done"], 200);
    f.task(f.beta.id, "Canceled", ["in_progress", "canceled"], 500);
    f.task(f.beta.id, "Still working", ["in_progress", "in_review"], 500);
    f.task(f.beta.id, "Missing start", ["done"], 500);
    f.task(f.beta.id, "Missing all history", [], 0);
    const legacy = f.store.tasks.createTask({
      projectId: f.beta.id,
      title: "Legacy done",
      status: "done",
    });
    f.store.tasks.updateTask(legacy.id, { status: "in_progress" });
    f.store.tasks.updateTask(legacy.id, { status: "done" });
    const hidden = tasksRpcContract.getTaskStats.output.parse(
      await f.harness.behavior.callRpc("getTaskStats", {}),
    );
    const shown = tasksRpcContract.getTaskStats.output.parse(
      await f.harness.behavior.callRpc("getTaskStats", { includeInterrupted: true }),
    );
    expect(hidden).toMatchObject({
      summary: { count: 2, medianMs: 20, averageMs: 20 },
      canceledCount: 1,
      unavailableCompletedCount: 2,
      interrupted: { count: 1 },
    });
    expect(
      hidden.slowest.map((row: { title: string; milliseconds: number }) => [
        row.title,
        row.milliseconds,
      ]),
    ).toEqual([
      ["Review and reopen", 40],
      ["Zero", 0],
    ]);
    expect(shown.interrupted.tasks).toMatchObject([{ key: "B-1", milliseconds: 200 }]);
    expect({ ...shown, interrupted: hidden.interrupted }).toEqual(hidden);
    expect(
      await f.harness.behavior.callRpc("getTaskStats", { projectId: f.beta.id }),
    ).toMatchObject({
      summary: { count: 0, medianMs: null, averageMs: null },
      slowest: [],
      interrupted: { count: 1 },
      canceledCount: 1,
    });
  });

  it("attributes persisted work to current project metadata and priority", async () => {
    const f = await setup();
    const task = f.task(f.alpha.id, "Reprioritized", ["in_progress", "done"], 12);
    await f.harness.behavior.callRpc("updateTask", { taskId: task.id, priority: "high" });
    await f.harness.behavior.callRpc("updateProject", {
      projectId: f.alpha.id,
      name: "Renamed project",
      color: "purple",
    });
    const stats = tasksRpcContract.getTaskStats.output.parse(
      await f.harness.behavior.callRpc("getTaskStats", { projectId: f.alpha.id }),
    );
    expect(stats.byProject).toEqual([
      {
        id: f.alpha.id,
        name: "Renamed project",
        color: "purple",
        count: 1,
        medianMs: 12,
        averageMs: 12,
      },
    ]);
    expect(stats.byPriority).toEqual([
      { priority: "urgent", count: 0, medianMs: null, averageMs: null },
      { priority: "high", count: 1, medianMs: 12, averageMs: 12 },
      { priority: "medium", count: 0, medianMs: null, averageMs: null },
      { priority: "low", count: 0, medianMs: null, averageMs: null },
      { priority: "none", count: 0, medianMs: null, averageMs: null },
    ]);
    expect(stats.slowest).toMatchObject([{ id: task.id, priority: "high", milliseconds: 12 }]);
  });

  it("validates optional filters and returns explicit empty measures", async () => {
    const f = await setup();
    await expect(
      f.harness.behavior.callRpc("getTaskStats", { projectId: "not-an-id" }),
    ).rejects.toThrow();
    await expect(
      f.harness.behavior.callRpc("getTaskStats", { includeInterrupted: "yes" }),
    ).rejects.toThrow();
    expect(await f.harness.behavior.callRpc("getTaskStats", {})).toMatchObject({
      summary: { count: 0, medianMs: null, averageMs: null },
      byPriority: [
        { priority: "urgent", count: 0 },
        { priority: "high", count: 0 },
        { priority: "medium", count: 0 },
        { priority: "low", count: 0 },
        { priority: "none", count: 0 },
      ],
    });
  });
});
