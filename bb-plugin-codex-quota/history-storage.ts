// Internal host-local adapter. No BB server database or private SDK storage.
export type SqlValue = string | number | bigint | null | Uint8Array;
export interface HistoryDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...values: SqlValue[]): unknown;
    all(...values: SqlValue[]): unknown[];
    run(...values: SqlValue[]): unknown;
  };
  close(): void;
  transaction<T>(work: () => T): T;
}
export type HistoryDatabaseFactory = (path: string, readonly?: boolean) => HistoryDatabase;

import { HISTORY_VERSION } from "./history-retention.js";
export const supportedHistoryVersion = (version: number) =>
  [1, 2, 3, HISTORY_VERSION].includes(version);

import { supportedHistoryLayout } from "./history-layout.js";
export { supportedHistoryLayout } from "./history-layout.js";
// Read only the SQLite header before runtime access. A newer database must not open its WAL/SHM.
async function readHistoryHeader(
  path: string,
): Promise<{ version: number; rollback: boolean } | null> {
  const { open } = await import("node:fs/promises"),
    { constants } = await import("node:fs");
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const bytes = Buffer.alloc(100),
      { bytesRead } = await file.read(bytes, 0, 100, 0);
    return bytesRead === 100 && bytes.subarray(0, 16).toString("ascii") === "SQLite format 3\u0000"
      ? { version: bytes.readUInt32BE(60), rollback: bytes[18] === 1 && bytes[19] === 1 }
      : null;
  } finally {
    await file.close();
  }
}

/** Shared read-only guard. Unsupported headers and healthy files with unsettled WAL never reach SQLite. */
export async function inspectHistoryStorage(
  factory: HistoryDatabaseFactory,
  path: string,
): Promise<"compatible" | "incompatible" | "unavailable"> {
  const header = await readHistoryHeader(path);
  if (header !== null && !supportedHistoryVersion(header.version)) return "incompatible";
  // Even a read-only SQLite open can create sidecars for a clean WAL-mode
  // database. Refuse it before SQLite access; never remove sidecars afterward.
  if (header !== null && !header.rollback) return "unavailable";
  const { lstat } = await import("node:fs/promises");
  // Corrupt/non-SQLite headers need a read-only SQLite diagnostic. Confirmed
  // corruption may preserve owned sidecars in quarantine; healthy WAL is protected.
  if (header !== null) {
    try {
      const wal = await lstat(path + "-wal");
      if (wal.size > 0 || wal.isSymbolicLink() || !wal.isFile()) return "unavailable";
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT")
        throw error;
    }
  }
  const db = factory(path, true);
  try {
    const version = (db.prepare("PRAGMA user_version").get() as { user_version: number })
      .user_version;
    return supportedHistoryVersion(version) && supportedHistoryLayout(db, version)
      ? "compatible"
      : "incompatible";
  } finally {
    db.close();
  }
}
type RuntimeDatabase = Omit<HistoryDatabase, "transaction">;
type RuntimeConstructor = new (path: string, options?: Record<string, boolean>) => RuntimeDatabase;
export async function loadHistoryStorage(): Promise<HistoryDatabaseFactory | null> {
  try {
    const module = await import("node:sqlite");
    const Constructor: RuntimeConstructor = module.DatabaseSync;
    if (typeof Constructor !== "function") return null;
    const factory: HistoryDatabaseFactory = (path, readonly = false) => {
      const raw = new Constructor(path, { readOnly: readonly });
      raw.exec("PRAGMA busy_timeout = 1000");
      return {
        exec: (sql) => raw.exec(sql),
        prepare: (sql) => raw.prepare(sql),
        close: () => raw.close(),
        transaction<T>(work: () => T): T {
          raw.exec("BEGIN IMMEDIATE");
          try {
            const value = work();
            raw.exec("COMMIT");
            return value;
          } catch (error) {
            raw.exec("ROLLBACK");
            throw error;
          }
        },
      };
    };
    const probe = factory(":memory:");
    try {
      probe.prepare("SELECT 1 AS supported").get();
    } finally {
      probe.close();
    }
    return factory;
  } catch {
    return null;
  }
}

// Retained as a named host-bundle export for real packaged persistence evidence, not RPC.
export async function openHistoryDatabase(
  path: string,
  readonly = false,
): Promise<HistoryDatabase | null> {
  const factory = await loadHistoryStorage();
  return factory ? factory(path, readonly) : null;
}
