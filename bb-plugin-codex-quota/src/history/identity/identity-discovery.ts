import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { HistoryDatabase } from "../storage/history-storage.js";
import { identityRowSchema, type IdentityBatch } from "./identity-contract.js";
import {
  initializeCatalog,
  fingerprintCatalog,
  deliveryCatalog,
  emptyCatalogCursor,
  type CatalogCursor,
} from "./identity-catalog.js";

// Public metadata only. No timeline, output, prompt history or storage-file API.
type Sdk = Pick<BbPluginApi["sdk"], "threads" | "environments">;
type State = {
  generation: number;
  phase:
    | "environments"
    | "active"
    | "archived"
    | "ownership"
    | "events"
    | "uncertainty"
    | "fingerprint"
    | "complete";
  offset: number;
  returnPhase: "active" | "archived";
  threadOffset: number;
  threadId: string | null;
  afterSeq: number;
  finishedAt: number;
  catalog: CatalogCursor;
  uncertaintyThread?: string;
  uncertaintyProvider?: string;
};
const initial = (generation: number): State => ({
  generation,
  phase: "environments",
  offset: 0,
  returnPhase: "active",
  threadOffset: 0,
  threadId: null,
  afterSeq: 0,
  finishedAt: 0,
  catalog: emptyCatalogCursor(),
});
const PAGE = 50;
export function createIdentityDiscovery(sdk: Sdk, database: () => HistoryDatabase, now = Date.now) {
  let queue = Promise.resolve<unknown>(null);
  const deliveryIds = new WeakMap<IdentityBatch, number>();
  function db() {
    const value = database();
    value.exec(`CREATE TABLE IF NOT EXISTS discovery_state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS discovery_environments (generation INTEGER NOT NULL, environment_id TEXT NOT NULL, host_id TEXT NOT NULL, PRIMARY KEY(generation,environment_id));
      CREATE TABLE IF NOT EXISTS discovery_threads (generation INTEGER NOT NULL, thread_id TEXT NOT NULL, host_id TEXT NOT NULL, title TEXT, state TEXT NOT NULL, scanned INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(generation,thread_id));
      CREATE INDEX IF NOT EXISTS discovery_pending ON discovery_threads(generation,scanned,thread_id);
      CREATE TABLE IF NOT EXISTS discovery_ownership (generation INTEGER NOT NULL, thread_id TEXT NOT NULL, environment_id TEXT, reason TEXT NOT NULL, PRIMARY KEY(generation,thread_id));
      CREATE INDEX IF NOT EXISTS discovery_ownership_pending ON discovery_ownership(generation,reason,environment_id);
      CREATE INDEX IF NOT EXISTS discovery_ownership_environment ON discovery_ownership(generation,environment_id,reason);
      CREATE TABLE IF NOT EXISTS discovery_resolved (generation INTEGER NOT NULL, thread_id TEXT NOT NULL, PRIMARY KEY(generation,thread_id));
      CREATE TABLE IF NOT EXISTS discovery_rows (id INTEGER PRIMARY KEY, generation INTEGER NOT NULL, host_id TEXT NOT NULL, thread_id TEXT NOT NULL, provider_identity TEXT, title TEXT, state TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS discovery_delivery ON discovery_rows(generation,host_id,id);
      CREATE TABLE IF NOT EXISTS discovery_receipts (generation INTEGER NOT NULL, host_id TEXT NOT NULL, offset INTEGER NOT NULL, last_id INTEGER NOT NULL, total INTEGER NOT NULL, PRIMARY KEY(generation,host_id));`);
    initializeCatalog(value);
    value
      .prepare("INSERT OR IGNORE INTO discovery_state VALUES (1,?)")
      .run(JSON.stringify(initial(1)));
    return value;
  }
  const save = (database: HistoryDatabase, state: State) =>
    database.prepare("UPDATE discovery_state SET value=? WHERE id=1").run(JSON.stringify(state));
  async function advance(database: HistoryDatabase, state: State, signal: AbortSignal) {
    signal.throwIfAborted();
    if (state.phase === "environments") {
      const page = await sdk.environments.list({ limit: PAGE, offset: state.offset, signal });
      signal.throwIfAborted();
      database.transaction(() => {
        for (const env of page)
          if (env.hostId)
            database
              .prepare("INSERT OR REPLACE INTO discovery_environments VALUES (?,?,?)")
              .run(state.generation, env.id, env.hostId);
        state.offset += page.length;
        if (page.length < PAGE) {
          state.phase = "active";
          state.offset = 0;
        }
        save(database, state);
      });
      return;
    }
    if (state.phase === "active" || state.phase === "archived") {
      const phase = state.phase;
      const page = await sdk.threads.list({
        archived: phase === "archived",
        includeHidden: true,
        limit: PAGE,
        offset: state.offset,
        signal,
      });
      signal.throwIfAborted();
      database.transaction(() => {
        for (const thread of page) {
          if (thread.providerId !== "pi") continue;
          const env = thread.environmentId
            ? (database
                .prepare(
                  "SELECT host_id FROM discovery_environments WHERE generation=? AND environment_id=?",
                )
                .get(state.generation, thread.environmentId) as { host_id: string } | undefined)
            : undefined;
          const row = identityRowSchema.safeParse({
            threadId: thread.id,
            providerIdentity: null,
            title: (thread.title ?? thread.titleFallback)?.slice(0, 256) || null,
            state:
              thread.deletedAt !== null
                ? "deleted"
                : thread.archivedAt !== null
                  ? "archived"
                  : "available",
          });
          if (!row.success) throw Error("Identity metadata unavailable");
          database
            .prepare(
              "INSERT OR IGNORE INTO discovery_threads(generation,thread_id,host_id,title,state) VALUES (?,?,?,?,?)",
            )
            .run(state.generation, thread.id, env?.host_id ?? "", row.data.title, row.data.state);
          if (!env)
            database
              .prepare(`INSERT OR IGNORE INTO discovery_ownership VALUES (?,?,?,
              coalesce((SELECT reason FROM discovery_ownership WHERE generation=? AND environment_id=? AND reason!='pending' LIMIT 1),?))`)
              .run(
                state.generation,
                thread.id,
                thread.environmentId,
                state.generation,
                thread.environmentId,
                thread.environmentId ? "pending" : "no-environment",
              );
        }
        state.offset += page.length;
        state.returnPhase = phase;
        state.threadOffset = page.length < PAGE ? -1 : state.offset;
        state.phase = "ownership";
        save(database, state);
      });
      return;
    }
    if (state.phase === "ownership") {
      const pending = database
        .prepare(
          "SELECT environment_id FROM discovery_ownership WHERE generation=? AND reason='pending' ORDER BY environment_id LIMIT 1",
        )
        .get(state.generation) as { environment_id: string } | undefined;
      if (!pending) {
        state.phase = "events";
        save(database, state);
        return;
      }
      let hostId = "";
      let reason = "no-host";
      try {
        const env = await sdk.environments.get({ environmentId: pending.environment_id, signal });
        signal.throwIfAborted();
        if (env.id === pending.environment_id && env.hostId) {
          hostId = env.hostId;
          reason = "resolved";
        }
      } catch {
        signal.throwIfAborted();
        reason = "lookup-failed";
      }
      signal.throwIfAborted();
      database.transaction(() => {
        if (hostId) {
          database
            .prepare("INSERT OR REPLACE INTO discovery_environments VALUES (?,?,?)")
            .run(state.generation, pending.environment_id, hostId);
          database
            .prepare(`UPDATE discovery_threads SET host_id=? WHERE generation=? AND thread_id IN
            (SELECT thread_id FROM discovery_ownership WHERE generation=? AND environment_id=? AND reason='pending')`)
            .run(hostId, state.generation, state.generation, pending.environment_id);
        }
        database
          .prepare(
            "UPDATE discovery_ownership SET reason=? WHERE generation=? AND environment_id=? AND reason='pending'",
          )
          .run(reason, state.generation, pending.environment_id);
        save(database, state);
      });
      return;
    }
    if (state.phase === "events") {
      const next = database
        .prepare(
          "SELECT thread_id,host_id,title,state FROM discovery_threads WHERE generation=? AND scanned=0 ORDER BY thread_id LIMIT 1",
        )
        .get(state.generation) as
        | {
            thread_id: string;
            host_id: string;
            title: string | null;
            state: "available" | "archived" | "deleted";
          }
        | undefined;
      if (!next) {
        if (state.threadOffset < 0) {
          state.phase = state.returnPhase === "active" ? "archived" : "uncertainty";
          state.offset = 0;
        } else {
          state.phase = state.returnPhase;
          state.offset = state.threadOffset;
        }
        save(database, state);
        return;
      }
      if (state.threadId !== next.thread_id) {
        state.threadId = next.thread_id;
        state.afterSeq = 0;
      }
      const page = await sdk.threads.events.list({
        threadId: next.thread_id,
        types: ["thread/identity"],
        order: "asc",
        afterSeq: String(state.afterSeq),
        limit: String(PAGE),
        signal,
      });
      signal.throwIfAborted();
      database.transaction(() => {
        if (state.afterSeq === 0)
          database
            .prepare(
              "INSERT OR IGNORE INTO discovery_rows(generation,host_id,thread_id,provider_identity,title,state) VALUES (?,?,?,NULL,?,?)",
            )
            .run(
              state.generation,
              next.host_id,
              next.thread_id,
              next.host_id ? next.title : null,
              next.state,
            );
        if (
          state.afterSeq === 0 &&
          next.host_id &&
          database
            .prepare(
              "SELECT 1 FROM discovery_rows WHERE generation=? AND host_id='' AND thread_id=? LIMIT 1",
            )
            .get(state.generation - 1, next.thread_id)
        ) {
          // Resolve earlier host-neutral uncertainty on every host without
          // claiming this thread belongs to any other receiving host.
          database
            .prepare("INSERT OR IGNORE INTO discovery_resolved VALUES (?,?)")
            .run(state.generation, next.thread_id);
          database
            .prepare(
              "INSERT OR IGNORE INTO discovery_rows(generation,host_id,thread_id,provider_identity,title,state) VALUES (?,'',?,NULL,NULL,?)",
            )
            .run(state.generation, next.thread_id, next.state);
        }
        let seq = state.afterSeq;
        for (const event of page) {
          // Reject non-progressing or wrong-scope pages instead of declaring completeness.
          if (
            !Number.isSafeInteger(event.seq) ||
            event.seq <= seq ||
            event.type !== "thread/identity" ||
            event.threadId !== next.thread_id
          )
            throw Error("Identity page unavailable");
          seq = event.seq;
          const row = identityRowSchema.safeParse({
            threadId: next.thread_id,
            providerIdentity: event.data.providerThreadId,
            title: next.host_id ? next.title : null,
            state: next.state,
          });
          if (!row.success) throw Error("Identity evidence unavailable");
          database
            .prepare(
              "INSERT OR IGNORE INTO discovery_rows(generation,host_id,thread_id,provider_identity,title,state) VALUES (?,?,?,?,?,?)",
            )
            .run(
              state.generation,
              next.host_id,
              next.thread_id,
              row.data.providerIdentity,
              next.host_id ? next.title : null,
              next.state,
            );
        }
        state.afterSeq = seq;
        if (page.length < PAGE) {
          database
            .prepare("UPDATE discovery_threads SET scanned=1 WHERE generation=? AND thread_id=?")
            .run(state.generation, next.thread_id);
          state.threadId = null;
          state.afterSeq = 0;
        }
        save(database, state);
      });
    }
    if (state.phase === "uncertainty") {
      // Carry retained host-neutral evidence into the next catalog. Absence of
      // metadata is not proof of ownership, including for an offline host.
      const rows = database
        .prepare(`SELECT thread_id,provider_identity,state,
        EXISTS(SELECT 1 FROM discovery_resolved d WHERE d.generation=r.generation AND d.thread_id=r.thread_id) AS resolved
        FROM discovery_rows r WHERE generation=? AND host_id='' AND
        (thread_id,coalesce(provider_identity,''))>(?,?)
        ORDER BY thread_id,coalesce(provider_identity,'') LIMIT 50`)
        .all(
          state.generation - 1,
          state.uncertaintyThread ?? "",
          state.uncertaintyProvider ?? "",
        ) as {
        thread_id: string;
        provider_identity: string | null;
        state: string;
        resolved: number;
      }[];
      signal.throwIfAborted();
      database.transaction(() => {
        for (const row of rows) {
          signal.throwIfAborted();
          state.uncertaintyThread = row.thread_id;
          state.uncertaintyProvider = row.provider_identity ?? "";
          const current = database
            .prepare("SELECT host_id FROM discovery_threads WHERE generation=? AND thread_id=?")
            .get(state.generation, row.thread_id) as { host_id: string } | undefined;
          // Advance over every source row, even if this proof must not be carried.
          if (current && (current.host_id || row.resolved)) continue;
          if (row.resolved)
            database
              .prepare("INSERT OR IGNORE INTO discovery_resolved VALUES (?,?)")
              .run(state.generation, row.thread_id);
          database
            .prepare(
              "INSERT OR IGNORE INTO discovery_rows(generation,host_id,thread_id,provider_identity,title,state) VALUES (?,'',?,?,NULL,?)",
            )
            .run(state.generation, row.thread_id, row.provider_identity, row.state);
        }
        if (rows.length < PAGE) state.phase = "fingerprint";
        save(database, state);
      });
      return;
    }
    if (state.phase === "fingerprint")
      database.transaction(() => {
        if (fingerprintCatalog(database, state.generation, state.catalog, signal)) {
          state.phase = "complete";
          state.finishedAt = now();
        }
        save(database, state);
      });
  }
  async function next(hostId: string, signal: AbortSignal): Promise<IdentityBatch> {
    const database = db();
    let state = JSON.parse(
      (database.prepare("SELECT value FROM discovery_state WHERE id=1").get() as { value: string })
        .value,
    ) as State;
    if (state.phase === "complete" && now() - state.finishedAt >= 60_000) {
      state = initial(state.generation + 1);
      save(database, state);
    }
    // Metadata lookup failures are explicit per-entry uncertainty. Other failures
    // must reach the caller, not masquerade as a successful partial heartbeat.
    for (let calls = 0; calls < 4 && state.phase !== "complete"; calls++)
      await advance(database, state, signal);
    signal.throwIfAborted();
    if (state.phase !== "complete")
      return { hostId, generation: state.generation, offset: 0, total: null, rows: [] };
    const catalog = deliveryCatalog(database, state.generation, hostId);
    const generation = catalog.generation;
    let receipt = database
      .prepare(
        "SELECT offset,last_id,total FROM discovery_receipts WHERE generation=? AND host_id=?",
      )
      .get(generation, hostId) as { offset: number; last_id: number; total: number } | undefined;
    if (!receipt) {
      database
        .prepare("INSERT INTO discovery_receipts VALUES (?,?,0,0,?)")
        .run(generation, hostId, catalog.total);
      receipt = { offset: 0, last_id: 0, total: catalog.total };
    }
    const rows = database
      .prepare(
        "SELECT id,thread_id AS threadId,provider_identity AS providerIdentity,title,state,host_id,EXISTS(SELECT 1 FROM discovery_resolved d WHERE d.generation=r.generation AND d.thread_id=r.thread_id) AS ownership_resolved FROM discovery_rows r WHERE generation=? AND host_id IN (?, '') AND id>? ORDER BY id LIMIT 100",
      )
      .all(generation, hostId, receipt.last_id) as (IdentityBatch["rows"][number] & {
      id: number;
      host_id: string;
      ownership_resolved: number;
    })[];
    const batch = {
      hostId,
      generation,
      offset: receipt.offset,
      total: receipt.total,
      rows: rows.map(({ id: _id, host_id, ownership_resolved, ...row }) => ({
        ...row,
        ...(!host_id ? { ownershipUnknown: !ownership_resolved } : {}),
      })),
    };
    deliveryIds.set(batch, rows.at(-1)?.id ?? receipt.last_id);
    return batch;
  }
  return {
    next(hostId: string, signal: AbortSignal) {
      const result = queue.then(() => next(hostId, signal));
      queue = result.catch(() => null);
      return result;
    },
    delivered(batch: IdentityBatch) {
      const lastId = deliveryIds.get(batch);
      if (batch.total === null || lastId === undefined) return;
      db()
        .prepare(
          "UPDATE discovery_receipts SET offset=max(offset,?),last_id=max(last_id,?) WHERE generation=? AND host_id=?",
        )
        .run(batch.offset + batch.rows.length, lastId, batch.generation, batch.hostId);
    },
    resetDelivery(batch: IdentityBatch) {
      if (batch.total === null || !deliveryIds.has(batch)) return;
      db()
        .prepare(
          "UPDATE discovery_receipts SET offset=0,last_id=0 WHERE generation=? AND host_id=?",
        )
        .run(batch.generation, batch.hostId);
    },
  };
}
