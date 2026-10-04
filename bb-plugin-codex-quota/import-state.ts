import type { HistoryDatabase } from "./history-storage.js";
import type { RootProof } from "./import-source.js";
import type {
  ImportConfiguration,
  ImportDiagnostic,
  ImportView,
} from "./import-contract.js";
export type Frozen = {
  roots: RootProof[];
  workspaces: { recorded: string; resolved: string; identity: string }[];
  catalog: number;
};
export type Generation = {
  id: string;
  state: "stopped" | "completed" | "canceled";
  start_at: string;
  end_at: string;
  frozen: string;
  phase: "discover" | "headers" | "read";
  provider_cursor: string;
  root_cursor: number;
  bytes: number;
  records: number;
  replayed: number;
  omissions: number;
  diagnostics: string;
};
export type Candidate = {
  generation: string;
  path: string;
  root: number;
  name: string;
  provider: string | null;
  state: "pending" | "ready" | "done" | "omitted";
  offset: number;
  dropping: number;
  stamp: string | null;
  session: string | null;
  workspace: string | null;
  parent: string | null;
};
export type ImportOptions = {
  signal: AbortSignal;
  now?: () => number;
  bytes?: number;
  rows?: number;
  bodyRead?: () => void;
};
export function initializeImport(db: HistoryDatabase) {
  db.exec(`
 CREATE TABLE IF NOT EXISTS import_config (host TEXT PRIMARY KEY,configuration TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS import_host (id INTEGER PRIMARY KEY CHECK(id=1),host TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS import_generations (id TEXT PRIMARY KEY,host TEXT NOT NULL,state TEXT NOT NULL,start_at TEXT NOT NULL,end_at TEXT NOT NULL,frozen TEXT NOT NULL,phase TEXT NOT NULL,provider_cursor TEXT NOT NULL,root_cursor INTEGER NOT NULL,bytes INTEGER NOT NULL,records INTEGER NOT NULL,replayed INTEGER NOT NULL,omissions INTEGER NOT NULL,diagnostics TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS import_unfinished ON import_generations(host) WHERE state='stopped';
 CREATE INDEX IF NOT EXISTS import_coverage_interval ON import_generations(start_at,end_at,id);
 CREATE TABLE IF NOT EXISTS import_candidates (generation TEXT NOT NULL,path TEXT NOT NULL,root INTEGER NOT NULL,name TEXT NOT NULL,provider TEXT,state TEXT NOT NULL,offset INTEGER NOT NULL,dropping INTEGER NOT NULL,stamp TEXT,session TEXT,workspace TEXT,parent TEXT,PRIMARY KEY(generation,path));
 CREATE INDEX IF NOT EXISTS import_pending ON import_candidates(generation,state,path);
 CREATE TABLE IF NOT EXISTS import_entries (generation TEXT NOT NULL,path TEXT NOT NULL,entry TEXT NOT NULL,parent_entry TEXT,event_id TEXT,PRIMARY KEY(generation,path,entry));
 CREATE INDEX IF NOT EXISTS import_entry_lookup ON import_entries(entry,generation,path);
 `);
}
export const unfinished = (db: HistoryDatabase, host: string) =>
  db
    .prepare(
      "SELECT * FROM import_generations WHERE host=? AND state='stopped'",
    )
    .get(host) as Generation | undefined;
export const config = (db: HistoryDatabase, host: string) => {
  const row = db
    .prepare("SELECT configuration FROM import_config WHERE host=?")
    .get(host) as { configuration: string } | undefined;
  return row ? (JSON.parse(row.configuration) as ImportConfiguration) : null;
};
export function importStatus(
  db: HistoryDatabase,
  host: string,
  reason: ImportView["reason"] = "ok",
): ImportView {
  const configuration = config(db, host),
    g =
      unfinished(db, host) ??
      (db
        .prepare(
          "SELECT * FROM import_generations WHERE host=? ORDER BY rowid DESC LIMIT 1",
        )
        .get(host) as Generation | undefined);
  const counts = g
    ? (db
        .prepare(
          "SELECT count(*) AS candidates,sum(CASE WHEN state IN ('done','omitted') THEN 1 ELSE 0 END) AS finished FROM import_candidates WHERE generation=?",
        )
        .get(g.id) as { candidates: number; finished: number | null })
    : null;
  return {
    reason: reason === "ok" && !configuration ? "not-configured" : reason,
    configuration,
    generation: g
      ? {
          id: g.id,
          state: g.state,
          startAt: g.start_at,
          endAt: g.end_at,
          workspaces: (JSON.parse(g.frozen) as Frozen).workspaces.map(
            (w) => w.recorded,
          ),
          sourceRoots: (JSON.parse(g.frozen) as Frozen).roots.map(
            (r) => r.resolved,
          ),
          candidates: counts!.candidates,
          finished: counts!.finished ?? 0,
          bytes: g.bytes,
          records: g.records,
          replayed: g.replayed,
          omissions: g.omissions,
          coverage: "partial",
          diagnostics: JSON.parse(g.diagnostics),
        }
      : null,
  };
}
export function diagnostic(
  db: HistoryDatabase,
  g: Generation,
  code: ImportDiagnostic,
  n = 1,
) {
  const codes = JSON.parse(g.diagnostics) as ImportDiagnostic[];
  if (!codes.includes(code) && codes.length < 20) codes.push(code);
  g.diagnostics = JSON.stringify(codes);
  g.omissions += n;
  db.prepare(
    "UPDATE import_generations SET diagnostics=?,omissions=? WHERE id=?",
  ).run(g.diagnostics, g.omissions, g.id);
}
export function omit(
  db: HistoryDatabase,
  g: Generation,
  c: Candidate,
  code: ImportDiagnostic,
) {
  diagnostic(db, g, code);
  db.prepare(
    "UPDATE import_candidates SET state='omitted' WHERE generation=? AND path=?",
  ).run(g.id, c.path);
}
