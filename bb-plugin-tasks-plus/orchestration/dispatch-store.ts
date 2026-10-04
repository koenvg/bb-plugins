import { randomUUID } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  claimSchema,
  type DispatchClaim,
  type WorkerRole,
} from "./dispatch-contract";

type Database = ReturnType<BbPluginApi["storage"]["database"]>;
export interface Owner {
  taskId: string;
  role: WorkerRole;
  associationId: string;
  threadId: string;
  runId: string;
}
const claimColumns = `id, task_id AS taskId, role, run_id AS runId, coordinator_thread_id AS coordinatorThreadId, phase, thread_id AS threadId, association_id AS associationId, created_at AS createdAt, updated_at AS updatedAt, released_at AS releasedAt, reason`;
const ownerColumns = `task_id AS taskId, role, association_id AS associationId, thread_id AS threadId, run_id AS runId`;
export function createDispatchStore(db: Database) {
  const read = (where: string, value: string): DispatchClaim | null => {
    const row = db
      .prepare<
        [string],
        DispatchClaim
      >(`SELECT ${claimColumns} FROM orchestration_dispatch_claims WHERE ${where}`)
      .get(value);
    return row ? claimSchema.parse(row) : null;
  };
  return {
    get: (id: string) => read("id = ?", id),
    // Two rows are sufficient to refuse ambiguity. This is not a complete-list API.
    forThread(thread: string): DispatchClaim[] {
      return db
        .prepare<[string], DispatchClaim>(
          `SELECT ${claimColumns} FROM orchestration_dispatch_claims WHERE thread_id = ? AND released_at IS NULL ORDER BY id LIMIT 2`,
        )
        .all(thread)
        .map((row) => claimSchema.parse(row));
    },
    // Existence only: released originals are not unowned legacy candidates.
    hasHistoryForThread(threadId: string): boolean {
      return !!db.prepare<[string], { found: number }>(
        "SELECT 1 AS found FROM orchestration_dispatch_claims WHERE thread_id = ? LIMIT 1",
      ).get(threadId);
    },
    live(taskId: string, role: WorkerRole): DispatchClaim | null {
      const row = db
        .prepare<
          [string, string],
          DispatchClaim
        >(`SELECT ${claimColumns} FROM orchestration_dispatch_claims WHERE task_id = ? AND role = ? AND released_at IS NULL`)
        .get(taskId, role);
      return row ? claimSchema.parse(row) : null;
    },
    claims(taskId: string): DispatchClaim[] {
      return db
        .prepare<[string], DispatchClaim>(
          `SELECT ${claimColumns} FROM orchestration_dispatch_claims WHERE task_id = ? AND released_at IS NULL ORDER BY role`,
        )
        .all(taskId)
        .map((row) => claimSchema.parse(row));
    },
    owners(taskId: string): Owner[] {
      return db
        .prepare<
          [string],
          Owner
        >(`SELECT ${ownerColumns} FROM orchestration_owners WHERE task_id = ? ORDER BY role`)
        .all(taskId);
    },
    reserve(input: {
      taskId: string;
      role: WorkerRole;
      runId: string;
      coordinatorThreadId: string;
    }): DispatchClaim {
      const now = new Date().toISOString();
      const claim: DispatchClaim = {
        ...input,
        id: randomUUID(),
        phase: "reserved",
        threadId: null,
        associationId: null,
        createdAt: now,
        updatedAt: now,
        releasedAt: null,
        reason: null,
      };
      db.prepare(
        `INSERT INTO orchestration_dispatch_claims(id,task_id,role,run_id,coordinator_thread_id,phase,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`,
      ).run(
        claim.id,
        claim.taskId,
        claim.role,
        claim.runId,
        claim.coordinatorThreadId,
        claim.phase,
        now,
        now,
      );
      return claim;
    },
    update(
      id: string,
      change: Partial<
        Pick<DispatchClaim, "phase" | "threadId" | "associationId" | "reason">
      >,
    ): DispatchClaim {
      const row = read("id = ?", id);
      if (!row) throw new Error("Dispatch claim missing");
      const next = claimSchema.parse({
        ...row,
        ...change,
        updatedAt: new Date().toISOString(),
      });
      db.prepare(
        `UPDATE orchestration_dispatch_claims SET phase=?,thread_id=?,association_id=?,updated_at=?,reason=? WHERE id=?`,
      ).run(
        next.phase,
        next.threadId,
        next.associationId,
        next.updatedAt,
        next.reason,
        id,
      );
      return next;
    },
    designate(owner: Owner) {
      db.prepare(
        `INSERT INTO orchestration_owners(task_id,role,association_id,thread_id,run_id) VALUES(?,?,?,?,?)`,
      ).run(
        owner.taskId,
        owner.role,
        owner.associationId,
        owner.threadId,
        owner.runId,
      );
      const result = db
        .prepare(
          `UPDATE task_threads SET role=?,primary_owner=1 WHERE id=? AND task_id=? AND thread_id=?`,
        )
        .run(owner.role, owner.associationId, owner.taskId, owner.threadId);
      if (result.changes !== 1) throw new Error("Owner association changed");
    },
    latest(taskId: string, role: WorkerRole): DispatchClaim | null {
      const row = db
        .prepare<
          [string, string],
          DispatchClaim
        >(`SELECT ${claimColumns} FROM orchestration_dispatch_claims WHERE task_id=? AND role=? ORDER BY rowid DESC LIMIT 1`)
        .get(taskId, role);
      return row ? claimSchema.parse(row) : null;
    },
    // Call within a Tasks transaction. Retain the claim and association for history.
    release(id: string, reason: string): DispatchClaim {
      const claim = read("id = ?", id);
      if (!claim || claim.releasedAt) throw new Error("Live claim changed");
      const now = new Date().toISOString();
      db.prepare(`UPDATE task_threads SET primary_owner=0 WHERE id=?`).run(
        claim.associationId,
      );
      db.prepare(
        `DELETE FROM orchestration_owners WHERE task_id=? AND role=? AND run_id=? AND thread_id=?`,
      ).run(claim.taskId, claim.role, claim.runId, claim.threadId);
      db.prepare(
        `UPDATE orchestration_dispatch_claims SET released_at=?,updated_at=?,reason=? WHERE id=? AND released_at IS NULL`,
      ).run(now, now, reason, id);
      return read("id = ?", id)!;
    },
    priorWork(taskId: string): boolean {
      return !!db
        .prepare<
          [string, string, string],
          { found: number }
        >(`SELECT 1 AS found WHERE EXISTS(SELECT 1 FROM comments WHERE task_id=? AND (kind='agent' OR thread_id IS NOT NULL)) OR EXISTS(SELECT 1 FROM attachments WHERE task_id=?) OR EXISTS(SELECT 1 FROM orchestration_dispatch_claims WHERE task_id=?)`)
        .get(taskId, taskId, taskId);
    },
  };
}
export type DispatchStore = ReturnType<typeof createDispatchStore>;
