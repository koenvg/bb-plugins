import { appendFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import { createQuotaHostEntry } from "../plugin/host.js";
import { createHostHistory } from "./history-host.js";
import { openHistoryDatabase } from "./storage/history-storage.js";
import {
  initializeHistory,
  projectCompactRecord,
  recordPause,
} from "./storage/history-projection.js";
import { maintainHistory } from "./storage/history-retention.js";
import { usageRecordSchema } from "./collection/usage-record.js";
import type { CalendarQuery } from "./calendar/calendar-contract.js";
const heldRead = vi.hoisted(() => ({
  gate: null as null | { entered: () => void; wait: Promise<void> },
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...fs,
    open: async (...args: Parameters<typeof fs.open>) => {
      const file = await fs.open(...args);
      const gate = heldRead.gate;
      if (gate && String(args[0]).endsWith("events-v1-2026-10-01.jsonl")) {
        heldRead.gate = null;
        const read = file.read.bind(file);
        vi.spyOn(file, "read").mockImplementationOnce(async (...input) => {
          gate.entered();
          await gate.wait;
          return read(...input);
        });
      }
      return file;
    },
  };
});

const roots: string[] = [];
const now = Date.parse("2026-10-01T12:00:00Z");
const query: CalendarQuery = {
  startDate: "2026-09-02",
  timezone: "UTC",
  group: "workspace",
  scope: { kind: "host" },
};
const identities = { hostId: "host_a", generation: 1, offset: 0, total: 0, rows: [] };
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
function record(n: number, capturedCost: number | null = 0.125) {
  return usageRecordSchema.parse({
    version: 1,
    eventId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    provenance: "observed",
    occurredAt: "2026-10-01T10:00:00.000Z",
    sessionId: "synthetic",
    workspace: "/original",
    providerSessionKey: null,
    claimedThreadId: null,
    provider: "openai-codex",
    model: "synthetic",
    inputTokens: 1,
    outputTokens: 2,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 3,
    capturedCost,
  });
}
it("rejects a legacy identity layout before accepting metadata or ingesting recorded events", async () => {
  const f = await fixture();
  await f.append(1);
  const db = (await openHistoryDatabase(f.path))!;
  db.exec("DROP TABLE identity_uncertain");
  db.close();
  const before = await readFile(f.path);
  expect(await f.prepare()).toEqual({ state: "unavailable", reason: "storage-incompatible" });
  expect(await readFile(f.path)).toEqual(before);
  expect(f.bodyRead).not.toHaveBeenCalled();
  expect(f.forbidden).not.toHaveBeenCalled();
  f.history.dispose();
});

async function fixture(collector = true) {
  const dataDir = await mkdtemp(join(tmpdir(), "graph-ingest-"));
  roots.push(dataDir);
  const directory = join(dataDir, "history");
  await mkdir(directory);
  const path = join(directory, "usage-v1.sqlite");
  const db = (await openHistoryDatabase(path))!;
  initializeHistory(db, new Date(now).toISOString(), collector);
  maintainHistory(db, now);
  db.close();
  const controlPath = join(directory, "collector-control-v1.json");
  if (collector)
    await writeFile(
      controlPath,
      JSON.stringify({
        protocol: 2,
        enabled: false,
        revision: "00000000-0000-4000-8000-000000000000",
      }),
    );
  const bodyRead = vi.fn();
  const forbidden = vi.fn(async () => {
    throw Error("No management, collector assets, or account requests allowed");
  });
  const history = createHostHistory({ now: () => now, bodyRead, collector: forbidden });
  const harness = experimental_createHostEntryHarness(
    createQuotaHostEntry({ history, auth: forbidden, read: forbidden }),
    { experimental_paths: { dataDir, tempDir: join(dataDir, "temp") } },
  );
  return {
    directory,
    path,
    controlPath,
    bodyRead,
    forbidden,
    history,
    harness,
    async read() {
      const value = await harness.experimental_call("calendarReport", query);
      if (value.state === "unavailable") throw Error(value.reason);
      return value;
    },
    prepare: () => harness.experimental_call("reportPreparation", { identities }),
    async append(n: number, cost: number | null = 0.125) {
      const usage = record(n, cost);
      await appendFile(join(directory, "events-v1-2026-10-01.jsonl"), JSON.stringify(usage) + "\n");
      await appendFile(
        join(directory, "confirmations-v1-2026-10-01.jsonl"),
        JSON.stringify({
          version: 1,
          eventId: usage.eventId,
          sessionId: usage.sessionId,
          entryId: `entry-${n}`,
        }) + "\n",
      );
    },
  };
}

it("loads events appended after a graph read through preparation, without management", async () => {
  const f = await fixture();
  try {
    expect((await f.read()).summary.totalTokens).toBe(0);
    const control = await readFile(f.controlPath, "utf8");
    await f.append(1);
    // Calendar reads alone must not ingest new collector data.
    expect((await f.read()).summary.totalTokens).toBe(0);
    expect(f.bodyRead).not.toHaveBeenCalled();
    expect(await f.prepare()).toMatchObject({ state: "available" });
    const view = await f.read();
    expect(view.summary.totalTokens).toBe(3);
    expect(view.summary.money).toMatchObject({ capturedCost: 0.125 });
    expect(view.days.at(-1)).toMatchObject({ date: "2026-10-01", totalTokens: 3 });
    const reads = f.bodyRead.mock.calls.length;
    await f.prepare();
    expect(f.bodyRead).toHaveBeenCalledTimes(reads);
    expect((await f.read()).summary).toEqual(view.summary);
    expect(await readFile(f.controlPath, "utf8")).toBe(control);
    expect(f.forbidden).not.toHaveBeenCalled();
  } finally {
    await f.harness.experimental_dispose();
  }
});

it.each([false, true])(
  "keeps storage and the queue owned through a held collector read, cancel=%s",
  async (cancel) => {
    const f = await fixture();
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const controller = new AbortController();
    try {
      await f.append(1);
      heldRead.gate = { entered, wait };
      const preparing = f.history.prepare!({
        dataDir: join(f.directory, ".."),
        signal: controller.signal,
        identities,
      });
      await started;
      if (cancel) {
        controller.abort();
        expect(await preparing).toEqual({ state: "unavailable", reason: "selection-changed" });
      }
      let readFinished = false;
      const queued = f.read().then((value) => {
        readFinished = true;
        return value;
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(readFinished).toBe(false);
      release();
      if (!cancel) expect(await preparing).toMatchObject({ state: "available" });
      expect((await queued).summary.totalTokens).toBe(cancel ? 0 : 3);
    } finally {
      release();
      heldRead.gate = null;
      await f.harness.experimental_dispose();
    }
  },
);

it("advances durable multi-batch ingestion progress with identity already complete and survives replay", async () => {
  const f = await fixture();
  try {
    await f.prepare();
    const records = Array.from({ length: 501 }, (_, n) => record(n + 1));
    await writeFile(
      join(f.directory, "events-v1-2026-10-01.jsonl"),
      records.map((r) => JSON.stringify(r)).join("\n") + "\n",
    );
    await writeFile(
      join(f.directory, "confirmations-v1-2026-10-01.jsonl"),
      records
        .map((r, n) =>
          JSON.stringify({
            version: 1,
            eventId: r.eventId,
            sessionId: r.sessionId,
            entryId: `entry-${n + 1}`,
          }),
        )
        .join("\n") + "\n",
    );
    const progress = new Set<string>();
    let rounds = 0;
    for (;;) {
      const result = await f.prepare();
      if (result.state !== "available") throw Error(result.reason);
      progress.add(result.progress);
      rounds++;
      if (!result.ingestionPending && !result.attribution.backlog) break;
      expect(rounds).toBeLessThan(10);
      expect(result.attribution.discovery).toBe("complete");
    }
    expect(rounds).toBe(3);
    expect(progress.size).toBe(rounds);
    const view = await f.read();
    expect(view.summary.totalTokens).toBe(1503);
    expect(view.summary.money.capturedCost).toBe(62.625);
    // Reopen all public host storage connections and replay an accepted identity.
    await f.append(1);
    await f.prepare();
    expect((await f.read()).summary).toEqual(view.summary);
    const reads = f.bodyRead.mock.calls.length;
    await f.prepare();
    expect(f.bodyRead).toHaveBeenCalledTimes(reads);
    expect(f.forbidden).not.toHaveBeenCalled();
  } finally {
    await f.harness.experimental_dispose();
  }
});

it("drains paused logs without removing pause coverage and keeps current-day usage unpriced", async () => {
  const f = await fixture();
  try {
    const db = (await openHistoryDatabase(f.path))!;
    recordPause(db, "2026-10-01T00:00:00.000Z");
    db.close();
    const control = await readFile(f.controlPath);
    await f.append(1, null);
    expect(await f.prepare()).toMatchObject({ state: "available", ingestionPending: false });
    const view = await f.read();
    expect(view.summary.totalTokens).toBe(3);
    expect(view.summary.money).toMatchObject({ state: "unavailable", capturedCost: null });
    expect(view.days.at(-1)?.coverage).toMatchObject({
      state: "incomplete",
      pauses: 1,
      zero: false,
    });
    expect(view.days[0].coverage.zero).toBe(false);
    expect(await readFile(f.controlPath)).toEqual(control);
    expect(f.forbidden).not.toHaveBeenCalled();
  } finally {
    await f.harness.experimental_dispose();
  }
});

it("prepares retained import-only values without creating control or reading collector bodies", async () => {
  const f = await fixture(false);
  try {
    const db = (await openHistoryDatabase(f.path))!;
    projectCompactRecord(db, { ...record(1), provenance: "imported" });
    db.close();
    const before = await f.read();
    expect(before.summary.totalTokens).toBe(3);
    expect(await f.prepare()).toMatchObject({ state: "available", ingestionPending: false });
    expect((await f.read()).summary).toEqual(before.summary);
    expect(f.bodyRead).not.toHaveBeenCalled();
    await expect(readFile(f.controlPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(f.forbidden).not.toHaveBeenCalled();
  } finally {
    await f.harness.experimental_dispose();
  }
});

it.each(["missing", "version", "backfill"])(
  "stops on %s storage without creating, migrating, or backfilling it",
  async (mode) => {
    const f = await fixture();
    try {
      if (mode === "missing") await rm(f.path);
      else {
        const db = (await openHistoryDatabase(f.path))!;
        db.exec(
          mode === "version"
            ? "PRAGMA user_version=99"
            : "UPDATE history_retention SET backfill_done=0 WHERE id=1",
        );
        db.close();
      }
      await f.append(1);
      expect(await f.prepare()).toMatchObject({
        state: "unavailable",
        reason:
          mode === "missing"
            ? "not-configured"
            : mode === "version"
              ? "storage-incompatible"
              : "storage-unavailable",
      });
      expect(f.bodyRead).not.toHaveBeenCalled();
      if (mode === "missing")
        await expect(readFile(f.path)).rejects.toMatchObject({ code: "ENOENT" });
      else {
        const db = (await openHistoryDatabase(f.path))!;
        expect(
          (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
        ).toBe(mode === "version" ? 99 : 4);
        if (mode === "backfill")
          expect(db.prepare("SELECT backfill_done FROM history_retention").get()).toEqual({
            backfill_done: 0,
          });
        expect(db.prepare("SELECT event_id FROM usage_compact").all()).toEqual([]);
        db.close();
      }
      expect(f.forbidden).not.toHaveBeenCalled();
    } finally {
      await f.harness.experimental_dispose();
    }
  },
);

it("leaves an incomplete source pending without spinning or losing invalid-data coverage", async () => {
  const f = await fixture();
  try {
    const source = join(f.directory, "events-v1-2026-10-01.jsonl");
    await writeFile(source, "invalid\n" + JSON.stringify(record(1)));
    expect(await f.prepare()).toMatchObject({ state: "available", ingestionPending: true });
    const reads = f.bodyRead.mock.calls.length;
    const progress = new Set<string>();
    for (let n = 0; n < 4; n++) {
      const result = await f.prepare();
      if (result.state !== "available") throw Error(result.reason);
      expect(result.ingestionPending).toBe(true);
      progress.add(result.progress);
    }
    expect(progress.size).toBe(1);
    expect(f.bodyRead).toHaveBeenCalledTimes(reads);
    await appendFile(source, "\n");
    expect(await f.prepare()).toMatchObject({ state: "available", ingestionPending: false });
    const view = await f.read();
    expect(view.summary.totalTokens).toBe(3);
    expect(view.days.at(-1)?.coverage).toMatchObject({
      state: "incomplete",
      uncertain: true,
      zero: false,
    });
  } finally {
    await f.harness.experimental_dispose();
  }
});

it("accepts confirmation-before-event ordering while preserving exclusions and logical expiry", async () => {
  const f = await fixture();
  try {
    const usage = record(1);
    await writeFile(
      join(f.directory, "confirmations-v1-2026-10-01.jsonl"),
      JSON.stringify({
        version: 1,
        eventId: usage.eventId,
        sessionId: usage.sessionId,
        entryId: "entry-1",
      }) + "\n",
    );
    await f.prepare();
    expect((await f.read()).summary.totalTokens).toBe(0);
    await appendFile(join(f.directory, "events-v1-2026-10-01.jsonl"), JSON.stringify(usage) + "\n");
    await f.prepare();
    expect((await f.read()).summary.totalTokens).toBe(3);
    const db = (await openHistoryDatabase(f.path))!;
    // Keep a recorded exclusion and replay tombstone. Preparation must not repair them.
    db.prepare("UPDATE usage_compact SET accepted=0 WHERE event_id=?").run(usage.eventId);
    db.prepare("INSERT INTO usage_expired VALUES (?)").run(record(2).eventId);
    db.close();
    await f.append(1);
    await f.append(2);
    await appendFile(
      join(f.directory, "events-v1-2026-10-01.jsonl"),
      JSON.stringify({
        ...record(3),
        occurredAt: "2020-01-01T00:00:00.000Z",
      }) + "\n",
    );
    await f.prepare();
    const view = await f.read();
    expect(view.summary).toMatchObject({ totalTokens: 0, excludedTokens: 3 });
    const after = (await openHistoryDatabase(f.path))!;
    expect(after.prepare("SELECT event_id,accepted FROM usage_compact").all()).toEqual([
      { event_id: usage.eventId, accepted: 0 },
    ]);
    after.close();
    expect(f.forbidden).not.toHaveBeenCalled();
  } finally {
    await f.harness.experimental_dispose();
  }
});
