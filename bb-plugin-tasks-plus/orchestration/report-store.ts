import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  workerReportSchema,
  type WorkerReport,
} from "./report-contract";

type Database = ReturnType<BbPluginApi["storage"]["database"]>;
type Row = { report: string; delivery: string };
const columns = "report_json AS report, delivery_json AS delivery";
const parse = (row: Row | undefined): WorkerReport | null =>
  row
    ? workerReportSchema.parse({
        ...JSON.parse(row.report),
        delivery: JSON.parse(row.delivery),
      })
    : null;

// Synchronous Tasks reads. No BB calls, comment reconstruction or handoff inference.
export function createReportStore(db: Database) {
  const get = (id: string) =>
    parse(
      db
        .prepare<[string], Row>(
          `SELECT ${columns} FROM orchestration_reports WHERE id=?`,
        )
        .get(id),
    );
  return {
    get,
    getForRun(id: string, runId: string): WorkerReport | null {
      const report = get(id);
      return report?.runId === runId ? report : null;
    },
    retry(threadId: string, key: string): WorkerReport | null {
      return parse(
        db
          .prepare<[string, string], Row>(
            `SELECT ${columns} FROM orchestration_reports WHERE thread_id=? AND retry_key=?`,
          )
          .get(threadId, key),
      );
    },
    latest(taskId: string): WorkerReport | null {
      return parse(
        db
          .prepare<[string], Row>(
            `SELECT ${columns} FROM orchestration_reports WHERE task_id=? ORDER BY created_at DESC, id DESC LIMIT 1`,
          )
          .get(taskId),
      );
    },
    decisions(
      taskId: string,
      limit = 5,
    ): { items: WorkerReport[]; total: number; omitted: number } {
      if (!Number.isInteger(limit) || limit < 0 || limit > 100)
        throw new Error("Decision limit must be 0..100");
      const total = db
        .prepare<[string], { total: number }>(
          "SELECT COUNT(*) AS total FROM orchestration_reports WHERE task_id=? AND outcome='needs_decision' AND decision_response IS NULL",
        )
        .get(taskId)!.total;
      const items = db
        .prepare<[string, number], Row>(
          `SELECT ${columns} FROM orchestration_reports WHERE task_id=? AND outcome='needs_decision' AND decision_response IS NULL ORDER BY created_at, id LIMIT ?`,
        )
        .all(taskId, limit)
        .map((row) => parse(row)!);
      return { items, total, omitted: total - items.length };
    },
    deliveries(
      taskId: string,
      limit = 5,
    ): { items: WorkerReport[]; total: number; omitted: number } {
      if (!Number.isInteger(limit) || limit < 0 || limit > 100)
        throw new Error("Delivery limit must be 0..100");
      const where =
        "task_id=? AND json_extract(delivery_json,'$.state') IN ('pending','queued','suppressed','failed','ambiguous')";
      const total = db
        .prepare<[string], { total: number }>(
          `SELECT COUNT(*) AS total FROM orchestration_reports WHERE ${where}`,
        )
        .get(taskId)!.total;
      const items = db
        .prepare<[string, number], Row>(
          `SELECT ${columns} FROM orchestration_reports WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
        .all(taskId, limit)
        .map((row) => parse(row)!);
      return { items, total, omitted: total - items.length };
    },
    save(report: WorkerReport) {
      const parsed = workerReportSchema.parse(report);
      const { delivery, ...immutable } = parsed;
      db.prepare(
        "INSERT INTO orchestration_reports(id,task_id,thread_id,retry_key,outcome,created_at,report_json,delivery_json) VALUES(?,?,?,?,?,?,?,?)",
      ).run(
        parsed.id,
        parsed.taskId,
        parsed.threadId,
        parsed.key,
        parsed.outcome,
        parsed.createdAt,
        JSON.stringify(immutable),
        JSON.stringify(delivery),
      );
      return parsed;
    },
  };
}
export type ReportStore = ReturnType<typeof createReportStore>;
