import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { HistoryDatabase } from "./history-storage.js";
import { parseCompact } from "./usage-record.js";
import { projectCompactRecord } from "./history-projection.js";
import { collectorLogNames } from "./history-logs.js";
import { recordReconciliation, recordSourceUncertainty } from "./history-coverage.js";
export type IngestOptions = {
  signal: AbortSignal;
  bytes?: number;
  rows?: number;
  bodyRead?: () => void;
  now?: number;
  recoveryFloor?: string;
  legacyOnly?: boolean;
};
type Progress = {
  identity: string;
  size: number;
  stamp: string;
  offset: number;
  dropping: number;
  edge: string;
  invalid: number;
  stalled: number;
};
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const MAX_LINE = 64 * 1024;
export async function reconcileCollector(
  db: HistoryDatabase,
  directory: string,
  options: IngestOptions,
): Promise<boolean> {
  let bytesLeft =
    Math.max(128 * 1024, Math.min(options.bytes ?? 8 * 1024 * 1024, 8 * 1024 * 1024)) - 256;
  let rowsLeft = Math.min(options.rows ?? 500, 500),
    backlog = false;
  options.signal.throwIfAborted();
  if (!options.legacyOnly) recordReconciliation(db, true);
  const sources = options.legacyOnly
    ? [
        "events-legacy-retained-v1.jsonl",
        "events-v1.jsonl",
        "confirmations-legacy-retained-v1.jsonl",
        "confirmations-v1.jsonl",
      ]
    : collectorLogNames(db, options.now ?? Date.now());
  for (const name of sources) {
    options.signal.throwIfAborted();
    let file;
    try {
      file = await open(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") continue;
      throw Error("Collector source unavailable");
    }
    try {
      const stat = await file.stat();
      if (!stat.isFile()) throw Error("Collector source unavailable");
      const identity = `${stat.dev}:${stat.ino}`,
        stamp = `${stat.mtimeMs}:${stat.ctimeMs}`;
      const saved = db.prepare("SELECT * FROM collector_sources WHERE name=?").get(name) as
        | Progress
        | undefined;
      if (
        saved &&
        saved.identity === identity &&
        saved.size === stat.size &&
        saved.stamp === stamp &&
        (saved.offset === stat.size || saved.stalled === 1)
      ) {
        backlog ||= saved.offset < stat.size || saved.dropping === 1;
        continue;
      }
      if (bytesLeft <= 0 || rowsLeft <= 0) {
        backlog ||= stat.size > 0;
        continue;
      }
      let offset = saved?.offset ?? 0,
        dropping = saved?.dropping ?? 0;
      if (
        saved &&
        (saved.identity !== identity ||
          stat.size < saved.size ||
          (stat.size === saved.size && stamp !== saved.stamp))
      ) {
        offset = 0;
        dropping = 0;
      }
      // A boundary digest catches same-inode rewrites before accepting an append.
      if (saved && offset > 0) {
        options.bodyRead?.();
        const edge = Buffer.alloc(Math.min(64, offset));
        await file.read(edge, 0, edge.length, offset - edge.length);
        bytesLeft -= edge.length;
        if (hash(edge) !== saved.edge) {
          offset = 0;
          dropping = 0;
        }
      }
      const bytes = Buffer.alloc(Math.max(0, Math.min(bytesLeft, stat.size - offset)));
      if (!bytes.length) {
        backlog ||= offset < stat.size;
        continue;
      }
      options.bodyRead?.();
      const { bytesRead } = await file.read(bytes, 0, bytes.length, offset);
      bytesLeft -= bytesRead;
      const chunk = bytes.subarray(0, bytesRead);
      let consumed = 0,
        stalled = 0,
        invalid = saved?.invalid ?? 0;
      const records: NonNullable<ReturnType<typeof parseCompact>>[] = [];
      while (consumed < chunk.length && rowsLeft > 0) {
        const end = chunk.indexOf(10, consumed);
        if (end < 0) {
          if (dropping || chunk.length - consumed >= MAX_LINE) {
            if (!dropping) invalid++;
            dropping = 1;
            consumed = chunk.length;
          } else if (offset + bytesRead === stat.size) stalled = 1;
          break;
        }
        rowsLeft--;
        if (dropping) dropping = 0;
        else if (end - consumed > MAX_LINE) invalid++;
        else {
          const parsed = parseCompact(
            chunk.subarray(consumed, end).toString("utf8"),
            name.startsWith("confirmations"),
          );
          if (parsed) records.push(parsed);
          else invalid++;
        }
        consumed = end + 1;
      }
      options.signal.throwIfAborted();
      const next = offset + consumed;
      const edge = Buffer.alloc(Math.min(64, next));
      if (edge.length) {
        options.bodyRead?.();
        await file.read(edge, 0, edge.length, next - edge.length);
      }
      const after = await file.stat();
      if (
        after.ino !== stat.ino ||
        after.size < stat.size ||
        (after.size === stat.size &&
          (after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs))
      ) {
        backlog = true;
        continue;
      }
      // Progress and all accepted projections commit together. No partial source bodies persist.
      db.transaction(() => {
        for (const record of records) {
          if (
            "workspace" in record &&
            options.recoveryFloor &&
            (record.provenance !== "observed" || record.occurredAt < options.recoveryFloor)
          )
            continue;
          projectCompactRecord(db, record);
        }
        if (invalid > (saved?.invalid ?? 0)) {
          recordSourceUncertainty(
            db,
            `source-${hash(Buffer.from(`${name}:${identity}:${invalid}`))}`,
            options.now ?? Date.now(),
          );
        }
        db.prepare("INSERT OR REPLACE INTO collector_sources VALUES (?,?,?,?,?,?,?,?,?)").run(
          name,
          identity,
          stat.size,
          stamp,
          next,
          dropping,
          hash(edge),
          invalid,
          stalled,
        );
      });
      backlog ||= next < stat.size || dropping === 1;
    } finally {
      await file.close();
    }
  }
  if (!options.legacyOnly) recordReconciliation(db, backlog);
  return backlog;
}
