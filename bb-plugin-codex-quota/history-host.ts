import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { historyUnavailable, type HistoryReadiness, type CollectorAction } from "./history-contract.js";
import { loadHistoryStorage, type HistoryDatabaseFactory } from "./history-storage.js";
import { readCollectorCompatibility, validHostDataDir } from "./collector-compatibility.js";
import { controlCollector, readControl, safeDirectory } from "./collector-control.js";
import { reconcileCollector } from "./history-ingest.js";
import { collectionView, initializeHistory, historyObserved } from "./history-projection.js";

export type HistoryReadContext = { signal: AbortSignal; dataDir: string };
export interface HostHistory {
  read(context: HistoryReadContext): Promise<HistoryReadiness>;
  control(action: CollectorAction, context: HistoryReadContext): Promise<HistoryReadiness>;
}
type Dependencies = {
  storage?: () => Promise<HistoryDatabaseFactory | null>; agentDir?: () => string;
  collector?: (dataDir: string) => Promise<HistoryReadiness["collector"]>;
  now?: () => number; bodyRead?: () => void; ingestBytes?: number; ingestRows?: number;
};
const missing = (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";

export function createHostHistory(deps: Dependencies = {}): HostHistory {
  let queue = Promise.resolve<unknown>(null);
  const agent = deps.agentDir ?? getAgentDir;
  const serialize = (work: () => Promise<HistoryReadiness>) => {
    const result = queue.then(work); queue = result.catch(() => null); return result;
  };
  async function perform({ signal, dataDir }: HistoryReadContext, action?: CollectorAction): Promise<HistoryReadiness> {
    if (signal.aborted) return historyUnavailable("selection-changed");
    let storage: HistoryReadiness["storage"] = "unavailable";
    try {
      const factory = await (deps.storage ?? loadHistoryStorage)();
      signal.throwIfAborted();
      if (!factory || !validHostDataDir(dataDir)) return { ...historyUnavailable("storage-unavailable"), storage };
      storage = "unconfigured";
      const directory = join(dataDir, "history"), path = join(directory, "usage-v1.sqlite");
      try {
        const folder = await lstat(directory);
        if (!folder.isDirectory() || folder.isSymbolicLink()) storage = "incompatible";
        else {
          const file = await lstat(path);
          if (!file.isFile() || file.isSymbolicLink()) storage = "incompatible";
          else {
            const db = factory(path, true);
            try { const row = db.prepare("PRAGMA user_version").get() as {user_version?:unknown}; storage = row?.user_version === 1 ? "compatible" : "incompatible"; }
            finally { db.close(); }
          }
        }
      } catch (error) { if (!missing(error)) storage = "unavailable"; }
      signal.throwIfAborted();
      if (action && ["incompatible", "unavailable"].includes(storage)) return { ...historyUnavailable(storage === "incompatible" ? "storage-incompatible" : "storage-unavailable"), storage };
      if (action && action !== "install" && storage === "unconfigured") return { state: "not-configured", reason: "not-configured", storage, collector: "missing", writer: "unconfirmed" };
      if (action) {
        await safeDirectory(dataDir); signal.throwIfAborted();
        await safeDirectory(directory); signal.throwIfAborted();
        const db = factory(path);
        try {
          const initialSetup = !db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='collector_meta'").get();
          if (initialSetup && action !== "install") throw Error("Collector control unavailable");
          if (initialSetup) initializeHistory(db, new Date((deps.now ?? Date.now)()).toISOString());
          await controlCollector(action, db, dataDir, agent(), new Date((deps.now ?? Date.now)()).toISOString(), signal, initialSetup);
        } finally { db.close(); }
        storage = "compatible";
      }
      const collector = await (deps.collector ? deps.collector(dataDir) : readCollectorCompatibility(agent(), dataDir, Number(process.versions.node.split(".")[0]) >= 22));
      signal.throwIfAborted();
      const reason = storage === "unavailable" ? "storage-unavailable" : storage === "incompatible" ? "storage-incompatible" : collector === "incompatible" ? "collector-incompatible" : storage === "unconfigured" || collector === "missing" ? "not-configured" : "ok";
      const view: HistoryReadiness = { state: reason === "ok" ? "available" : reason === "not-configured" ? "not-configured" : "unavailable", reason, storage, collector, writer: "unconfirmed" };
      if (storage === "compatible") {
        const enabled = await readControl(directory);
        if (enabled !== null) {
          const db = factory(path);
          try {
            // Only explicit installation initializes schemas. No control means readiness stays read-only.
            const meta = db.prepare("SELECT first_observed FROM collector_meta WHERE id=1").get();
            if (!meta) throw Error("History metadata unavailable");
            const backlog = await reconcileCollector(db, directory, { signal, bytes: deps.ingestBytes, rows: deps.ingestRows, bodyRead: deps.bodyRead });
            signal.throwIfAborted();
            view.collection = collectionView(db, enabled, backlog);
            view.writer = historyObserved(db) ? "observed" : "unconfirmed";
          } finally { db.close(); }
        }
        else {
          const db = factory(path, true);
          try { if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='collector_meta'").get()) throw Error("Collector control unavailable"); }
          finally { db.close(); }
        }
      }
      return view;
    } catch { return signal.aborted ? historyUnavailable("selection-changed") : { ...historyUnavailable("storage-unavailable"), storage: "unavailable" }; }
  }
  return { read: context => serialize(() => perform(context)), control: (action, context) => serialize(() => perform(context, action)) };
}
