import { createHash } from "node:crypto";

import type { HistoryDatabase } from "../storage/history-storage.js";
import {
  identityBatchSchema,
  confirmedRelationshipSchema,
  type IdentityBatch,
  type AttributionView,
} from "./identity-contract.js";
import {
  resolveCandidates,
  type ConfirmedRelationship,
  type AttributionGrade,
} from "./identity-resolution.js";

// Scalar attribution data is independent of immutable payloads and replay owners.
export function initializeIdentityStorage(db: HistoryDatabase) {
  db.exec(`CREATE TABLE IF NOT EXISTS identity_receipt (id INTEGER PRIMARY KEY CHECK(id=1), host_id TEXT, generation INTEGER NOT NULL, received INTEGER NOT NULL, complete INTEGER NOT NULL, revision INTEGER NOT NULL, backfill INTEGER NOT NULL, backfilled INTEGER NOT NULL, expected_total INTEGER, evidence_changed INTEGER NOT NULL);
    INSERT OR IGNORE INTO identity_receipt VALUES (1,NULL,0,0,0,0,0,0,NULL,0);
    CREATE TABLE IF NOT EXISTS identity_generations (generation INTEGER PRIMARY KEY, complete INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS identity_batches (generation INTEGER NOT NULL, offset INTEGER NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(generation,offset));
    CREATE TABLE IF NOT EXISTS identity_edges (generation INTEGER NOT NULL, provider_identity TEXT NOT NULL, thread_id TEXT NOT NULL, PRIMARY KEY(generation,provider_identity,thread_id));
    CREATE INDEX IF NOT EXISTS identity_provider ON identity_edges(provider_identity,generation,thread_id);
    CREATE TABLE IF NOT EXISTS identity_uncertain (thread_id TEXT NOT NULL, provider_identity TEXT NOT NULL, PRIMARY KEY(thread_id,provider_identity));
    CREATE INDEX IF NOT EXISTS identity_uncertain_provider ON identity_uncertain(provider_identity);
    CREATE TABLE IF NOT EXISTS identity_metadata (generation INTEGER NOT NULL, thread_id TEXT NOT NULL, title TEXT, state TEXT NOT NULL, PRIMARY KEY(generation,thread_id));
    CREATE TABLE IF NOT EXISTS identity_imports (session_id TEXT NOT NULL, provider_identity TEXT NOT NULL, workspace TEXT NOT NULL, PRIMARY KEY(session_id,workspace,provider_identity));
    CREATE TABLE IF NOT EXISTS identity_aliases (recorded TEXT NOT NULL, verified TEXT NOT NULL, PRIMARY KEY(recorded,verified));
    CREATE TABLE IF NOT EXISTS identity_usage (event_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, workspace TEXT NOT NULL, provider_key TEXT, claim TEXT, occurred_at TEXT NOT NULL, total INTEGER NOT NULL, accepted INTEGER NOT NULL, grade TEXT NOT NULL DEFAULT 'workspace-only', thread_id TEXT, revision INTEGER NOT NULL DEFAULT -1, projected INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS identity_pending ON identity_usage(revision,event_id);
    CREATE INDEX IF NOT EXISTS identity_expiry ON identity_usage(occurred_at,event_id);
    CREATE TABLE IF NOT EXISTS identity_grade_totals (grade TEXT PRIMARY KEY, total_tokens INTEGER NOT NULL, events INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS identity_totals (grade TEXT NOT NULL, thread_id TEXT NOT NULL, total_tokens INTEGER NOT NULL, events INTEGER NOT NULL, PRIMARY KEY(grade,thread_id));
    CREATE INDEX IF NOT EXISTS identity_ranking ON identity_totals(grade,total_tokens DESC,thread_id);
    CREATE TRIGGER IF NOT EXISTS identity_capture AFTER INSERT ON usage_events BEGIN
      INSERT OR IGNORE INTO identity_usage(event_id,session_id,workspace,provider_key,claim,occurred_at,total,accepted)
      VALUES(new.event_id,new.session_id,new.workspace,json_extract(new.payload,'$.providerSessionKey'),json_extract(new.payload,'$.claimedThreadId'),json_extract(new.payload,'$.occurredAt'),new.total,new.accepted);
    END;
    CREATE TRIGGER IF NOT EXISTS identity_exclude AFTER UPDATE OF accepted ON usage_events BEGIN
      UPDATE identity_usage SET accepted=new.accepted,revision=-1 WHERE event_id=new.event_id;
    END;`);
  if (
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='usage_compact'").get()
  ) {
    db.exec(`CREATE TRIGGER IF NOT EXISTS identity_compact_capture AFTER INSERT ON usage_compact BEGIN
      INSERT OR IGNORE INTO identity_usage(event_id,session_id,workspace,provider_key,claim,occurred_at,total,accepted)
      VALUES(new.event_id,new.session_id,new.workspace,new.provider_key,new.claimed_thread,new.occurred_at,new.total,new.accepted);
      END;
      CREATE TRIGGER IF NOT EXISTS identity_compact_exclude AFTER UPDATE OF accepted ON usage_compact BEGIN
      UPDATE identity_usage SET accepted=new.accepted,revision=-1 WHERE event_id=new.event_id;
      END;`);
  }
}
type Receipt = {
  host_id: string | null;
  generation: number;
  received: number;
  complete: number;
  revision: number;
  backfill: number;
  backfilled: number;
  expected_total: number | null;
  evidence_changed: number;
};
const receipt = (db: HistoryDatabase) =>
  db.prepare("SELECT * FROM identity_receipt WHERE id=1").get() as Receipt;
