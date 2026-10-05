import type { BbPluginApi } from "@get-bb/plugin-sdk";

type Database = ReturnType<BbPluginApi["storage"]["database"]>;
export interface ReportIntent {
  reportId: string;
  generation: string;
  bodyHash: string;
  receiptId: string | null;
  phase: "reserved" | "queued" | "dispatched" | "cancelled" | "rejected";
}

// Read-only access to retained historical receipts. No delivery writes or replay.
export function createReportIntents(db: Database) {
  const columns =
    "report_id AS reportId, generation, body_hash AS bodyHash, receipt_id AS receiptId, phase";
  const get = (reportId: string) =>
    db
      .prepare<[string], ReportIntent>(
        `SELECT ${columns} FROM orchestration_report_intents WHERE report_id=?`,
      )
      .get(reportId) ?? null;
  return {
    get,
    forReceipt(receiptId: string): ReportIntent | null {
      return (
        db
          .prepare<[string], ReportIntent>(
            `SELECT ${columns} FROM orchestration_report_intents WHERE receipt_id=?`,
          )
          .get(receiptId) ?? null
      );
    },
  };
}
