import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { readHistoryControl } from "../collection/collector-control.js";
import { validHostDataDir } from "../collection/collector-compatibility.js";
import { legacyIdentityUpgradeLayout, supportedHistoryLayout } from "./history-layout.js";
import {
  inspectHistoryStorage,
  loadHistoryStorage,
  type HistoryDatabaseFactory,
} from "./history-storage.js";
import { retainedHistoryReason } from "./retained-history.js";

type Result =
  | { state: "ready" | "current" | "upgraded" }
  | { state: "unavailable"; reason: string };

/** Offline, explicit schema-only operation. The caller must back up before applying. */
export async function upgradeRetainedIdentityStorage(
  context: { dataDir: string; signal: AbortSignal; apply?: boolean },
  deps: { storage?: () => Promise<HistoryDatabaseFactory | null> } = {},
): Promise<Result> {
  const { dataDir, signal } = context;
  const unavailable = (reason: string): Result => ({ state: "unavailable", reason });
  try {
    signal.throwIfAborted();
    if (!validHostDataDir(dataDir)) return unavailable("storage-unavailable");
    const directory = join(dataDir, "history"),
      path = join(directory, "usage-v1.sqlite");
    for (const [name, folder] of [
      [dataDir, true],
      [directory, true],
      [path, false],
    ] as const) {
      const stat = await lstat(name);
      if (stat.isSymbolicLink() || (folder ? !stat.isDirectory() : !stat.isFile()))
        return unavailable("storage-incompatible");
    }
    const factory = await (deps.storage ?? loadHistoryStorage)();
    signal.throwIfAborted();
    if (!factory) return unavailable("storage-unavailable");
    const state = await inspectHistoryStorage(
      factory,
      path,
      (db, version) =>
        supportedHistoryLayout(db, version) || legacyIdentityUpgradeLayout(db, version),
    );
    signal.throwIfAborted();
    if (state !== "compatible") return unavailable(`storage-${state}`);
    const checked = factory(path, true);
    try {
      const version = (checked.prepare("PRAGMA user_version").get() as { user_version: number })
        .user_version;
      if (version !== 4) return unavailable("storage-incompatible");
      await readHistoryControl(checked, directory);
      signal.throwIfAborted();
      if (supportedHistoryLayout(checked, version)) return { state: "current" };
      if (
        !(
          checked.prepare("SELECT backfill_done FROM history_retention WHERE id=1").get() as {
            backfill_done: number;
          }
        ).backfill_done
      )
        return unavailable("storage-unavailable");
      if (!context.apply) return { state: "ready" };
    } finally {
      checked.close();
    }
    signal.throwIfAborted();
    const db = factory(path);
    try {
      // Recheck layout under the write lock. Do not repair arbitrary or concurrent changes.
      return db.transaction((): Result => {
        signal.throwIfAborted();
        const version = (db.prepare("PRAGMA user_version").get() as { user_version: number })
          .user_version;
        if (version === 4 && supportedHistoryLayout(db, version)) return { state: "current" };
        if (!legacyIdentityUpgradeLayout(db, version))
          throw Error("Identity upgrade layout changed");
        if (
          !(
            db.prepare("SELECT backfill_done FROM history_retention WHERE id=1").get() as {
              backfill_done: number;
            }
          ).backfill_done
        )
          throw Error("Identity upgrade backfill changed");
        const receipt = db.prepare("SELECT revision FROM identity_receipt WHERE id=1").get() as {
          revision: number;
        };
        if (
          !Number.isSafeInteger(receipt.revision) ||
          receipt.revision < 0 ||
          receipt.revision >= Number.MAX_SAFE_INTEGER
        )
          throw Error("Identity revision unavailable");
        db.exec(`CREATE TABLE identity_uncertain (thread_id TEXT NOT NULL, provider_identity TEXT NOT NULL, PRIMARY KEY(thread_id,provider_identity));
          CREATE INDEX identity_uncertain_provider ON identity_uncertain(provider_identity);
          INSERT INTO identity_uncertain SELECT DISTINCT thread_id,provider_identity FROM identity_edges;
          UPDATE identity_receipt SET revision=revision+1,evidence_changed=1 WHERE id=1;`);
        // Older storage cannot prove which links were uncertain. Fresh positive evidence
        // can clear these conservative markers through normal bounded preparation.
        signal.throwIfAborted();
        if (!supportedHistoryLayout(db, version)) throw Error("Identity upgrade incomplete");
        return { state: "upgraded" };
      });
    } finally {
      db.close();
    }
  } catch (error) {
    return unavailable(retainedHistoryReason(error, signal));
  }
}