export function acceptIdentityBatch(db: HistoryDatabase, input: IdentityBatch) {
  const batch = identityBatchSchema.parse(input);
  db.transaction(() => {
    const prior = receipt(db);
    if (prior.host_id && prior.host_id !== batch.hostId) throw Error("Identity host mismatch");
    // Unknown discovery heartbeats contain no rows and establish no evidence.
    if (batch.total === null) {
      if (batch.rows.length) throw Error("Partial identity rows");
      return;
    }
    if (batch.generation < prior.generation) return;
    if (batch.generation > prior.generation) {
      // An unchanged server catalog may have an acknowledged cursor from before
      // recovery. Accept no partial restart; disclose unknown attribution so it
      // can redeliver this same host/generation from offset zero.
      if (batch.offset !== 0) {
        if (!prior.generation && !prior.received) return;
        throw Error("Identity batch gap");
      }
      db.prepare(
        "UPDATE identity_receipt SET host_id=?,generation=?,received=0,complete=0,expected_total=NULL,evidence_changed=? WHERE id=1",
      ).run(batch.hostId, batch.generation, prior.complete ? 0 : prior.evidence_changed);
      db.prepare("INSERT OR IGNORE INTO identity_generations VALUES (?,0)").run(batch.generation);
    }
    const current = receipt(db);
    if (current.expected_total !== null && current.expected_total !== batch.total)
      throw Error("Identity total changed");
    db.prepare("UPDATE identity_receipt SET expected_total=? WHERE id=1").run(batch.total);
    if (batch.offset > current.received || batch.offset + batch.rows.length > batch.total)
      throw Error("Identity batch gap");
    const digest = createHash("sha256").update(JSON.stringify(batch)).digest("hex");
    const stored = db
      .prepare("SELECT digest FROM identity_batches WHERE generation=? AND offset=?")
      .get(batch.generation, batch.offset) as { digest: string } | undefined;
    if (stored && stored.digest !== digest) throw Error("Identity batch conflict");
    if (!stored) {
      if (batch.offset !== current.received) throw Error("Identity batch overlap");
      for (const row of batch.rows) {
        if (row.ownershipUnknown) {
          if (
            row.providerIdentity &&
            !db
              .prepare("SELECT 1 FROM identity_uncertain WHERE thread_id=? AND provider_identity=?")
              .get(row.threadId, row.providerIdentity)
          ) {
            db.prepare("INSERT INTO identity_uncertain VALUES (?,?)").run(
              row.threadId,
              row.providerIdentity,
            );
            db.prepare("UPDATE identity_receipt SET evidence_changed=1 WHERE id=1").run();
          }
          continue; // Never store unknown ownership as host-local edges or metadata.
        }
        // Only positive ownership evidence can clear retained uncertainty.
        if (
          db.prepare("SELECT 1 FROM identity_uncertain WHERE thread_id=? LIMIT 1").get(row.threadId)
        ) {
          db.prepare("DELETE FROM identity_uncertain WHERE thread_id=?").run(row.threadId);
          db.prepare("UPDATE identity_receipt SET evidence_changed=1 WHERE id=1").run();
        }
        if (row.ownershipUnknown === false) continue; // Host-neutral resolution, not a binding.
        if (row.providerIdentity) {
          if (
            !db
              .prepare(
                "SELECT 1 FROM identity_edges e JOIN identity_generations g USING(generation) WHERE provider_identity=? AND thread_id=? AND g.complete=1 LIMIT 1",
              )
              .get(row.providerIdentity, row.threadId)
          )
            db.prepare("UPDATE identity_receipt SET evidence_changed=1 WHERE id=1").run();
          db.prepare("INSERT OR IGNORE INTO identity_edges VALUES (?,?,?)").run(
            batch.generation,
            row.providerIdentity,
            row.threadId,
          );
        }
        db.prepare(
          "INSERT INTO identity_metadata VALUES (?,?,?,?) ON CONFLICT(generation,thread_id) DO UPDATE SET title=excluded.title,state=excluded.state",
        ).run(batch.generation, row.threadId, row.title, row.state);
      }
      db.prepare("INSERT INTO identity_batches VALUES (?,?,?)").run(
        batch.generation,
        batch.offset,
        digest,
      );
      db.prepare("UPDATE identity_receipt SET received=received+? WHERE id=1").run(
        batch.rows.length,
      );
    }
    if (!current.complete && receipt(db).received === batch.total) {
      db.prepare("UPDATE identity_generations SET complete=1 WHERE generation=?").run(
        batch.generation,
      );
      db.prepare(
        "UPDATE identity_receipt SET complete=1,revision=revision+evidence_changed WHERE id=1",
      ).run();
    }
  });
}

