import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createTasksStore } from "../db";

type Database = ReturnType<BbPluginApi["storage"]["database"]>;

const historicalTables = [
  "schema_version",
  "orchestration_runs",
  "orchestration_run_requests",
  "orchestration_owners",
  "orchestration_dispatch_claims",
  "orchestration_reports",
  "orchestration_report_intents",
  "orchestration_report_contexts",
] as const;

export function readHistory(db: Database) {
  return Object.fromEntries(
    historicalTables.map((table) => [
      table,
      db.prepare<[], Record<string, unknown>>(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    ]),
  );
}

export function seedHistory(db: Database) {
  const store = createTasksStore(db);
  const project = store.createProject({
    name: "Historical work",
    prefix: "HIST",
    color: "blue",
    linkedBbProjectId: "proj_history",
  });
  const epic = store.createTask({ projectId: project.id, title: "Historical epic" });
  const task = store.createTask({
    projectId: project.id,
    title: "Existing worker",
    parentTaskId: epic.id,
    status: "in_progress",
  });
  const association = store.upsertTaskThread({
    taskId: task.id,
    threadId: "thr_history",
    presetName: "Historical",
    title: task.title,
    liveStatus: "working",
  });
  const comment = store.createComment({
    taskId: task.id,
    kind: "agent",
    authorName: "Historical worker",
    threadId: association.threadId,
    body: "Historical outcome, preserved without replay.",
  });
  const time = "2026-10-05T10:00:00.000Z";
  const run = JSON.stringify({ id: "run-history", phase: "active", epicId: epic.id });
  const origin = JSON.stringify({
    taskId: task.id,
    threadId: association.threadId,
    bbProjectId: "proj_history",
    associationId: association.id,
    claimId: "claim-history",
    runId: "run-history",
  });
  db.prepare("INSERT INTO orchestration_runs VALUES (?, ?, ?, ?, ?)").run(
    "run-history",
    epic.id,
    "thr_coordinator",
    "invocation-history",
    run,
  );
  db.prepare("INSERT INTO orchestration_run_requests VALUES (?, ?)").run(
    "pending-approval",
    JSON.stringify({ state: "pending", proposal: { epicId: epic.id } }),
  );
  db.prepare("UPDATE task_threads SET role = 'implementation', primary_owner = 1 WHERE id = ?").run(
    association.id,
  );
  db.prepare("INSERT INTO orchestration_owners VALUES (?, ?, ?, ?, ?)").run(
    task.id,
    "implementation",
    association.id,
    association.threadId,
    "run-history",
  );
  db.prepare(`INSERT INTO orchestration_dispatch_claims
    (id, task_id, role, run_id, coordinator_thread_id, phase, thread_id, association_id,
     created_at, updated_at, released_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    "claim-history",
    task.id,
    "implementation",
    "run-history",
    "thr_coordinator",
    "creation_unknown",
    association.threadId,
    association.id,
    time,
    time,
    null,
    "Historical uncertainty",
  );
  db.prepare(`INSERT INTO orchestration_reports
    (id, task_id, thread_id, retry_key, outcome, created_at, report_json, delivery_json, decision_response)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    "report-history",
    task.id,
    association.threadId,
    "retry-history",
    "needs_decision",
    time,
    JSON.stringify({
      summary: "Needs operator decision",
      question: "Continue?",
      commentId: comment.id,
      origin,
    }),
    JSON.stringify({ state: "queued", reference: "receipt-history" }),
    null,
  );
  db.prepare("INSERT INTO orchestration_report_intents VALUES (?, ?, ?, ?, ?)").run(
    "report-history",
    "generation-history",
    "body-hash",
    "receipt-history",
    "queued",
  );
  db.prepare("INSERT INTO orchestration_report_contexts VALUES (?, ?, ?, ?, ?)").run(
    "a".repeat(64),
    task.id,
    association.threadId,
    Date.now() + 86_400_000,
    origin,
  );
  return { epic, task, association, comment };
}
