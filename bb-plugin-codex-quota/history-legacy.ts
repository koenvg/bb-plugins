import { constants, type BigIntStats } from "node:fs";
import { lstat, open, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { HistoryDatabase } from "./history-storage.js";
import { atomicWrite, publishControl, readControlRecord } from "./collector-control.js";
import {
  legacyConfirmationSchema,
  type LegacyConfirmation,
  type HistoryReadiness,
} from "./history-contract.js";
import { reconcileCollector, type IngestOptions } from "./history-ingest.js";
import { parseCompact } from "./usage-record.js";

const RECEIPT = "legacy-retirement-v1.json",
  LOCK = "legacy-retirement-v1.lock";
const MAX_LINE = 64 * 1024;
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const manifestSchema = z
  .object({ identity: z.string().max(128), stamp: z.string().max(128), size: count })
  .strict();
type Manifest = z.infer<typeof manifestSchema>;
const inputSchema = z
  .object({ manifest: manifestSchema.nullable(), offset: count, dropping: z.boolean() })
  .strict();
const groupSchema = z
  .object({
    kind: z.enum(["events", "confirmations"]),
    inputs: z.tuple([inputSchema, inputSchema]),
    output: count,
    outputIdentity: z.string().max(128).nullable(),
    published: manifestSchema.nullable(),
    phase: z.enum(["copy", "replace", "cleanup", "done"]),
  })
  .strict();
const receiptSchema = z
  .object({
    version: z.literal(1),
    token: z.uuid(),
    revision: z.uuid(),
    created: z.iso.datetime(),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    cutoff: z.iso.datetime(),
    mode: z.enum(["operator", "maintenance"]),
    phase: z.enum(["awaiting-confirmation", "ingesting", "retaining", "complete", "blocked"]),
    groups: z.tuple([groupSchema, groupSchema]),
    reason: z.enum(["source-changed", "source-incomplete", "control-changed"]).optional(),
  })
  .strict()
  .refine((r) => r.groups[0].kind === "events" && r.groups[1].kind === "confirmations");
type Receipt = z.infer<typeof receiptSchema>;
type Group = Receipt["groups"][number];
type Status = NonNullable<NonNullable<HistoryReadiness["health"]>["legacyRetirement"]>;
export type LegacyOptions = IngestOptions & { checkpoint?: (step: string) => void };
const absent = (e: unknown) => !!e && typeof e === "object" && "code" in e && e.code === "ENOENT";
const names = (kind: Group["kind"]) => ({
  legacy: `${kind}-v1.jsonl`,
  retained: `${kind}-legacy-retained-v1.jsonl`,
  spool: `.${kind}-legacy-retained-v1.tmp`,
});
const same = (a: Manifest | null, b: Manifest | null) =>
  a?.identity === b?.identity && a?.stamp === b?.stamp && a?.size === b?.size;
const sameOutput = (a: Manifest | null, b: Manifest | null) =>
  a?.identity === b?.identity &&
  a?.size === b?.size &&
  a?.stamp.split(":")[0] === b?.stamp.split(":")[0];
function describe(stat: BigIntStats): Manifest {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n)
    throw Error("Legacy retirement unavailable");
  return manifestSchema.parse({
    identity: `${stat.dev}:${stat.ino}`,
    stamp: `${stat.mtimeNs}:${stat.ctimeNs}`,
    size: Number(stat.size),
  });
}
async function manifest(path: string): Promise<Manifest | null> {
  try {
    return describe(await lstat(path, { bigint: true }));
  } catch (e) {
    if (absent(e)) return null;
    throw e;
  }
}
async function json(path: string, maximum = 32768) {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (e) {
    if (absent(e)) return null;
    throw e;
  }
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > maximum)
      throw Error("Legacy retirement unavailable");
    const bytes = Buffer.alloc(maximum + 1),
      result = await file.read(bytes, 0, bytes.length, 0);
    if (result.bytesRead > maximum) throw Error("Legacy retirement unavailable");
    return JSON.parse(bytes.subarray(0, result.bytesRead).toString("utf8"));
  } finally {
    await file.close();
  }
}
async function syncDirectory(directory: string) {
  const file = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}
