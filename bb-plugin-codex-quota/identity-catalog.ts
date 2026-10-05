import { createHash } from "node:crypto";
import type { HistoryDatabase } from "./history-storage.js";

// Catalog freshness and host delivery versions are independent. A canonical
// fingerprint lets an unchanged host keep its delivery cursor across refreshes.
export type CatalogCursor = {
  host: string;
  thread: string;
  provider: string;
  digest: string;
  total: number;
};
export const emptyCatalogCursor = (): CatalogCursor => ({
  host: "",
  thread: "",
  provider: "",
  digest: "",
  total: 0,
});
export function initializeCatalog(db: HistoryDatabase) {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS discovery_canonical ON discovery_rows(generation,host_id,thread_id,coalesce(provider_identity,''));
    CREATE TABLE IF NOT EXISTS discovery_catalogs (generation INTEGER NOT NULL,host_id TEXT NOT NULL,digest TEXT NOT NULL,total INTEGER NOT NULL,PRIMARY KEY(generation,host_id));
    CREATE TABLE IF NOT EXISTS discovery_targets (host_id TEXT PRIMARY KEY,generation INTEGER NOT NULL,digest TEXT NOT NULL,total INTEGER NOT NULL);`);
}
export function fingerprintCatalog(
  db: HistoryDatabase,
  generation: number,
  cursor: CatalogCursor,
  signal: AbortSignal,
): boolean {
  const rows = db
    .prepare(`SELECT host_id,thread_id,provider_identity,title,state FROM discovery_rows WHERE generation=?
    AND (host_id,thread_id,coalesce(provider_identity,''))>(?,?,?) ORDER BY host_id,thread_id,coalesce(provider_identity,'') LIMIT 50`)
    .all(generation, cursor.host, cursor.thread, cursor.provider) as {
    host_id: string;
    thread_id: string;
    provider_identity: string | null;
    title: string | null;
    state: string;
  }[];
  const finish = () => {
    if (cursor.host)
      db.prepare("INSERT OR REPLACE INTO discovery_catalogs VALUES (?,?,?,?)").run(
        generation,
        cursor.host,
        cursor.digest,
        cursor.total,
      );
  };
  for (const row of rows) {
    signal.throwIfAborted();
    if (row.host_id !== cursor.host) {
      finish();
      cursor.digest = "";
      cursor.total = 0;
    }
    cursor.host = row.host_id;
    cursor.thread = row.thread_id;
    cursor.provider = row.provider_identity ?? "";
    cursor.digest = createHash("sha256")
      .update(cursor.digest + JSON.stringify(row))
      .digest("hex");
    cursor.total++;
  }
  if (rows.length < 50) {
    finish();
    return true;
  }
  return false;
}
export function deliveryCatalog(db: HistoryDatabase, generation: number, hostId: string) {
  const current = (db
    .prepare("SELECT digest,total FROM discovery_catalogs WHERE generation=? AND host_id=?")
    .get(generation, hostId) as { digest: string; total: number } | undefined) ?? {
    digest: "",
    total: 0,
  };
  const target = db
    .prepare("SELECT generation,digest,total FROM discovery_targets WHERE host_id=?")
    .get(hostId) as { generation: number; digest: string; total: number } | undefined;
  if (target && target.digest === current.digest && target.total === current.total) return target;
  db.prepare(
    "INSERT INTO discovery_targets VALUES (?,?,?,?) ON CONFLICT(host_id) DO UPDATE SET generation=excluded.generation,digest=excluded.digest,total=excluded.total",
  ).run(hostId, generation, current.digest, current.total);
  return { generation, ...current };
}
