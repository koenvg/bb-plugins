import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  collectionSchema,
  historyReadinessSchema,
  historyUnavailable,
  type HistoryReadiness,
  type CollectorAction,
  type LegacyConfirmation,
} from "./history-contract.js";
import {
  loadHistoryStorage,
  inspectHistoryStorage,
  type HistoryDatabaseFactory,
} from "./storage/history-storage.js";
import {
  inspectCollectorAsset,
  readCollectorCompatibility,
  validHostDataDir,
} from "./collection/collector-compatibility.js";
import {
  replaceExistingCollector,
  readControlRecord,
  controlCollector,
  readControl,
  readHistoryControl,
  safeDirectory,
} from "./collection/collector-control.js";
import { reconcileCollector } from "./storage/history-ingest.js";
import {
  collectionView,
  initializeHistory,
  historyObserved,
} from "./storage/history-projection.js";
import { maintainHistory, retentionState } from "./storage/history-retention.js";
import { confirmedCorruption, recoverHistory, saveBoundary } from "./storage/history-recovery.js";
import { pruneCollectorLogs } from "./collection/history-logs.js";
import { maintainLegacy } from "./collection/history-legacy.js";
import type { IdentityBatch } from "./identity/identity-contract.js";
import {
  initializeIdentityStorage,
  acceptIdentityBatch,
  reconcileIdentity,
  identityView,
} from "./identity/identity-storage.js";

import {
  maintenanceUnavailable,
  repairResultSchema,
  type RepairResult,
} from "./collector-maintenance-contract.js";
export type HistoryReadContext = {
  signal: AbortSignal;
  dataDir: string;
  identities?: IdentityBatch;
};
export type HistoryDependencies = {
  storage?: () => Promise<HistoryDatabaseFactory | null>;
  codexHome?: () => string;
  nativeRead?: () => void;
  nativeLines?: number;
  agentDir?: () => string;
  collector?: (dataDir: string) => Promise<HistoryReadiness["collector"]>;
  now?: () => number;
  bodyRead?: () => void;
  ingestBytes?: number;
  ingestRows?: number;
  maintenanceRows?: number;
  retirementRows?: number;
  retirementCheckpoint?: (step: string) => void;
};
const missing = (error: unknown) =>
  !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";

