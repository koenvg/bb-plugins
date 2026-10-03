import { randomUUID } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { runSchema, type ApprovedRun } from "./run-contract";

type Database = ReturnType<BbPluginApi["storage"]["database"]>;
export interface RunRequest {
  key: string;
  coordinator: string;
  action: "begin" | "pause" | "resume";
  decisionId: string;
  generation: string;
  phase: "pending" | "run" | "cancelled";
  runId: string | null;
  error?: { code: string; message: string };
}
export function createRunStore(db: Database) {
  const getRun = (id: string): ApprovedRun | null => {
    const row = db
      .prepare<
        [string],
        { payload: string }
      >("SELECT payload FROM orchestration_runs WHERE id = ?")
      .get(id);
    return row ? runSchema.parse(JSON.parse(row.payload)) : null;
  };
  const save = (run: ApprovedRun): ApprovedRun => {
    const parsed = runSchema.parse(run);
    db.prepare(
      "INSERT INTO orchestration_runs (id, epic_id, coordinator_thread_id, invocation_reference, payload) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
    ).run(
      parsed.id,
      parsed.epicId,
      parsed.coordinatorThreadId,
      parsed.invocationReference,
      JSON.stringify(parsed),
    );
    return parsed;
  };
  return {
    getRun,
    save,
    newId: () => randomUUID(),
    transaction<T>(fn: () => T): T {
      return db.transaction(fn)();
    },
    latestForEpic(epicId: string): ApprovedRun | null {
      const row = db
        .prepare<
          [string],
          { payload: string }
        >("SELECT payload FROM orchestration_runs WHERE epic_id = ? ORDER BY rowid DESC LIMIT 1")
        .get(epicId);
      return row ? runSchema.parse(JSON.parse(row.payload)) : null;
    },
    getRequest(key: string): RunRequest | null {
      const row = db
        .prepare<
          [string],
          { payload: string }
        >("SELECT payload FROM orchestration_run_requests WHERE invocation_reference = ?")
        .get(key);
      return row ? (JSON.parse(row.payload) as RunRequest) : null;
    },
    reserve(request: RunRequest): boolean {
      return (
        db
          .prepare(
            "INSERT INTO orchestration_run_requests (invocation_reference, payload) VALUES (?, ?) ON CONFLICT DO NOTHING",
          )
          .run(request.key, JSON.stringify(request)).changes === 1
      );
    },
    finish(request: RunRequest): void {
      db.prepare(
        "UPDATE orchestration_run_requests SET payload = ? WHERE invocation_reference = ?",
      ).run(JSON.stringify(request), request.key);
    },
  };
}
export type RunStore = ReturnType<typeof createRunStore>;
