// Internal host-local adapter. No BB server database or private SDK storage.
export type SqlValue = string | number | bigint | null | Uint8Array;
export interface HistoryDatabase {
  exec(sql: string): void;
  prepare(sql: string): { get(...values: SqlValue[]): unknown; run(...values: SqlValue[]): unknown };
  close(): void;
  transaction<T>(work: () => T): T;
}
export type HistoryDatabaseFactory = (path: string, readonly?: boolean) => HistoryDatabase;

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
        exec: (sql) => raw.exec(sql), prepare: (sql) => raw.prepare(sql), close: () => raw.close(),
        transaction<T>(work: () => T): T {
          raw.exec("BEGIN IMMEDIATE");
          try { const value = work(); raw.exec("COMMIT"); return value; }
          catch (error) { raw.exec("ROLLBACK"); throw error; }
        },
      };
    };
    const probe = factory(":memory:");
    try { probe.prepare("SELECT 1 AS supported").get(); } finally { probe.close(); }
    return factory;
  } catch { return null; }
}

// Retained as a named host-bundle export for real packaged persistence evidence, not RPC.
export async function openHistoryDatabase(path: string, readonly = false): Promise<HistoryDatabase | null> {
  const factory = await loadHistoryStorage();
  return factory ? factory(path, readonly) : null;
}