/** The mutable readiness path. Read-only calendar reports never enter it. */
export function createHistoryMaintenance(deps: HistoryDependencies = {}) {
  const agent = deps.agentDir ?? getAgentDir;
  async function perform(
    context: HistoryReadContext,
    action?: CollectorAction,
    retried = false,
    confirmation?: LegacyConfirmation,
  ): Promise<HistoryReadiness> {
    const { signal, dataDir, identities } = context;
    if (signal.aborted) return historyUnavailable("selection-changed");
    let factory: HistoryDatabaseFactory | null = null;
    const directory = join(dataDir, "history"),
      path = join(directory, "usage-v1.sqlite"),
      now = (deps.now ?? Date.now)();
    let storage: HistoryReadiness["storage"] = "unavailable";
    try {
      factory = await (deps.storage ?? loadHistoryStorage)();
      signal.throwIfAborted();
      if (!factory || !validHostDataDir(dataDir))
        return { ...historyUnavailable("storage-unavailable"), storage };
      storage = "unconfigured";
      try {
        const folder = await lstat(directory);
        if (!folder.isDirectory() || folder.isSymbolicLink()) storage = "incompatible";
        else {
          const file = await lstat(path);
          if (!file.isFile() || file.isSymbolicLink()) storage = "incompatible";
          else {
            storage = await inspectHistoryStorage(factory, path);
            if (storage === "unavailable")
              return { ...historyUnavailable("storage-unavailable"), storage };
          }
        }
      } catch (error) {
        if (!missing(error)) throw error;
      }
      signal.throwIfAborted();
      // Check versions before consulting a saved recovery receipt or opening for write.
      if (storage === "incompatible")
        return { ...historyUnavailable("storage-incompatible"), storage };
      if (await recoverHistory(factory, directory, now, signal)) storage = "compatible";
      if (action && action !== "install" && storage === "unconfigured")
        return {
          state: "not-configured",
          reason: "not-configured",
          storage,
          collector: "missing",
          writer: "unconfirmed",
        };
      if (storage === "compatible") {
        const db = factory(path);
        try {
          initializeHistory(db, new Date(now).toISOString(), false);
        } finally {
          db.close();
        }
      }
      if (action && action !== "prepare-legacy" && action !== "retire-legacy") {
        await safeDirectory(dataDir);
        signal.throwIfAborted();
        await safeDirectory(directory);
        signal.throwIfAborted();
        const db = factory(path);
        try {
          const initialSetup =
            !db
              .prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='collector_meta'",
              )
              .get() || !db.prepare("SELECT first_observed FROM collector_meta WHERE id=1").get();
          if (initialSetup && action !== "install") throw Error("Collector control unavailable");
          if (initialSetup) initializeHistory(db, new Date(now).toISOString());
          await controlCollector(
            action,
            db,
            dataDir,
            agent(),
            new Date(now).toISOString(),
            signal,
            initialSetup,
          );
        } finally {
          db.close();
        }
        storage = "compatible";
      }
      const collector = await (deps.collector
        ? deps.collector(dataDir)
        : readCollectorCompatibility(
            agent(),
            dataDir,
            Number(process.versions.node.split(".")[0]) >= 22,
          ));
      signal.throwIfAborted();
      const reason =
        collector === "incompatible"
          ? "collector-incompatible"
          : storage === "unconfigured" || collector === "missing"
            ? "not-configured"
            : "ok";
      const view: HistoryReadiness = {
        state:
          reason === "ok"
            ? "available"
            : reason === "not-configured"
              ? "not-configured"
              : "unavailable",
        reason,
        storage,
        collector,
        writer: "unconfirmed",
      };
      if (storage === "compatible") {
        const db = factory(path);
        try {
          const enabled = await readHistoryControl(db, directory);
          signal.throwIfAborted();
          if (enabled !== null) {
            initializeIdentityStorage(db);
            if (identities) acceptIdentityBatch(db, identities);
            // A v1 migration must finish before replay decisions use the new compact index.
            const maintenance = maintainHistory(db, now, deps.maintenanceRows);
            const backfilling = !retentionState(db).backfill_done;
            const legacyAction =
              action === "prepare-legacy" || action === "retire-legacy" ? action : undefined;
            const legacy = backfilling
              ? { status: undefined, failed: !!legacyAction }
              : await maintainLegacy(
                  db,
                  directory,
                  now,
                  {
                    signal,
                    rows: deps.retirementRows ?? deps.ingestRows,
                    checkpoint: deps.retirementCheckpoint,
                    recoveryFloor: db.prepare("SELECT id FROM history_recovery WHERE id=1").get()
                      ? maintenance.detail
                      : undefined,
                  },
                  legacyAction,
                  confirmation,
                );
            const backlog =
              backfilling ||
              (!legacy.failed &&
                (await reconcileCollector(db, directory, {
                  signal,
                  bytes: deps.ingestBytes,
                  rows: deps.ingestRows,
                  bodyRead: deps.bodyRead,
                  now,
                  recoveryFloor: db.prepare("SELECT id FROM history_recovery WHERE id=1").get()
                    ? maintenance.detail
                    : undefined,
                })));
            if (legacy.failed) {
              view.state = "unavailable";
              view.reason = "retirement-incomplete";
            }
            signal.throwIfAborted();
            const logs =
              backfilling || legacy.failed
                ? { pending: true, legacyLogsPending: !!legacy.status }
                : await pruneCollectorLogs(db, directory, now, signal);
            await saveBoundary(db, directory, now, signal);
            const latestEnabled = await readControl(directory);
            if (latestEnabled === null) throw Error("Collector control unavailable");
            view.collection = collectionView(db, latestEnabled, backlog);
            reconcileIdentity(db, signal);
            view.collection.attribution =
              identities?.total === null
                ? { ...identityView(db), discovery: "partial", grades: [], threads: [] }
                : identities
                  ? identityView(db)
                  : { ...identityView(db), discovery: "unknown", grades: [], threads: [] };
            view.writer = historyObserved(db) ? "observed" : "unconfirmed";
            const gaps = db
              .prepare("SELECT started AS start,ended AS end FROM history_recovery LIMIT 1")
              .all() as { start: string; end: string }[];
            view.health = {
              state: gaps.length
                ? "recovered"
                : maintenance.pending ||
                    logs.pending ||
                    logs.legacyLogsPending ||
                    legacy.failed ||
                    (!!legacy.status && legacy.status.phase !== "complete")
                  ? "maintenance"
                  : "healthy",
              detailFrom: maintenance.detail,
              compactFrom: maintenance.compact,
              pending:
                maintenance.pending ||
                logs.pending ||
                (!!legacy.status && legacy.status.phase !== "complete"),
              recoveryGaps: gaps,
              legacyLogsPending: logs.legacyLogsPending,
              legacyRetirement: legacy.status,
            };
          } else if (
            db
              .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='import_config'")
              .get()
          ) {
            initializeIdentityStorage(db);
            const maintenance = maintainHistory(db, now, deps.maintenanceRows);
            view.health = {
              state: maintenance.pending ? "maintenance" : "healthy",
              detailFrom: maintenance.detail,
              compactFrom: maintenance.compact,
              pending: maintenance.pending,
              recoveryGaps: [],
              legacyLogsPending: false,
            };
            if (identities) acceptIdentityBatch(db, identities);
            reconcileIdentity(db, signal);
            view.attribution = identities
              ? identityView(db)
              : { ...identityView(db), discovery: "unknown", grades: [], threads: [] };
          }
        } finally {
          db.close();
        }
      }
      return view;
    } catch (error) {
      if (
        !retried &&
        !signal.aborted &&
        factory &&
        validHostDataDir(dataDir) &&
        confirmedCorruption(error)
      ) {
        try {
          await recoverHistory(factory, directory, now, signal, true);
          return perform(context, undefined, true);
        } catch {
          /* Fixed public diagnostic below. */
        }
      }
      return signal.aborted
        ? historyUnavailable("selection-changed")
        : { ...historyUnavailable("storage-unavailable"), storage: "unavailable" };
    }
  }
  async function repairExisting(context: HistoryReadContext): Promise<RepairResult> {
    const { dataDir, signal } = context;
    const unavailable = () =>
      maintenanceUnavailable(signal.aborted ? "canceled" : "verification-failed", "may-have-run");
    const preflight = await perform(context);
    if (signal.aborted) return unavailable();
    const parsed = historyReadinessSchema.safeParse(preflight);
    const readiness = parsed.success ? parsed.data : historyUnavailable("unsupported");
    const refuse = (
      reason: Extract<RepairResult, { kind: "refused" }>["reason"],
    ): RepairResult => ({ kind: "refused", reason, readiness });
    if (!parsed.success) return refuse("collection-invalid");
    if (readiness.storage !== "compatible") return refuse("storage-ineligible");
    const agentDir = agent();
    const asset = await inspectCollectorAsset(
      agentDir,
      dataDir,
      Number(process.versions.node.split(".")[0]) >= 22,
    );
    if (signal.aborted) return unavailable();
    if (asset === "missing") return refuse("collector-missing");
    if (asset === "unsafe") return refuse("unsafe-collector");
    if (asset === "runtime-unsupported") return refuse("runtime-unsupported");
    if (!readiness.collection) return refuse("collection-invalid");
    if (asset === "compatible") {
      const result = repairResultSchema.safeParse({
        kind: "unchanged",
        reason: "collector-compatible",
        readiness,
      });
      return result.success ? result.data : refuse("readiness-ineligible");
    }
    if (
      readiness.state !== "unavailable" ||
      readiness.reason !== "collector-incompatible" ||
      readiness.collector !== "incompatible"
    )
      return refuse("readiness-ineligible");
    const { enabled, firstObservedAt, pauseCount } = readiness.collection;
    const preserved = { enabled, firstObservedAt, pauseCount };
    const directory = join(dataDir, "history"),
      path = join(directory, "usage-v1.sqlite");
    try {
      const factory = await (deps.storage ?? loadHistoryStorage)();
      if (!factory) return refuse("storage-ineligible");
      for (const target of [dataDir, directory]) {
        const stat = await lstat(target);
        if (!stat.isDirectory() || stat.isSymbolicLink()) return refuse("storage-ineligible");
      }
      const file = await lstat(path);
      if (
        !file.isFile() ||
        file.isSymbolicLink() ||
        (await inspectHistoryStorage(factory, path)) !== "compatible"
      )
        return refuse("storage-ineligible");
      const db = factory(path, true);
      try {
        const currentEnabled = await readHistoryControl(db, directory);
        if (currentEnabled === null) return refuse("collection-invalid");
        const current = collectionView(db, currentEnabled, readiness.collection.backlog);
        if (
          !collectionSchema.safeParse(current).success ||
          current.enabled !== enabled ||
          current.firstObservedAt !== firstObservedAt ||
          current.pauseCount !== pauseCount
        )
          return refuse("collection-invalid");
      } finally {
        db.close();
      }
      signal.throwIfAborted();
      // Asset and control publication are separate durable writes. Never recover or retry this command.
      const published = await replaceExistingCollector(dataDir, agentDir, enabled, signal);
      signal.throwIfAborted();
      if (
        (await inspectHistoryStorage(factory, path)) !== "compatible" ||
        (await inspectCollectorAsset(agentDir, dataDir, true)) !== "compatible" ||
        JSON.stringify(await readControlRecord(directory)) !== JSON.stringify(published)
      )
        return unavailable();
      const verified = factory(path, true);
      try {
        const actualEnabled = await readHistoryControl(verified, directory);
        if (actualEnabled === null) return unavailable();
        const collection = collectionView(verified, actualEnabled, readiness.collection.backlog);
        const result = repairResultSchema.safeParse({
          kind: "repaired",
          preserved,
          readiness: {
            ...readiness,
            state: "available",
            reason: "ok",
            collector: "compatible-v1",
            collection: {
              ...collection,
              attribution: readiness.collection.attribution,
            },
          },
        });
        signal.throwIfAborted();
        return result.success ? result.data : unavailable();
      } finally {
        verified.close();
      }
    } catch {
      return unavailable();
    }
  }
  return Object.assign(
    (context: HistoryReadContext, action?: CollectorAction, confirmation?: LegacyConfirmation) =>
      perform(context, action, false, confirmation),
    { repairExisting },
  );
}