// BBP-22 must call this only after its explicit confined file/header verification.
export function recordConfirmedRelationship(db: HistoryDatabase, input: ConfirmedRelationship) {
  const row = confirmedRelationshipSchema.parse(input);
  db.transaction(() => {
    const result = db
      .prepare(
        "SELECT 1 FROM identity_imports WHERE session_id=? AND workspace=? AND provider_identity=?",
      )
      .get(row.sessionId, row.workspace, row.providerIdentity);
    if (!result) {
      db.prepare("INSERT INTO identity_imports VALUES (?,?,?)").run(
        row.sessionId,
        row.providerIdentity,
        row.workspace,
      );
      db.prepare("UPDATE identity_receipt SET revision=revision+1 WHERE id=1").run();
    }
  });
}
// Only the owning host can prove these aliases; failure to resolve is not equality.
export async function verifyWorkspaceAlias(
  db: HistoryDatabase,
  recorded: string,
  candidate: string,
  realpath: (path: string) => Promise<string>,
) {
  if (!recorded.startsWith("/") || !candidate.startsWith("/")) return false;
  try {
    const [a, b] = await Promise.all([realpath(recorded), realpath(candidate)]);
    if (a !== b) return false;
    db.transaction(() => {
      if (
        !db
          .prepare("SELECT 1 FROM identity_aliases WHERE recorded=? AND verified=?")
          .get(recorded, candidate)
      ) {
        db.prepare("INSERT INTO identity_aliases VALUES (?,?)").run(recorded, candidate);
        db.prepare("UPDATE identity_receipt SET revision=revision+1 WHERE id=1").run();
      }
    });
    return true;
  } catch {
    return false;
  }
}
type Usage = {
  workspace: string;
  event_id: string;
  session_id: string;
  provider_key: string | null;
  claim: string | null;
  occurred_at: string;
  total: number;
  accepted: number;
  grade: AttributionGrade;
  thread_id: string | null;
  projected: number;
};
function adjust(
  db: HistoryDatabase,
  grade: AttributionGrade,
  threadId: string | null,
  tokens: number,
  events: number,
) {
  for (const [table, key, values] of [
    ["identity_totals", "grade,thread_id", [grade, threadId ?? "", tokens, events]],
    ["identity_grade_totals", "grade", [grade, tokens, events]],
  ] as const) {
    const placeholders = values.map(() => "?").join(",");
    const where = table === "identity_totals" ? "grade=? AND thread_id=?" : "grade=?";
    const keys = table === "identity_totals" ? [grade, threadId ?? ""] : [grade];
    db.prepare(
      `INSERT INTO ${table} VALUES (${placeholders}) ON CONFLICT(${key}) DO UPDATE SET total_tokens=total_tokens+excluded.total_tokens,events=events+excluded.events`,
    ).run(...values);
    const row = db
      .prepare(`SELECT total_tokens,events FROM ${table} WHERE ${where}`)
      .get(...keys) as { total_tokens: number; events: number };
    if (![row.total_tokens, row.events].every((n) => Number.isSafeInteger(n) && n >= 0))
      throw Error("Identity totals unavailable");
    if (!row.events) db.prepare(`DELETE FROM ${table} WHERE ${where}`).run(...keys);
  }
}
/** Retention removes numeric attribution, not durable relationship or entry-owner evidence. */
export function retireIdentityUsage(db: HistoryDatabase, eventId: string) {
  const row = db.prepare("SELECT * FROM identity_usage WHERE event_id=?").get(eventId) as
    | Usage
    | undefined;
  if (row?.projected) adjust(db, row.grade, row.thread_id, -row.total, -1);
  db.prepare("DELETE FROM identity_usage WHERE event_id=?").run(eventId);
}
export function reconcileIdentity(db: HistoryDatabase, signal: AbortSignal, limit = 200) {
  signal.throwIfAborted();
  if (
    !(
      db.prepare("SELECT backfill_done FROM history_retention WHERE id=1").get() as {
        backfill_done: number;
      }
    ).backfill_done
  )
    return;
  db.transaction(() => {
    const state = receipt(db);
    const expired = db
      .prepare(
        "SELECT event_id FROM identity_usage WHERE occurred_at<(SELECT compact_cutoff FROM history_retention WHERE id=1) ORDER BY occurred_at,event_id LIMIT ?",
      )
      .all(limit) as { event_id: string }[];
    for (const row of expired) {
      signal.throwIfAborted();
      retireIdentityUsage(db, row.event_id);
    }
    if (!state.backfilled) {
      const rows = db
        .prepare(
          "SELECT rowid AS position,event_id,session_id,workspace,total,provider_key,claimed_thread,occurred_at,accepted FROM usage_compact WHERE rowid>? ORDER BY rowid LIMIT ?",
        )
        .all(state.backfill, limit) as {
        position: number;
        event_id: string;
        session_id: string;
        workspace: string;
        total: number;
        provider_key: string | null;
        claimed_thread: string | null;
        occurred_at: string;
        accepted: number;
      }[];
      for (const row of rows) {
        signal.throwIfAborted();
        db.prepare(
          "INSERT OR IGNORE INTO identity_usage(event_id,session_id,workspace,provider_key,claim,occurred_at,total,accepted) VALUES (?,?,?,?,?,?,?,?)",
        ).run(
          row.event_id,
          row.session_id,
          row.workspace,
          row.provider_key,
          row.claimed_thread,
          row.occurred_at,
          row.total,
          row.accepted,
        );
      }
      db.prepare("UPDATE identity_receipt SET backfill=?,backfilled=? WHERE id=1").run(
        rows.at(-1)?.position ?? state.backfill,
        rows.length < limit ? 1 : 0,
      );
    }
    if (!state.complete) return;
    const rows = db
      .prepare("SELECT * FROM identity_usage WHERE revision<? ORDER BY revision,event_id LIMIT ?")
      .all(state.revision, limit) as Usage[];
    for (const row of rows) {
      signal.throwIfAborted();
      const candidates = db
        .prepare(`SELECT DISTINCT thread_id AS threadId FROM (
        SELECT e.thread_id FROM identity_edges e JOIN identity_generations g USING(generation)
          WHERE g.complete=1 AND e.provider_identity=?
        UNION ALL
        SELECT e.thread_id FROM identity_imports i JOIN identity_edges e ON e.provider_identity=i.provider_identity JOIN identity_generations g ON g.generation=e.generation
          WHERE g.complete=1 AND i.session_id=? AND (i.workspace=? OR i.workspace IN (SELECT verified FROM identity_aliases WHERE recorded=?))
      ) LIMIT 2`)
        .all(
          row.provider_key?.slice(0, -6) ?? null,
          row.session_id,
          row.workspace,
          row.workspace,
        ) as { threadId: string }[];
      const uncertain = db
        .prepare(`SELECT 1 FROM identity_uncertain u WHERE
        (u.provider_identity=? OR u.provider_identity IN
          (SELECT provider_identity FROM identity_imports WHERE session_id=? AND
            (workspace=? OR workspace IN (SELECT verified FROM identity_aliases WHERE recorded=?)))) LIMIT 1`)
        .get(row.provider_key?.slice(0, -6) ?? null, row.session_id, row.workspace, row.workspace);
      const result = resolveCandidates(
        {
          sessionId: row.session_id,
          providerSessionKey: row.provider_key,
          claimedThreadId: row.claim,
          workspace: row.workspace,
        },
        candidates.map((c) => c.threadId),
        !uncertain,
      );
      if (row.projected) adjust(db, row.grade, row.thread_id, -row.total, -1);
      if (row.accepted) adjust(db, result.grade, result.threadId, row.total, 1);
      db.prepare(
        "UPDATE identity_usage SET grade=?,thread_id=?,revision=?,projected=? WHERE event_id=?",
      ).run(result.grade, result.threadId, state.revision, row.accepted, row.event_id);
      db.prepare("UPDATE usage_compact SET verified_thread=? WHERE event_id=?").run(
        row.accepted && result.grade === "exact-thread" ? result.threadId : null,
        row.event_id,
      );
    }
  });
}
export function identityView(db: HistoryDatabase): AttributionView {
  const state = receipt(db);
  const backlog =
    !(
      db.prepare("SELECT backfill_done FROM history_retention WHERE id=1").get() as {
        backfill_done: number;
      }
    ).backfill_done ||
    !state.backfilled ||
    !!db
      .prepare(
        "SELECT 1 FROM identity_usage WHERE occurred_at<(SELECT compact_cutoff FROM history_retention WHERE id=1) LIMIT 1",
      )
      .get() ||
    !!db.prepare("SELECT 1 FROM identity_usage WHERE revision<? LIMIT 1").get(state.revision);
  const discovery = !state.generation ? "unknown" : state.complete ? "complete" : "partial";
  // Never display stale exact aggregates during re-resolution or incomplete discovery.
  if (backlog || discovery !== "complete")
    return { discovery, backlog, grades: [], threads: [], truncated: false };
  const totals = db
    .prepare("SELECT grade,total_tokens AS totalTokens,events FROM identity_grade_totals")
    .all() as { grade: AttributionGrade; totalTokens: number; events: number }[];
  const grades = (["exact-thread", "workspace-only", "ambiguous", "unattributed"] as const).map(
    (grade) => ({
      grade,
      totalTokens: totals
        .filter((t) => t.grade === grade)
        .reduce((sum, t) => sum + t.totalTokens, 0),
      events: totals.filter((t) => t.grade === grade).reduce((sum, t) => sum + t.events, 0),
    }),
  );
  const ranked = db
    .prepare(
      "SELECT thread_id,total_tokens AS totalTokens,events FROM identity_totals WHERE grade='exact-thread' ORDER BY total_tokens DESC,thread_id LIMIT 51",
    )
    .all() as { thread_id: string; totalTokens: number; events: number }[];
  const threads = ranked.slice(0, 50).map((row) => {
    const meta = db
      .prepare("SELECT title,state FROM identity_metadata WHERE generation=? AND thread_id=?")
      .get(state.generation, row.thread_id) as
      | { title: string | null; state: "available" | "archived" | "deleted" }
      | undefined;
    const status: AttributionView["threads"][number]["state"] = meta?.state ?? "missing";
    const label =
      meta?.title ??
      `${status === "archived" ? "Archived thread" : status === "deleted" ? "Deleted thread" : status === "missing" ? "Unavailable thread" : "Untitled thread"} ${row.thread_id}`;
    return {
      threadId: row.thread_id,
      label,
      state: status,
      totalTokens: row.totalTokens,
      events: row.events,
    };
  });
  return { discovery, backlog, grades, threads, truncated: ranked.length > 50 };
}
