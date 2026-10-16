import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { openHistoryDatabase, type HistoryDatabase } from "../storage/history-storage.js";
import { initializeHistory } from "../storage/history-projection.js";
import { acceptIdentityBatch } from "../identity/identity-storage.js";
import { executeImport } from "./import-engine.js";

it.each([false, true])(
  "commits missing headers atomically and yields to cancellation=%s",
  async (cancel) => {
    const root = await mkdtemp(join(tmpdir(), "quota-missing-headers-"));
    const path = join(root, "usage.sqlite");
    let db: HistoryDatabase | undefined;
    let observer: HistoryDatabase | undefined;
    try {
      const source = join(root, "source"),
        workspace = join(root, "workspace");
      await mkdir(source);
      await mkdir(workspace);
      db = (await openHistoryDatabase(path))!;
      initializeHistory(db, "2026-10-01T00:00:00Z", false);
      acceptIdentityBatch(db, {
        hostId: "host-a",
        generation: 1,
        offset: 0,
        total: 50,
        rows: Array.from({ length: 50 }, (_, n) => ({
          threadId: `thr_missing_${n}`,
          providerIdentity: `missing-${n}`,
          title: null,
          state: "available" as const,
        })),
      });
      const controller = new AbortController();
      const options = { signal: controller.signal, now: () => Date.parse("2026-10-01T12:00:00Z") };
      await executeImport(
        db,
        "host-a",
        {
          action: "configure",
          configuration: { bbRoot: source, ordinaryRoots: [], workspaces: [workspace] },
        },
        [workspace],
        options,
      );
      const started = await executeImport(db, "host-a", { action: "start" }, [workspace], options);
      expect(started.generation).toMatchObject({ state: "stopped", candidates: 50, finished: 0 });
      // A second connection observes real commits. SQLite can elide unchanged
      // UPDATEs, so counting statements alone overstates durable disk work.
      observer = (await openHistoryDatabase(path, true))!;
      const dataVersion = () =>
        (observer!.prepare("PRAGMA data_version").get() as { data_version: number }).data_version;
      let version = dataVersion();
      let durableCommits = 0;
      const observeCommit = () => {
        const next = dataVersion();
        if (next !== version) {
          durableCommits++;
        }
        version = next;
      };

      let depth = 0,
        commits = 0,
        standalone = 0;
      const storage = db;
      const measured: HistoryDatabase = {
        exec: (sql) => storage.exec(sql),
        close: () => storage.close(),
        prepare(sql) {
          const statement = storage.prepare(sql);
          return {
            get: (...args) => statement.get(...args),
            all: (...args) => statement.all(...args),
            run(...args) {
              const result = statement.run(...args);
              if (!depth) {
                standalone++;
                observeCommit();
              }
              if (cancel) setImmediate(() => controller.abort());
              return result;
            },
          };
        },
        transaction(work) {
          const result = storage.transaction(() => {
            depth++;
            try {
              const value = work();
              expect(value).not.toBeInstanceOf(Promise);
              return value;
            } finally {
              depth--;
            }
          });
          commits++;
          observeCommit();
          return result;
        },
      };
      const resumed = await executeImport(
        measured,
        "host-a",
        { action: "resume" },
        [workspace],
        options,
      );
      expect(durableCommits).toBe(cancel ? 2 : 32);
      expect(resumed.reason).toBe(cancel ? "selection-changed" : "ok");
      expect(resumed.generation).toMatchObject({
        state: "stopped",
        candidates: 50,
        finished: cancel ? 1 : 32,
        omissions: cancel ? 1 : 32,
        bytes: 0,
      });
      expect(commits).toBe(cancel ? 1 : 32);
      // Only the interruption diagnostic may write outside the per-header transaction.
      expect(standalone).toBe(cancel ? 1 : 0);
      db.close();
      db = undefined;
      db = (await openHistoryDatabase(path))!;
      expect(
        db
          .prepare(
            "SELECT state,count(*) AS n FROM import_candidates GROUP BY state ORDER BY state",
          )
          .all(),
      ).toEqual([
        { state: "omitted", n: cancel ? 1 : 32 },
        { state: "pending", n: cancel ? 49 : 18 },
      ]);
      expect(db.prepare("SELECT bytes,omissions FROM import_generations").get()).toEqual({
        bytes: 0,
        omissions: cancel ? 1 : 32,
      });
      const canceled = await executeImport(db, "host-a", { action: "cancel" }, [workspace], {
        ...options,
        signal: new AbortController().signal,
      });
      expect(canceled.generation).toMatchObject({
        state: "canceled",
        finished: cancel ? 1 : 32,
        omissions: cancel ? 1 : 32,
      });
    } finally {
      observer?.close();
      db?.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