async function save(directory: string, receipt: Receipt, signal: AbortSignal) {
  await atomicWrite(join(directory, RECEIPT), JSON.stringify(receiptSchema.parse(receipt)), signal);
  await syncDirectory(directory);
}
/** One host-owned operation at a time. Only an exited recorded maintenance PID permits stale-lock recovery. */
async function lock(directory: string) {
  const path = join(directory, LOCK);
  try {
    const file = await open(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(JSON.stringify({ pid: process.pid }));
      await file.sync();
    } finally {
      await file.close();
    }
  } catch (e) {
    if (!e || typeof e !== "object" || !("code" in e) || e.code !== "EEXIST") throw e;
    const before = await manifest(path),
      value = z
        .object({ pid: z.number().int().positive() })
        .strict()
        .parse(await json(path, 128));
    try {
      process.kill(value.pid, 0);
      throw Error("Legacy retirement busy");
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ESRCH")
        throw error;
    }
    if (!same(before, await manifest(path))) throw Error("Legacy retirement busy");
    await unlink(path);
    return lock(directory);
  }
  const owned = await manifest(path);
  return async () => {
    if (same(owned, await manifest(path))) await unlink(path);
  };
}
function pending(db: HistoryDatabase, value: boolean) {
  db.prepare("INSERT OR REPLACE INTO history_legacy_pending VALUES (1,?)").run(value ? 1 : 0);
}
function publicStatus(receipt: Receipt): Status {
  return receipt.phase === "awaiting-confirmation"
    ? {
        phase: receipt.phase,
        token: receipt.token,
        expiresAt: new Date(Date.parse(receipt.created) + 15 * 60000).toISOString(),
        reason: "confirmation-required",
      }
    : { phase: receipt.phase, ...(receipt.reason ? { reason: receipt.reason } : {}) };
}
async function begin(
  db: HistoryDatabase,
  directory: string,
  now: number,
  revision: string,
  mode: Receipt["mode"],
  previous?: Receipt | null,
): Promise<Receipt> {
  const cutoff = (
    db.prepare("SELECT detail_cutoff FROM history_retention WHERE id=1").get() as {
      detail_cutoff: string;
    }
  ).detail_cutoff;
  const groups: Group[] = [];
  for (const kind of ["events", "confirmations"] as const) {
    const paths = names(kind),
      inputs = [];
    for (const name of [paths.retained, paths.legacy])
      inputs.push({ manifest: await manifest(join(directory, name)), offset: 0, dropping: false });
    const staged = await manifest(join(directory, paths.spool));
    const owned = previous?.groups.find((group) => group.kind === kind)?.outputIdentity;
    if (staged && staged.size && staged.identity !== owned)
      throw Error("Legacy retirement unavailable");
    groups.push({
      kind,
      inputs: inputs as Group["inputs"],
      output: 0,
      outputIdentity: staged?.identity ?? null,
      published: null,
      phase: "copy",
    });
  }
  return receiptSchema.parse({
    version: 1,
    token: randomUUID(),
    revision,
    created: new Date(now).toISOString(),
    day: new Date(now).toISOString().slice(0, 10),
    cutoff,
    mode,
    phase: mode === "operator" ? "awaiting-confirmation" : "ingesting",
    groups,
  });
}
async function validSources(directory: string, receipt: Receipt) {
  for (const group of receipt.groups) {
    const paths = names(group.kind),
      retained = await manifest(join(directory, paths.retained));
    const published =
      group.published &&
      (group.phase === "replace"
        ? sameOutput(retained, group.published)
        : same(retained, group.published));
    if (group.phase === "copy" && !same(retained, group.inputs[0].manifest)) return false;
    if (group.phase === "replace" && !published && !same(retained, group.inputs[0].manifest))
      return false;
    if ((group.phase === "cleanup" || group.phase === "done") && !published) return false;
    const original = await manifest(join(directory, paths.legacy));
    if (
      group.phase === "done"
        ? original !== null
        : group.phase === "cleanup" && original === null
          ? false
          : !same(original, group.inputs[1].manifest)
    )
      return false;
  }
  return true;
}
async function needsReconciliation(db: HistoryDatabase, directory: string) {
  for (const kind of ["events", "confirmations"] as const) {
    const paths = names(kind);
    for (const name of [paths.retained, paths.legacy]) {
      const source = await manifest(join(directory, name));
      if (!source?.size) continue;
      const indexed = db
        .prepare("SELECT identity,size,offset FROM collector_sources WHERE name=?")
        .get(name) as { identity: string; size: number; offset: number } | undefined;
      if (
        !indexed ||
        indexed.identity !== source.identity ||
        indexed.size !== source.size ||
        indexed.offset !== source.size
      )
        return true;
    }
  }
  return false;
}

