import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { safeDirectory } from "../collection/collector-control.js";
import { validHostDataDir } from "../collection/collector-compatibility.js";
import {
  loadHistoryStorage,
  inspectHistoryStorage,
  type HistoryDatabaseFactory,
} from "../storage/history-storage.js";
import { initializeHistory } from "../storage/history-projection.js";
import { initializeIdentityStorage } from "../identity/identity-storage.js";
import { maintainHistory, retentionState } from "../storage/history-retention.js";
import { importStatus } from "./import-state.js";
import { executeImport, type ImportOptions } from "./import-engine.js";
import { importUnavailable, type ImportCommand, type ImportView } from "./import-contract.js";
export type ImportContext = {
  hostId: string;
  dataDir: string;
  signal: AbortSignal;
  knownWorkspaces: string[];
};
export function createImportOperation(
  deps: {
    storage?: () => Promise<HistoryDatabaseFactory | null>;
    now?: () => number;
    bodyRead?: () => void;
    rows?: number;
    bytes?: number;
  } = {},
) {
  return async (command: ImportCommand, context: ImportContext): Promise<ImportView> => {
    if (context.signal.aborted) return importUnavailable("selection-changed");
    const directory = join(context.dataDir, "history"),
      path = join(directory, "usage-v1.sqlite");
    try {
      const factory = await (deps.storage ?? loadHistoryStorage)();
      context.signal.throwIfAborted();
      if (!factory || !validHostDataDir(context.dataDir))
        return importUnavailable("storage-unavailable");
      let exists = false;
      try {
        const dir = await lstat(directory);
        if (!dir.isDirectory() || dir.isSymbolicLink())
          return importUnavailable("storage-incompatible");
        const file = await lstat(path);
        if (!file.isFile() || file.isSymbolicLink())
          return importUnavailable("storage-incompatible");
        exists = true;
        const state = await inspectHistoryStorage(factory, path);
        if (state !== "compatible")
          return importUnavailable(
            state === "incompatible" ? "storage-incompatible" : "storage-unavailable",
          );
      } catch (e) {
        if (!e || typeof e !== "object" || !("code" in e) || e.code !== "ENOENT") throw e;
      }
      if (!exists && command.action !== "configure")
        return importUnavailable(
          command.action === "status" || command.action === "start"
            ? "not-configured"
            : "no-generation",
        );
      if (!exists) {
        await safeDirectory(context.dataDir);
        await safeDirectory(directory);
      }
      context.signal.throwIfAborted();
      const db = factory(path);
      try {
        initializeHistory(db, new Date((deps.now ?? Date.now)()).toISOString(), false);
        initializeIdentityStorage(db);
        if (
          command.action === "status" ||
          command.action === "start" ||
          command.action === "resume"
        ) {
          maintainHistory(db, (deps.now ?? Date.now)());
          context.signal.throwIfAborted();
          if (command.action !== "status" && !retentionState(db).backfill_done)
            return { ...importStatus(db, context.hostId), reason: "metadata-incomplete" };
        }
        const options: ImportOptions = {
          signal: context.signal,
          now: deps.now,
          bodyRead: deps.bodyRead,
          rows: deps.rows,
          bytes: deps.bytes,
        };
        return await executeImport(db, context.hostId, command, context.knownWorkspaces, options);
      } finally {
        db.close();
      }
    } catch {
      return importUnavailable(
        context.signal.aborted ? "selection-changed" : "storage-unavailable",
      );
    }
  };
}
