import { readHostCalendar } from "./calendar-host.js";
import type { CalendarQuery } from "./calendar-contract.js";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { historyUnavailable, type HistoryReadiness, type CollectorAction, type LegacyConfirmation } from "./history-contract.js";
import { loadHistoryStorage, inspectHistoryStorage, type HistoryDatabaseFactory } from "./history-storage.js";
import { readCollectorCompatibility, validHostDataDir } from "./collector-compatibility.js";
import { controlCollector, readControl, readHistoryControl, safeDirectory } from "./collector-control.js";
import { reconcileCollector } from "./history-ingest.js";
import { collectionView, initializeHistory, historyObserved } from "./history-projection.js";
import { maintainHistory, retentionState } from "./history-retention.js";
import { confirmedCorruption, recoverHistory, saveBoundary } from "./history-recovery.js";
import { pruneCollectorLogs } from "./history-logs.js";
import { maintainLegacy } from "./history-legacy.js";

import type { IdentityBatch } from "./identity-contract.js";
import { initializeIdentityStorage, acceptIdentityBatch, reconcileIdentity, identityView } from "./identity-storage.js";
import { createImportOperation, type ImportContext } from "./import-host.js";
import type { ImportCommand, ImportView } from "./import-contract.js";
export type HistoryReadContext = { signal: AbortSignal; dataDir: string; identities?: IdentityBatch; calendar?: CalendarQuery };
export interface HostHistory {
  read(context: HistoryReadContext): Promise<HistoryReadiness>;
  control(action: CollectorAction, context: HistoryReadContext, confirmation?: LegacyConfirmation): Promise<HistoryReadiness>;
  controlImport?(command: ImportCommand, context: ImportContext): Promise<ImportView>;
}
type Dependencies = {
  storage?: () => Promise<HistoryDatabaseFactory | null>; agentDir?: () => string;
  collector?: (dataDir: string) => Promise<HistoryReadiness["collector"]>;
  now?: () => number; bodyRead?: () => void; ingestBytes?: number; ingestRows?: number; maintenanceRows?: number;
  retirementRows?: number; retirementCheckpoint?: (step: string) => void;
};
const missing = (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
export function createHostHistory(deps: Dependencies = {}): HostHistory {
  let queue = Promise.resolve<unknown>(null);
  const agent = deps.agentDir ?? getAgentDir;
  const importOperation = createImportOperation({ storage: deps.storage, now: deps.now, bodyRead: deps.bodyRead });
  const importControllers = new Map<string, AbortController>();
  const importEpochs = new Map<string, number>();
  const serialize = <T>(work: () => Promise<T>) => {
    const result = queue.then(work); queue = result.catch(() => null); return result;
  };
  async function perform(context: HistoryReadContext, action?: CollectorAction, retried=false, confirmation?: LegacyConfirmation): Promise<HistoryReadiness> {
    const {signal,dataDir,identities}=context;
    if (signal.aborted) return historyUnavailable("selection-changed");
    let factory:HistoryDatabaseFactory|null=null;
    const directory=join(dataDir,"history"),path=join(directory,"usage-v1.sqlite"),now=(deps.now??Date.now)();
    let storage: HistoryReadiness["storage"] = "unavailable";
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
            storage = await inspectHistoryStorage(factory,path);
            if (storage === "unavailable") return {...historyUnavailable("storage-unavailable"),storage};
          }
        }
      } catch (error) { if (!missing(error)) throw error; }
      signal.throwIfAborted();
      // Check versions before consulting a saved recovery receipt or opening for write.
      if(storage==="incompatible")return {...historyUnavailable("storage-incompatible"),storage};
      if(await recoverHistory(factory,directory,now,signal)) storage="compatible";
      if (action && action !== "install" && storage === "unconfigured") return { state: "not-configured", reason: "not-configured", storage, collector: "missing", writer: "unconfirmed" };
      if (storage === "compatible") {
        const db = factory(path);
        try { initializeHistory(db, new Date(now).toISOString(), false); }
        finally { db.close(); }
      }
      if (action && action !== "prepare-legacy" && action !== "retire-legacy") {
        await safeDirectory(dataDir); signal.throwIfAborted();
        await safeDirectory(directory); signal.throwIfAborted();
        const db = factory(path);
        try {
          const initialSetup = !db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='collector_meta'").get() || !db.prepare("SELECT first_observed FROM collector_meta WHERE id=1").get();
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
        const db = factory(path);
        try {
          const enabled = await readHistoryControl(db, directory);
          signal.throwIfAborted();
          if (enabled !== null) {
            initializeIdentityStorage(db);
            if (identities) acceptIdentityBatch(db, identities);
            // A v1 migration must finish before replay decisions use the new compact index.
            const maintenance=maintainHistory(db,now,deps.maintenanceRows);
            const backfilling=!retentionState(db).backfill_done;
            const legacyAction = action === "prepare-legacy" || action === "retire-legacy" ? action : undefined;
            const legacy = backfilling ? { status: undefined, failed: !!legacyAction } : await maintainLegacy(db, directory, now,
              { signal, rows: deps.retirementRows ?? deps.ingestRows, checkpoint: deps.retirementCheckpoint,
                recoveryFloor: db.prepare("SELECT id FROM history_recovery WHERE id=1").get() ? maintenance.detail : undefined }, legacyAction, confirmation);
            const backlog = backfilling || (!legacy.failed && await reconcileCollector(db, directory, { signal, bytes: deps.ingestBytes, rows: deps.ingestRows, bodyRead: deps.bodyRead, now, recoveryFloor: db.prepare("SELECT id FROM history_recovery WHERE id=1").get() ? maintenance.detail : undefined }));
            if (legacy.failed) { view.state = "unavailable"; view.reason = "retirement-incomplete"; }
            signal.throwIfAborted();
            const logs=backfilling||legacy.failed?{pending:true,legacyLogsPending:!!legacy.status}:await pruneCollectorLogs(db,directory,now,signal);
            await saveBoundary(db,directory,now,signal);
            const latestEnabled = await readControl(directory);
            if (latestEnabled === null) throw Error("Collector control unavailable");
            view.collection = collectionView(db, latestEnabled, backlog);
            reconcileIdentity(db, signal);
            view.collection.attribution = identities?.total === null ? { ...identityView(db), discovery: "partial", grades: [], threads: [] } : identities ? identityView(db) : { ...identityView(db), discovery: "unknown", grades: [], threads: [] };
            view.writer = historyObserved(db) ? "observed" : "unconfirmed";
            const gaps=db.prepare("SELECT started AS start,ended AS end FROM history_recovery LIMIT 1").all() as {start:string;end:string}[];
            view.health={state:gaps.length?"recovered":maintenance.pending||logs.pending||logs.legacyLogsPending||legacy.failed||!!legacy.status&&legacy.status.phase!=="complete"?"maintenance":"healthy",detailFrom:maintenance.detail,compactFrom:maintenance.compact,pending:maintenance.pending||logs.pending||!!legacy.status&&legacy.status.phase!=="complete",recoveryGaps:gaps,legacyLogsPending:logs.legacyLogsPending,legacyRetirement:legacy.status};
          } else if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='import_config'").get()) {
            initializeIdentityStorage(db);
            const maintenance = maintainHistory(db,now,deps.maintenanceRows);
            view.health = {state:maintenance.pending ? "maintenance" : "healthy",detailFrom:maintenance.detail,compactFrom:maintenance.compact,pending:maintenance.pending,recoveryGaps:[],legacyLogsPending:false};
            if (identities) acceptIdentityBatch(db, identities);
            reconcileIdentity(db, signal);
            view.attribution = identities ? identityView(db) : { ...identityView(db), discovery: "unknown", grades: [], threads: [] };
          }
        } finally { db.close(); }
      }
      return view;
    } catch(error) {
      if(!retried&&!signal.aborted&&factory&&validHostDataDir(dataDir)&&confirmedCorruption(error)) {
        try {await recoverHistory(factory,directory,now,signal,true);return perform(context,undefined,true);}catch{/* Fixed public diagnostic below. */}
      }
      return signal.aborted ? historyUnavailable("selection-changed") : { ...historyUnavailable("storage-unavailable"), storage: "unavailable" };
    }
  }
  return {
    read: context => serialize(async () => context.calendar ? {...historyUnavailable("unsupported"),calendar:await readHostCalendar({...context,calendar:context.calendar},deps)} : perform(context)),
    control: (action, context, confirmation) => serialize(() => perform(context, action, false, confirmation)),
    controlImport: (command, context) => {
      if (command.action === "cancel" && !context.signal.aborted) {
        importEpochs.set(context.hostId, (importEpochs.get(context.hostId) ?? 0) + 1);
        importControllers.get(context.hostId)?.abort();
      }
      const epoch = importEpochs.get(context.hostId) ?? 0;
      return serialize(async () => {
        const controller = new AbortController();
        if ((importEpochs.get(context.hostId) ?? 0) !== epoch) controller.abort();
        const signal = AbortSignal.any([context.signal, controller.signal]);
        importControllers.set(context.hostId, controller);
        try { return await importOperation(command, { ...context, signal }); }
        finally { if (importControllers.get(context.hostId) === controller) importControllers.delete(context.hostId); }
      });
    },
  };
}