function keep(db: HistoryDatabase, line: string, kind: Group["kind"], cutoff: string) {
  const record = parseCompact(line, kind === "confirmations");
  if (!record) return false; // Ingestion already committed scoped uncertainty for invalid records.
  if ("workspace" in record) return new Date(record.occurredAt).toISOString() >= cutoff;
  return !!db
    .prepare("SELECT event_id FROM usage_compact WHERE event_id=? AND occurred_at>=? LIMIT 1")
    .get(record.eventId, cutoff);
}
async function copy(
  db: HistoryDatabase,
  directory: string,
  receipt: Receipt,
  group: Group,
  options: LegacyOptions,
) {
  const paths = names(group.kind),
    spool = join(directory, paths.spool);
  const output = await open(
    spool,
    constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    const state = describe(await output.stat({ bigint: true }));
    if (
      group.outputIdentity
        ? state.identity !== group.outputIdentity || state.size < group.output
        : state.size !== 0
    )
      throw Error("Legacy retirement unavailable");
    if (!group.outputIdentity) {
      group.outputIdentity = state.identity;
      await save(directory, receipt, options.signal);
    }
    await output.truncate(group.output); // Remove only uncommitted bytes in this private, fenced spool.
    let rows = Math.max(1, Math.min(options.rows ?? 500, 500)),
      bytesLeft = 128 * 1024;
    for (let index = 0; index < 2 && rows > 0 && bytesLeft > 0; index++) {
      const input = group.inputs[index],
        boundary = input.manifest;
      if (!boundary || input.offset === boundary.size) continue;
      const file = await open(
        join(directory, index === 0 ? paths.retained : paths.legacy),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        if (!same(describe(await file.stat({ bigint: true })), boundary))
          throw Error("Legacy retirement source changed");
        const chunk = Buffer.alloc(Math.min(bytesLeft, boundary.size - input.offset));
        const { bytesRead } = await file.read(chunk, 0, chunk.length, input.offset);
        bytesLeft -= bytesRead;
        let consumed = 0;
        while (consumed < bytesRead && rows > 0) {
          options.signal.throwIfAborted();
          const end = chunk.indexOf(10, consumed);
          if (end < 0) {
            if (input.dropping || bytesRead - consumed > MAX_LINE) {
              input.dropping = true;
              consumed = bytesRead;
            } else if (input.offset + bytesRead === boundary.size)
              throw Error("Legacy retirement source incomplete");
            break;
          }
          rows--;
          if (
            !input.dropping &&
            end - consumed <= MAX_LINE &&
            keep(db, chunk.subarray(consumed, end).toString("utf8"), group.kind, receipt.cutoff)
          ) {
            const line = chunk.subarray(consumed, end + 1);
            let written = 0;
            while (written < line.length) {
              const result = await output.write(
                line,
                written,
                line.length - written,
                group.output + written,
              );
              if (!result.bytesWritten) throw Error("Legacy retirement unavailable");
              written += result.bytesWritten;
            }
            group.output += line.length;
          }
          input.dropping = false;
          consumed = end + 1;
        }
        if (!same(describe(await file.stat({ bigint: true })), boundary))
          throw Error("Legacy retirement source changed");
        input.offset += consumed;
      } finally {
        await file.close();
      }
    }
    await output.sync();
    options.checkpoint?.("output-written");
    if (group.inputs.every((input) => !input.manifest || input.offset === input.manifest.size)) {
      group.published = describe(await output.stat({ bigint: true }));
      group.phase = "replace";
    }
    await save(directory, receipt, options.signal);
  } finally {
    await output.close();
  }
}
async function validateControl(directory: string, receipt: Receipt) {
  const control = await readControlRecord(directory);
  if (
    !control ||
    control.protocol !== 2 ||
    (receipt.mode === "operator" && (control.enabled || control.revision !== receipt.revision))
  ) {
    throw Error("Legacy retirement control changed");
  }
}

