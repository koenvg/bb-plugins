import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { safeDirectory } from "./collector-control.js";
import { validHostDataDir } from "./collector-compatibility.js";
import {
  loadHistoryStorage,
  type HistoryDatabaseFactory,
} from "./history-storage.js";
import { initializeHistory } from "./history-projection.js";
import { initializeIdentityStorage } from "./identity-storage.js";
import { executeImport, type ImportOptions } from "./import-engine.js";
import {
  importUnavailable,
  type ImportCommand,
  type ImportView,
} from "./import-contract.js";
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
  return async (
    command: ImportCommand,
    context: ImportContext,
  ): Promise<ImportView> => {
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
      } catch (e) {
        if (
          !e ||
          typeof e !== "object" ||
          !("code" in e) ||
          e.code !== "ENOENT"
        )
          throw e;
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
        const v = (
          db.prepare("PRAGMA user_version").get() as { user_version: number }
        ).user_version;
        if (v !== 0 && v !== 1)
          return importUnavailable("storage-incompatible");
        initializeHistory(
          db,
          new Date((deps.now ?? Date.now)()).toISOString(),
          false,
        );
        initializeIdentityStorage(db);
        const options: ImportOptions = {
          signal: context.signal,
          now: deps.now,
          bodyRead: deps.bodyRead,
          rows: deps.rows,
          bytes: deps.bytes,
        };
        return await executeImport(
          db,
          context.hostId,
          command,
          context.knownWorkspaces,
          options,
        );
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
