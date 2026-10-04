import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { historyUnavailable, type HistoryReadiness, type CollectorAction } from "./history-contract.js";
import { loadHistoryStorage, historyHeaderVersion, type HistoryDatabaseFactory } from "./history-storage.js";
import { readCollectorCompatibility, validHostDataDir } from "./collector-compatibility.js";
import { controlCollector, readControl, safeDirectory } from "./collector-control.js";
import { reconcileCollector } from "./history-ingest.js";
import { collectionView, initializeHistory, historyObserved } from "./history-projection.js";
import { createRetentionSchema, HISTORY_VERSION, maintainHistory, retentionState } from "./history-retention.js";
import { confirmedCorruption, recoverHistory, saveBoundary } from "./history-recovery.js";
import { pruneCollectorLogs } from "./history-logs.js";

export type HistoryReadContext = { signal: AbortSignal; dataDir: string };
export interface HostHistory {
  read(context: HistoryReadContext): Promise<HistoryReadiness>;
  control(action: CollectorAction, context: HistoryReadContext): Promise<HistoryReadiness>;
}
type Dependencies = {
  storage?: () => Promise<HistoryDatabaseFactory | null>; agentDir?: () => string;
  collector?: (dataDir: string) => Promise<HistoryReadiness["collector"]>;
  now?: () => number; bodyRead?: () => void; ingestBytes?: number; ingestRows?: number; maintenanceRows?: number;
};
const missing = (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
export function createHostHistory(deps: Dependencies = {}): HostHistory {
  let queue = Promise.resolve<unknown>(null);
  const agent = deps.agentDir ?? getAgentDir;
  const serialize = (work: () => Promise<HistoryReadiness>) => {
    const result = queue.then(work); queue = result.catch(() => null); return result;
  };
  async function perform(context: HistoryReadContext, action?: CollectorAction, retried=false): Promise<HistoryReadiness> {
    const {signal,dataDir}=context;
    if (signal.aborted) return historyUnavailable("selection-changed");
    let factory:HistoryDatabaseFactory|null=null;
    const directory=join(dataDir,"history"),path=join(directory,"usage-v1.sqlite"),now=(deps.now??Date.now)();
    let storage: HistoryReadiness["storage"] = "unavailable",version=0;
    try {
      factory = await (deps.storage ?? loadHistoryStorage)();
      signal.throwIfAborted();
      if (!factory || !validHostDataDir(dataDir)) return { ...historyUnavailable("storage-unavailable"), storage };
      storage = "unconfigured";
      try {
        const folder = await lstat(directory);
        if (!folder.isDirectory() || folder.isSymbolicLink()) storage = "incompatible";
        else {
          const file = await lstat(path);
          if (!file.isFile() || file.isSymbolicLink()) storage = "incompatible";
          else {
            const header=await historyHeaderVersion(path);
            if(header!==null && ![1,HISTORY_VERSION].includes(header)) return {...historyUnavailable("storage-incompatible"),storage:"incompatible"};
            // This host uses rollback journals. Do not open an external/unsettled WAL with unknown page-one version.
            if(header!==null) {
              try { const wal=await lstat(path+"-wal"); if(wal.size>0||wal.isSymbolicLink()||!wal.isFile()) return {...historyUnavailable("storage-unavailable"),storage:"unavailable"}; }
              catch(error) {if(!missing(error))throw error;}
            }
            const db = factory(path, true);
            try { version=(db.prepare("PRAGMA user_version").get() as {user_version:number}).user_version; storage = [1,HISTORY_VERSION].includes(version) ? "compatible" : "incompatible"; }
            finally { db.close(); }
          }
        }
      } catch (error) { if (!missing(error)) throw error; }
      signal.throwIfAborted();
      // Check versions before consulting a saved recovery receipt or opening for write.
      if(storage==="incompatible")return {...historyUnavailable("storage-incompatible"),storage};
      if(await recoverHistory(factory,directory,now,signal)) {storage="compatible";version=HISTORY_VERSION;}
      if (action && action !== "install" && storage === "unconfigured") return { state: "not-configured", reason: "not-configured", storage, collector: "missing", writer: "unconfirmed" };
      const enabledBefore=storage==="compatible"?await readControl(directory):null;
      if(storage==="compatible" && enabledBefore!==null) {
        const db=factory(path);
        try {
          if(version===1 && db.prepare("SELECT name FROM sqlite_master WHERE name='collector_meta'").get()) db.transaction(()=>createRetentionSchema(db,true));
        }finally{db.close();}
      }
      if (action) {
        await safeDirectory(dataDir); signal.throwIfAborted();
        await safeDirectory(directory); signal.throwIfAborted();
        const db = factory(path);
        try {
          const initialSetup = !db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='collector_meta'").get();
          if (initialSetup && action !== "install") throw Error("Collector control unavailable");
          if (initialSetup) initializeHistory(db, new Date(now).toISOString());
          await controlCollector(action, db, dataDir, agent(), new Date(now).toISOString(), signal, initialSetup);
        } finally { db.close(); }
        storage = "compatible";
      }
      const collector = await (deps.collector ? deps.collector(dataDir) : readCollectorCompatibility(agent(), dataDir, Number(process.versions.node.split(".")[0]) >= 22));
      signal.throwIfAborted();
      const reason = collector === "incompatible" ? "collector-incompatible" : storage === "unconfigured" || collector === "missing" ? "not-configured" : "ok";
      const view: HistoryReadiness = { state: reason === "ok" ? "available" : reason === "not-configured" ? "not-configured" : "unavailable", reason, storage, collector, writer: "unconfirmed" };
      if (storage === "compatible") {
        const enabled = await readControl(directory);
        if (enabled !== null) {
          const db = factory(path);
          try {
            const meta = db.prepare("SELECT first_observed FROM collector_meta WHERE id=1").get();
            if (!meta) throw Error("History metadata unavailable");
            // A v1 migration must finish before replay decisions use the new compact index.
            const maintenance=maintainHistory(db,now,deps.maintenanceRows);
            const backfilling=!retentionState(db).backfill_done;
            const backlog = backfilling || await reconcileCollector(db, directory, { signal, bytes: deps.ingestBytes, rows: deps.ingestRows, bodyRead: deps.bodyRead, now, recoveryFloor: db.prepare("SELECT id FROM history_recovery WHERE id=1").get() ? maintenance.detail : undefined });
            signal.throwIfAborted();
            const logs=backfilling?{pending:true,legacyLogsPending:false}:await pruneCollectorLogs(db,directory,now,signal);
            await saveBoundary(db,directory,now,signal);
            view.collection = collectionView(db, enabled, backlog);
            view.writer = historyObserved(db) ? "observed" : "unconfirmed";
            const gaps=db.prepare("SELECT started AS start,ended AS end FROM history_recovery LIMIT 1").all() as {start:string;end:string}[];
            view.health={state:gaps.length?"recovered":maintenance.pending||logs.pending||logs.legacyLogsPending?"maintenance":"healthy",detailFrom:maintenance.detail,compactFrom:maintenance.compact,pending:maintenance.pending||logs.pending,recoveryGaps:gaps,legacyLogsPending:logs.legacyLogsPending};
          } finally { db.close(); }
        } else {
          const db = factory(path, true);
          try { if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='collector_meta'").get()) throw Error("Collector control unavailable"); }
          finally { db.close(); }
        }
      }
      return view;
    } catch(error) {
      if(!retried&&!signal.aborted&&factory&&validHostDataDir(dataDir)&&confirmedCorruption(error)) {
        try {await recoverHistory(factory,directory,now,signal,true);return perform(context,undefined,true);}catch{/* Fixed public diagnostic below. */}
      }
      return signal.aborted ? historyUnavailable("selection-changed") : { ...historyUnavailable("storage-unavailable"), storage: "unavailable" };
    }
  }
  return { read: context => serialize(() => perform(context)), control: (action, context) => serialize(() => perform(context, action)) };
}