async function publish(
  db: HistoryDatabase,
  directory: string,
  receipt: Receipt,
  group: Group,
  options: LegacyOptions,
) {
  const paths = names(group.kind),
    target = join(directory, paths.retained),
    spool = join(directory, paths.spool);
  if (group.phase === "replace") {
    const staged = await manifest(spool);
    if (staged) {
      if (!same(staged, group.published)) throw Error("Legacy retirement unavailable");
      await validateControl(directory, receipt);
      options.signal.throwIfAborted();
      await rename(spool, target);
      await syncDirectory(directory);
    } else if (!sameOutput(await manifest(target), group.published))
      throw Error("Legacy retirement unavailable");
    const published = await manifest(target);
    if (!published) throw Error("Legacy retirement source changed");
    group.published = published;
    group.phase = "cleanup";
    await save(directory, receipt, options.signal);
    options.checkpoint?.("published");
  }
  if (group.phase === "cleanup") {
    if (!group.published || !same(await manifest(target), group.published))
      throw Error("Legacy retirement source changed");
    const original = await manifest(join(directory, paths.legacy));
    if (original) {
      if (!same(original, group.inputs[1].manifest))
        throw Error("Legacy retirement source changed");
      await validateControl(directory, receipt);
      options.signal.throwIfAborted();
      await unlink(join(directory, paths.legacy));
      await syncDirectory(directory);
      options.checkpoint?.("source-removed");
    }
    db.transaction(() => {
      for (const name of [paths.legacy, paths.retained]) {
        const progress = db
          .prepare("SELECT invalid FROM collector_sources WHERE name=?")
          .get(name) as { invalid: number } | undefined;
        if (progress)
          db.prepare(
            "UPDATE history_counters SET invalid_records=invalid_records+? WHERE id=1",
          ).run(progress.invalid);
        db.prepare("DELETE FROM collector_sources WHERE name=?").run(name);
      }
    });
    group.phase = "done";
    await save(directory, receipt, options.signal);
  }
}
/** Consented legacy retirement and automatic expiry of its fenced, immutable outputs only. */
export async function maintainLegacy(
  db: HistoryDatabase,
  directory: string,
  now: number,
  options: LegacyOptions,
  action?: "prepare-legacy" | "retire-legacy",
  confirmation?: LegacyConfirmation,
): Promise<{ status?: Status; failed: boolean }> {
  let release: (() => Promise<void>) | undefined,
    receipt: Receipt | null = null;
  options.signal.throwIfAborted();
  try {
    release = await lock(directory);
    receipt = receiptSchema.nullable().parse(await json(join(directory, RECEIPT)));
    const control = await readControlRecord(directory);
    if (!control) throw Error("Legacy retirement unavailable");
    if (action === "prepare-legacy") {
      if (control.enabled) {
        pending(db, true);
        return { status: { phase: "required", reason: "control-changed" }, failed: true };
      }
      // Snapshot safe fixed files before publishing the fence; no path or activity guesses.
      const initial = await begin(db, directory, now, randomUUID(), "operator", receipt);
      const fenced = await publishControl(directory, false, options.signal);
      initial.revision = fenced.revision;
      receipt = initial;
      pending(db, true);
      await save(directory, receipt, options.signal);
    }
    if (!receipt) {
      const legacy =
        (await manifest(join(directory, "events-v1.jsonl"))) ||
        (await manifest(join(directory, "confirmations-v1.jsonl")));
      pending(db, !!legacy);
      return {
        status: legacy ? { phase: "required", reason: "confirmation-required" } : undefined,
        failed: action === "retire-legacy",
      };
    }
    const fenced = control.protocol === 2;
    if (
      !fenced ||
      (receipt.mode === "operator" &&
        receipt.phase !== "complete" &&
        (control.enabled || control.revision !== receipt.revision))
    ) {
      // Prepare just published its own revision; the snapshot read above is intentionally stale.
      if (action !== "prepare-legacy") {
        receipt.phase = "blocked";
        receipt.reason = "control-changed";
        pending(db, true);
        await save(directory, receipt, options.signal);
        return { status: publicStatus(receipt), failed: true };
      }
    }
    if (!(await validSources(directory, receipt))) {
      receipt.phase = "blocked";
      receipt.reason = "source-changed";
      pending(db, true);
      await save(directory, receipt, options.signal);
      return { status: publicStatus(receipt), failed: true };
    }
    if (action === "retire-legacy") {
      const parsed = legacyConfirmationSchema.safeParse(confirmation);
      if (
        !parsed.success ||
        parsed.data.token !== receipt.token ||
        receipt.phase !== "awaiting-confirmation" ||
        now < Date.parse(receipt.created) ||
        now > Date.parse(receipt.created) + 15 * 60000
      ) {
        return {
          status: { ...publicStatus(receipt), reason: "confirmation-invalid" },
          failed: true,
        };
      }
      receipt.phase = "ingesting";
      await save(directory, receipt, options.signal);
    }
    if (receipt.phase === "awaiting-confirmation") {
      pending(db, true);
      return { status: publicStatus(receipt), failed: false };
    }
    if (receipt.phase === "blocked") {
      pending(db, true);
      return { status: publicStatus(receipt), failed: true };
    }
    const day = new Date(now).toISOString().slice(0, 10);
    if (receipt.phase === "complete" && day > receipt.day) {
      if (control.protocol !== 2) throw Error("Legacy retirement unavailable");
      receipt = await begin(db, directory, now, control.revision, "maintenance");
      await save(directory, receipt, options.signal);
    }
    pending(db, receipt.phase !== "complete");
    if (
      receipt.phase === "ingesting" ||
      (receipt.phase === "retaining" && (await needsReconciliation(db, directory)))
    ) {
      const backlog = await reconcileCollector(db, directory, {
        ...options,
        rows: options.rows ?? 500,
        now,
        legacyOnly: true,
      });
      if (!(await validSources(directory, receipt)))
        throw Error("Legacy retirement source changed");
      const incomplete = db
        .prepare(
          "SELECT name FROM collector_sources WHERE name IN ('events-v1.jsonl','confirmations-v1.jsonl','events-legacy-retained-v1.jsonl','confirmations-legacy-retained-v1.jsonl') AND (stalled=1 OR (dropping=1 AND offset=size)) LIMIT 1",
        )
        .get();
      if (incomplete) throw Error("Legacy retirement source incomplete");
      if (backlog) return { status: publicStatus(receipt), failed: false };
      if (receipt.phase === "ingesting") {
        receipt.phase = "retaining";
        await save(directory, receipt, options.signal);
      }
    }
    if (receipt.phase === "retaining") {
      const group = receipt.groups.find((value) => value.phase !== "done");
      if (group) {
        if (group.phase === "copy") await copy(db, directory, receipt, group, options);
        if (!(await validSources(directory, receipt)))
          throw Error("Legacy retirement source changed");
        if (group.phase === "replace" || group.phase === "cleanup")
          await publish(db, directory, receipt, group, options);
      }
      if (receipt.groups.every((value) => value.phase === "done")) {
        receipt.phase = "complete";
        await save(directory, receipt, options.signal);
      }
    }
    const more = receipt.phase !== "complete" || day > receipt.day;
    pending(db, more);
    return {
      status: more && receipt.phase === "complete" ? { phase: "retaining" } : publicStatus(receipt),
      failed: false,
    };
  } catch (error) {
    pending(db, true);
    if (
      receipt &&
      error instanceof Error &&
      [
        "Legacy retirement source changed",
        "Legacy retirement source incomplete",
        "Legacy retirement control changed",
      ].includes(error.message)
    ) {
      receipt.phase = "blocked";
      receipt.reason = error.message.includes("control")
        ? "control-changed"
        : error.message.endsWith("incomplete")
          ? "source-incomplete"
          : "source-changed";
      await save(directory, receipt, options.signal).catch(() => {});
      return { status: publicStatus(receipt), failed: true };
    }
    return { status: { phase: "blocked", reason: "work-incomplete" }, failed: true };
  } finally {
    await release?.();
  }
}
