import { lstat } from "node:fs/promises";
import { join } from "node:path";
import {
  inspectHistoryStorage,
  loadHistoryStorage,
  type HistoryDatabase,
  type HistoryDatabaseFactory,
} from "./history-storage.js";
import { readHistoryControl } from "../collection/collector-control.js";
import { validHostDataDir } from "../collection/collector-compatibility.js";

type Reason = "storage-unavailable" | "storage-incompatible" | "not-configured";
class RetainedHistoryError extends Error {
  constructor(readonly reason: Reason) {
    super(reason);
  }
}
export function retainedHistoryReason(
  error: unknown,
  signal: AbortSignal,
): Reason | "selection-changed" {
  return signal.aborted
    ? "selection-changed"
    : error instanceof RetainedHistoryError
      ? error.reason
      : error && typeof error === "object" && "code" in error && error.code === "ENOENT"
        ? "not-configured"
        : "storage-unavailable";
}
/** Open only an existing schema-4 index. No migration, recovery or collector changes. */
export async function withRetainedHistory<T>(
  context: { signal: AbortSignal; dataDir: string },
  deps: { storage?: () => Promise<HistoryDatabaseFactory | null> },
  readOnly: boolean,
  work: (db: HistoryDatabase) => T | Promise<T>,
): Promise<T> {
  const { signal, dataDir } = context;
  signal.throwIfAborted();
  if (!validHostDataDir(dataDir)) throw new RetainedHistoryError("storage-unavailable");
  const factory = await (deps.storage ?? loadHistoryStorage)();
  signal.throwIfAborted();
  if (!factory) throw new RetainedHistoryError("storage-unavailable");
  const directory = join(dataDir, "history"),
    path = join(directory, "usage-v1.sqlite");
  const folder = await lstat(directory),
    file = await lstat(path);
  signal.throwIfAborted();
  if (!folder.isDirectory() || folder.isSymbolicLink() || !file.isFile() || file.isSymbolicLink())
    throw new RetainedHistoryError("storage-incompatible");
  const state = await inspectHistoryStorage(factory, path);
  signal.throwIfAborted();
  if (state !== "compatible")
    throw new RetainedHistoryError(
      state === "incompatible" ? "storage-incompatible" : "storage-unavailable",
    );
  // Validate schema and control on a read-only connection before permitting identity writes.
  const checked = factory(path, true);
  try {
    if (
      (checked.prepare("PRAGMA user_version").get() as { user_version: number }).user_version !== 4
    )
      throw new RetainedHistoryError("storage-incompatible");
    await readHistoryControl(checked, directory);
    signal.throwIfAborted();
    if (readOnly) return await work(checked);
  } finally {
    checked.close();
  }
  signal.throwIfAborted();
  const writable = factory(path);
  try {
    return await work(writable);
  } finally {
    writable.close();
  }
}
