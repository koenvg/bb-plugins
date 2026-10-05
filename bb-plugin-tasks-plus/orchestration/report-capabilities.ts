import { createHash, randomBytes } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { REPORT_LIMITS, reportOriginSchema, type ReportOrigin } from "./report-contract";
import { refuse } from "./run-provenance";

type Database = ReturnType<BbPluginApi["storage"]["database"]>;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export function createReportCapabilities(db: Database) {
  return {
    issue(origin: ReportOrigin) {
      const parsed = reportOriginSchema.parse(origin);
      const count = db
        .prepare<[string, string, number], { total: number }>(
          "SELECT COUNT(*) AS total FROM orchestration_report_contexts WHERE task_id=? AND thread_id=? AND expires_at>?",
        )
        .get(parsed.taskId, parsed.threadId, Date.now())!.total;
      if (count >= REPORT_LIMITS.contextsPerWorker)
        refuse(
          "report_context_limit",
          "At most eight live report contexts per task/worker. Use an existing context or the native report tool.",
        );
      const token = randomBytes(32).toString("hex");
      db.prepare(
        "INSERT INTO orchestration_report_contexts(token_hash,task_id,thread_id,expires_at,origin_json) VALUES(?,?,?,?,?)",
      ).run(
        hash(token),
        parsed.taskId,
        parsed.threadId,
        Date.now() + REPORT_LIMITS.contextLifetimeMs,
        JSON.stringify(parsed),
      );
      return token;
    },
    read(token: string): { origin: ReportOrigin; expiresAt: number } {
      if (!/^[a-f0-9]{64}$/.test(token))
        refuse("report_context_invalid", "A native-tool-issued report context is required.");
      const row = db
        .prepare<[string], { origin: string; expiresAt: number }>(
          "SELECT origin_json AS origin, expires_at AS expiresAt FROM orchestration_report_contexts WHERE token_hash=?",
        )
        .get(hash(token));
      if (!row)
        refuse(
          "report_context_invalid",
          "Unknown report context. CLI thread IDs and metadata cannot issue one.",
        );
      return {
        origin: reportOriginSchema.parse(JSON.parse(row.origin)),
        expiresAt: row.expiresAt,
      };
    },
    revoke(token: string) {
      db.prepare("DELETE FROM orchestration_report_contexts WHERE token_hash=?").run(hash(token));
    },
  };
}
