import { randomUUID } from "node:crypto";
import { setImmediate as yieldWork } from "node:timers/promises";
import type { HistoryDatabase } from "../storage/history-storage.js";
import { importCommandSchema, type ImportCommand, type ImportView } from "./import-contract.js";
import {
  initializeImport,
  unfinished,
  config,
  importStatus,
  diagnostic,
  omit,
  type Frozen,
  type Generation,
  type Candidate,
  type ImportOptions,
} from "./import-state.js";
import { freeze, validateFrozen, discover } from "./import-catalog.js";
import { header, slice } from "./import-reader.js";
export type { ImportOptions } from "./import-state.js";

async function cycle(db: HistoryDatabase, g: Generation, o: ImportOptions) {
  const f = JSON.parse(g.frozen) as Frozen;
  await validateFrozen(f);
  o.signal.throwIfAborted();
  if (g.phase === "discover") {
    await discover(db, g, f, o.signal);
    return;
  }
  const budget = {
    bytes: Math.max(2 * 1024 * 1024, Math.min(o.bytes ?? 8 * 1024 * 1024, 8 * 1024 * 1024)),
    rows: Math.max(1, Math.min(o.rows ?? 500, 500)),
  };
  if (g.phase === "headers") {
    const rows = db
      .prepare(
        "SELECT * FROM import_candidates WHERE generation=? AND state='pending' ORDER BY path LIMIT ?",
      )
      .all(g.id, Math.min(budget.rows, 32)) as Candidate[];
    for (const c of rows) {
      o.signal.throwIfAborted();
      await header(db, g, f, c, o);
      await yieldWork();
    }
    if (rows.length < Math.min(budget.rows, 32)) {
      g.phase = "read";
      db.prepare("UPDATE import_generations SET phase='read' WHERE id=?").run(g.id);
    }
    return;
  }
  while (budget.bytes > 0 && budget.rows > 0) {
    o.signal.throwIfAborted();
    const c = db
      .prepare(
        `SELECT c.* FROM import_candidates c WHERE c.generation=? AND c.state='ready' AND (c.parent IS NULL OR EXISTS(SELECT 1 FROM import_candidates p WHERE p.generation=c.generation AND p.path=c.parent AND p.state='done')) ORDER BY c.path LIMIT 1`,
      )
      .get(g.id) as Candidate | undefined;
    if (!c) {
      const waiting = db
        .prepare("SELECT * FROM import_candidates WHERE generation=? AND state='ready' LIMIT 1")
        .get(g.id) as Candidate | undefined;
      if (waiting) {
        omit(db, g, waiting, "unresolved-ancestry");
        budget.rows--;
        continue;
      }
      db.prepare("UPDATE import_generations SET state='completed' WHERE id=?").run(g.id);
      break;
    }
    await slice(db, g, f, c, o, budget);
    await yieldWork();
  }
}
export async function executeImport(
  db: HistoryDatabase,
  host: string,
  input: ImportCommand,
  known: string[],
  o: ImportOptions,
): Promise<ImportView> {
  const command = importCommandSchema.parse(input);
  o.signal.throwIfAborted();
  initializeImport(db);
  const owningHost = db.prepare("SELECT host FROM import_host WHERE id=1").get() as
    | { host: string }
    | undefined;
  if (owningHost && owningHost.host !== host)
    return { reason: "foreign-host", configuration: null, generation: null };
  const receipt = db
    .prepare("SELECT host_id,generation,complete FROM identity_receipt WHERE id=1")
    .get() as { host_id: string | null; generation: number; complete: number };
  if (receipt.host_id && receipt.host_id !== host)
    return { reason: "foreign-host", configuration: null, generation: null };
  let g = unfinished(db, host);
  if (command.action === "status") return importStatus(db, host);
  if (command.action === "cancel") {
    if (g) db.prepare("UPDATE import_generations SET state='canceled' WHERE id=?").run(g.id);
    return importStatus(db, host, g ? "ok" : "no-generation");
  }
  if (command.action === "configure") {
    if (g) return importStatus(db, host, "unfinished-generation");
    try {
      await freeze(command.configuration, known, receipt.generation);
      o.signal.throwIfAborted();
      db.transaction(() => {
        db.prepare("INSERT OR IGNORE INTO import_host VALUES (1,?)").run(host);
        db.prepare("INSERT OR REPLACE INTO import_config VALUES (?,?)").run(
          host,
          JSON.stringify(command.configuration),
        );
      });
      return importStatus(db, host);
    } catch {
      return importStatus(
        db,
        host,
        o.signal.aborted ? "selection-changed" : "invalid-configuration",
      );
    }
  }
  if (command.action === "start") {
    if (g) return importStatus(db, host, "unfinished-generation");
    const configuration = config(db, host);
    if (!configuration) return importStatus(db, host, "not-configured");
    if (!receipt.complete) return importStatus(db, host, "metadata-incomplete");
    let f: Frozen;
    try {
      f = await freeze(configuration, known, receipt.generation);
    } catch {
      return importStatus(db, host, "invalid-configuration");
    }
    o.signal.throwIfAborted();
    const end = new Date((o.now ?? Date.now)()),
      start = new Date(end);
    const day = start.getUTCDate();
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - 3);
    const last = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
    ).getUTCDate();
    start.setUTCDate(Math.min(day, last) - 9);
    db.prepare(
      "INSERT INTO import_generations VALUES (?,?,'stopped',?,?,?,'discover','',1,0,0,0,0,'[]')",
    ).run(randomUUID(), host, start.toISOString(), end.toISOString(), JSON.stringify(f));
    g = unfinished(db, host)!;
  } else if (!g) return importStatus(db, host, "no-generation");
  try {
    await cycle(db, g!, o);
  } catch {
    diagnostic(
      db,
      g!,
      o.signal.aborted ? "interrupted" : "source-changed",
      o.signal.aborted ? 0 : 1,
    );
  }
  return importStatus(db, host, o.signal.aborted ? "selection-changed" : "ok");
}
