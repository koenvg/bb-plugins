import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import { orchestrationStatusContract } from "./status-contract";
import { setup } from "./status-test-fixture";

describe("compact epic status public contract", () => {
  it("reads a three-independent-plus-one-dependent frontier without any mutations or a run", async () => {
    const f = setup();
    const [a, b, c, d] = [
      f.child("A"),
      f.child("B"),
      f.child("C"),
      f.child("D"),
    ];
    f.store.tasks.addTaskDependency(a.id, d.id);
    f.store.tasks.addTaskDependency(b.id, d.id);
    f.attach(c.id, "thr_idle");
    const before = f.bb.storage
      .database()
      .prepare("SELECT total_changes() AS n")
      .get();
    const result = await f.read();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(
      result.status.subtasks.map((t) => [t.id, t.nativeReadiness]),
    ).toEqual([
      [a.id, "ready"],
      [b.id, "ready"],
      [c.id, "ready"],
      [d.id, "blocked"],
    ]);
    expect(result.status.subtasks[3]?.dependencies.map((t) => t.id)).toEqual([
      a.id,
      b.id,
    ]);
    expect(result.status.run).toEqual({
      state: "unknown",
      reason: "run_extension_unavailable",
    });
    expect(result.status.subtasks[2]?.workers.items[0]?.activity).toMatchObject(
      { state: "fresh", value: "idle", observedAt: expect.any(String) },
    );
    expect(
      f.bb.storage.database().prepare("SELECT total_changes() AS n").get(),
    ).toEqual(before);
    expect(f.spawn).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
  });

  it("keeps idle, missing, deleted and failed workers separate from ticket status", async () => {
    const f = setup();
    for (const name of ["idle", "missing", "deleted", "failed", "unknown"])
      f.attach(f.child(name, "in_progress").id, `thr_${name}`);
    const result = await f.read();
    if (!result.ok) throw new Error(result.error.message);
    expect(result.status.subtasks.map((t) => t.status)).toEqual(
      Array(5).fill("in_progress"),
    );
    expect(
      result.status.subtasks.map((t) => t.workers.items[0]?.activity.value),
    ).toEqual(["idle", "missing", "deleted", "failed", "unknown"]);
    expect(result.status.subtasks[4]?.workers.items[0]?.activity).toMatchObject(
      { state: "stale", cachedValue: "idle", cachedAt: expect.any(String) },
    );
    expect(
      result.status.subtasks.every(
        (t) => t.ownership.state === "resolution_needed",
      ),
    ).toBe(true);
  });

  it("reflects manual association changes and prior agent work without guessing untouched", async () => {
    const f = setup();
    const task = f.child("Prior work");
    const association = f.attach(task.id, "thr_idle");
    f.store.tasks.createComment({
      taskId: task.id,
      kind: "agent",
      authorName: "Worker",
      threadId: "thr_idle",
      body: "A huge comment is not a report".repeat(10000),
    });
    f.store.tasks.deleteTaskThread(association.id);
    let result = await f.read();
    if (!result.ok) throw new Error(result.error.message);
    expect(result.status.subtasks[0]).toMatchObject({
      ownership: { state: "resolution_needed" },
      priorWork: true,
      latestOutcome: { state: "unknown" },
      workers: { total: 0 },
    });
    f.attach(task.id, "thr_idle");
    result = await f.read();
    if (!result.ok) throw new Error(result.error.message);
    expect(result.status.subtasks[0]?.workers.total).toBe(1);
  });

  it("does not turn resolved dependencies or all-done totals into artifact handoffs or acceptance", async () => {
    const f = setup();
    const [a, b] = [f.child("Producer", "done"), f.child("Consumer", "done")];
    f.store.tasks.addTaskDependency(a.id, b.id);
    const result = await f.read();
    if (!result.ok) throw new Error(result.error.message);
    expect(result.status.subtasks[1]).toMatchObject({
      nativeReadiness: "ready",
      handoff: { state: "unknown" },
    });
    expect(result.status.totals.done).toBe(2);
    expect(result.status.acceptance).toEqual({
      state: "unknown",
      reason: "acceptance_extension_unavailable",
    });
    expect(result.status.epic.status).toBe("in_progress");
  });

  it("exposes status via CLI, validates arguments and reports not-found/size errors", async () => {
    const f = setup();
    f.child("CLI child");
    const cli = await f.harness.runCli([
      "orchestrate",
      "status",
      f.epic.key.toLowerCase(),
      "--json",
    ]);
    expect(cli.exitCode, cli.stderr).toBe(0);
    expect(JSON.parse(cli.stdout)).toMatchObject({
      ok: true,
      status: {
        epic: { id: f.epic.id },
        subtasks: [{ title: { text: "CLI child" } }],
      },
    });
    expect(
      (await f.harness.runCli(["orchestrate", "status", "--help"])).stdout,
    ).toContain("128 KiB");
    expect(
      (
        await f.harness.runCli([
          "orchestrate",
          "status",
          f.epic.key,
          "--bogus",
          "--json",
        ])
      ).exitCode,
    ).toBe(1);
    expect(
      JSON.parse(
        (
          await f.harness.runCli([
            "orchestrate",
            "status",
            "STAT-999",
            "--json",
          ])
        ).stdout,
      ),
    ).toMatchObject({ ok: false, error: { code: "task_not_found" } });
    expect(
      orchestrationStatusContract.orchestrateStatus.input.safeParse({
        epicId: f.epic.id,
        mutate: true,
      }).success,
    ).toBe(false);
    for (let i = 0; i < 100; i++) f.child(String(i));
    const oversized = await f.harness.runCli([
      "orchestrate",
      "status",
      f.epic.id,
      "--json",
    ]);
    expect(oversized.exitCode).toBe(1);
    expect(JSON.parse(oversized.stdout)).toMatchObject({
      ok: false,
      error: { code: "epic_status_size_limit", counts: { subtasks: 101 } },
    });
  });

  it("collects pending native decisions, caps questions, and distinguishes failed interaction reads", async () => {
    const f = setup();
    const worker = f.attach(f.child("Questions").id, "thr_questions");
    f.attach(f.child("Unavailable questions").id, "thr_no_interactions");
    f.list.mockImplementation(async ({ threadId }) => {
      if (threadId === "thr_no_interactions") throw new Error("unavailable");
      return Array.from({ length: 9 }, (_, i) => ({
        id: `interaction-${i}`,
        threadId,
        turnId: null,
        createdAt: Date.now(),
        resolvedAt: null,
        status:
          i === 8
            ? ("resolved" as const)
            : i === 7
              ? ("resolving" as const)
              : ("pending" as const),
        statusReason: null,
        resolution: null,
        origin: {
          kind: "plugin" as const,
          pluginId: "fixture",
          rendererId: "form",
        },
        payload: {
          kind: "plugin" as const,
          title: "😀".repeat(1000),
          data: null,
        },
      }));
    });
    const result = await f.read();
    if (!result.ok) throw new Error(result.error.message);
    const decisions = result.status.subtasks[0]?.workers.items[0]?.decisions;
    expect(decisions).toMatchObject({ state: "fresh", total: 8, omitted: 3 });
    expect(decisions?.items[0]).toMatchObject({
      taskId: worker.taskId,
      threadId: worker.threadId,
      question: { totalCharacters: 1000, omittedCharacters: 760 },
    });
    expect(result.status.subtasks[0]?.nativeDecisions).toMatchObject({
      state: "fresh",
      knownPending: 8,
      omitted: 3,
      unobservedWorkers: 0,
    });
    expect(Array.from(decisions!.items[0]!.question.text)).toHaveLength(240);
    expect(
      result.status.subtasks[1]?.workers.items[0]?.decisions,
    ).toMatchObject({
      state: "unknown",
      total: null,
      omitted: null,
      observedAt: null,
    });
  });

  it("rejects mismatched external identities instead of attributing another worker's decisions", async () => {
    const f = setup();
    f.attach(f.child("Wrong identity").id, "thr_requested");
    f.get.mockImplementation(async () =>
      makeThreadResponse({ id: "thr_other", status: "idle" }),
    );
    const result = await f.read();
    if (!result.ok) throw new Error(result.error.message);
    expect(result.status.subtasks[0]?.workers.items[0]?.activity).toMatchObject(
      { state: "stale", value: "unknown" },
    );
    expect(f.list).not.toHaveBeenCalled();
  });

  it("includes cross-project and canceled native blockers with separate unresolved handoff state", async () => {
    const f = setup();
    const externalProject = f.store.tasks.createProject({
      name: "External disposable",
      prefix: "EXT",
      color: "blue",
    });
    const blocker = f.store.tasks.createTask({
      projectId: externalProject.id,
      title: "External deliverable",
      status: "canceled",
    });
    const task = f.child("Consumer");
    f.store.tasks.addTaskDependency(blocker.id, task.id);
    let result = await f.read();
    if (!result.ok) throw new Error(result.error.message);
    expect(result.status.subtasks[0]).toMatchObject({
      nativeReadiness: "ready",
      dependencies: [{ key: "EXT-1", status: "canceled" }],
      handoff: {
        state: "unknown",
        reason: "canceled_prerequisite_requires_handoff_decision",
      },
    });
    f.store.tasks.updateTask(blocker.id, { status: "todo" });
    result = await f.read();
    if (!result.ok) throw new Error(result.error.message);
    expect(result.status.subtasks[0]).toMatchObject({
      nativeReadiness: "blocked",
      openBlockerCount: 1,
      handoff: { state: "blocked" },
    });
  });
});
