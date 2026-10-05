import { describe, expect, it } from "vitest";
import { reportFixture } from "./report-test-fixture";
import { createReportStore } from "./report-store";
import { STATUS_LIMITS } from "./status-contract";
import { initializeTasksSchema } from "../db/schema";

describe("Tasks-owned report readers and compact status", () => {
  it("reads absent reports before reporting and does not infer acceptance", async () => {
    const f = await reportFixture();
    const status = (await f.harness.behavior.callRpc("orchestrateStatus", {
      epicId: f.epic.id,
    })) as any;
    expect(status.status.subtasks[0].latestOutcome.state).toBe("absent");
    expect(status.status.subtasks[0].reportedDecisions.value).toMatchObject({
      items: [],
      total: 0,
      omitted: 0,
    });
    expect(status.status.acceptance.state).toBe("unknown");
    expect(f.harness.sdk.callsTo("threads.send")).toHaveLength(0);
  });
  it("keeps bounded summaries/results/baselines, unresolved questions and all uncertain deliveries with totals", async () => {
    const f = await reportFixture();
    f.harness.sdk.stub("threads.send", async () => {
      throw new Error("fixture lost response");
    });
    const reports = [];
    for (let index = 0; index < 7; index++)
      reports.push(
        await f.report({
          key: `question-${index}`,
          outcome: "needs_decision",
          summary: "S".repeat(2000),
          question: "Q".repeat(2000),
          resultReferences: Array.from({ length: 16 }, (_, n) => ({
            kind: "evidence",
            reference: `artifact:${n}`,
          })),
          baselineReferences: Array.from({ length: 16 }, (_, n) => `commit:${n}`),
        }),
      );
    const result = (await f.harness.behavior.callRpc("orchestrateStatus", {
      epicId: f.epic.id,
    })) as any;
    expect(result.ok).toBe(true);
    const task = result.status.subtasks[0];
    expect(task.latestOutcome.value.summary).toMatchObject({
      totalCharacters: 2000,
      omittedCharacters: 1760,
    });
    expect(task.latestOutcome.value.resultReferences).toMatchObject({
      total: 16,
      omitted: 11,
    });
    expect(task.latestOutcome.value.baselineReferences).toMatchObject({
      total: 16,
      omitted: 11,
    });
    expect(task.reportedDecisions.value).toMatchObject({
      total: 7,
      omitted: 2,
    });
    expect(task.reportDeliveries.value).toMatchObject({ total: 7, omitted: 2 });
    expect(
      task.reportedDecisions.value.items.every(
        (question: any) => question.threadId === "thr_worker" && question.taskId === f.task.id,
      ),
    ).toBe(true);
    const readers = createReportStore(f.bb.storage.database());
    expect(readers.decisions(f.task.id, 2)).toMatchObject({
      total: 7,
      omitted: 5,
    });
    expect(readers.deliveries(f.task.id, 2)).toMatchObject({
      total: 7,
      omitted: 5,
    });
    expect(readers.getForRun(reports[0]!.id, f.input.runId)?.question).toHaveLength(2000);
    expect(() => readers.decisions(f.task.id, 101)).toThrow(/limit/);
    expect(() => readers.deliveries(f.task.id, -1)).toThrow(/limit/);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(STATUS_LIMITS.bytes);
  });
  it("keeps questions and result provenance readable after detach and does not silently resolve them", async () => {
    const f = await reportFixture();
    const report = await f.report({
      outcome: "needs_decision",
      question: "Which baseline?",
    });
    await f.detach();
    const status = (await f.harness.behavior.callRpc("orchestrateStatus", {
      epicId: f.epic.id,
    })) as any;
    expect(status.status.subtasks[0].reportedDecisions.value.items[0]).toMatchObject({
      id: report.id,
      taskId: f.task.id,
      threadId: "thr_worker",
      state: "pending",
    });
    expect(status.status.subtasks[0].latestOutcome.value).toMatchObject({
      id: report.id,
      associationId: report.associationId,
      runId: f.input.runId,
    });
  });
  it.each(["done", "canceled"])(
    "never equates completed reports or prerequisite %s with delivered artifacts",
    async (prerequisiteStatus) => {
      const f = await reportFixture(2);
      await f.report({ outcome: "completed" });
      f.store.tasks.updateTask(f.task.id, {
        status: prerequisiteStatus as "done" | "canceled",
      });
      f.store.tasks.addTaskDependency(f.task.id, f.tasks[1]!.id);
      const result = (await f.harness.behavior.callRpc("orchestrateStatus", {
        epicId: f.epic.id,
      })) as any;
      const downstream = result.status.subtasks.find((task: any) => task.id === f.tasks[1]!.id);
      expect(downstream.nativeReadiness).toBe("ready");
      expect(downstream.handoff.state).toBe("unknown");
      expect(result.status.acceptance.state).toBe("unknown");
      expect(
        await f.harness.behavior.callRpc("orchestrateDispatch", {
          ...f.input,
          taskId: f.tasks[1]!.id,
        }),
      ).toMatchObject({ outcome: "deferred", claim: null });
      expect(f.harness.sdk.callsTo("threads.spawn")).toHaveLength(0);
    },
  );
  it("migration 10 preserves version-9 records and has no association-delete cascade", async () => {
    const f = await reportFixture();
    const db = f.bb.storage.database();
    const read = () =>
      [
        "tasks",
        "comments",
        "task_threads",
        "orchestration_runs",
        "orchestration_owners",
        "orchestration_dispatch_claims",
      ].map((table) => db.prepare(`SELECT * FROM ${table}`).all());
    const before = read();
    db.exec(
      "DROP TABLE orchestration_report_intents; DROP TABLE orchestration_report_contexts; DROP TABLE orchestration_reports; DELETE FROM schema_version WHERE version=10;",
    );
    initializeTasksSchema(db);
    expect(read()).toEqual(before);
    expect(db.prepare("SELECT version FROM schema_version ORDER BY version").all()).toHaveLength(
      11,
    );
    initializeTasksSchema(db);
    expect(db.prepare("SELECT version FROM schema_version ORDER BY version").all()).toHaveLength(
      11,
    );
    const report = await f.report();
    await f.detach();
    expect(createReportStore(db).get(report.id)?.commentId).toBe(report.commentId);
  });
});
