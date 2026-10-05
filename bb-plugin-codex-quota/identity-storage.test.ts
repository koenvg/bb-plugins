import { mkdtemp, rm, mkdir, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { openHistoryDatabase, type HistoryDatabase } from "./history-storage.js";
import { initializeHistory, projectCompactRecord, collectionView } from "./history-projection.js";
import { parseCompact } from "./usage-record.js";
import {
  acceptIdentityBatch,
  initializeIdentityStorage,
  reconcileIdentity,
  identityView,
  recordConfirmedRelationship,
  verifyWorkspaceAlias,
} from "./identity-storage.js";
import type { IdentityBatch } from "./identity-contract.js";
const fixtures: { root: string; db: HistoryDatabase }[] = [];
afterEach(async () => {
  for (const { root, db } of fixtures.splice(0)) {
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bbp19-identity-")),
    db = (await openHistoryDatabase(join(root, "usage.sqlite")))!;
  fixtures.push({ root, db });
  initializeHistory(db, "2026-10-01T00:00:00.000Z");
  initializeIdentityStorage(db);
  return { root, db };
}
const signal = () => new AbortController().signal;
function capture(db: HistoryDatabase, n: number, extra: Record<string, unknown> = {}) {
  const value = {
    version: 1,
    eventId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    provenance: "observed",
    occurredAt: "2026-10-01T00:00:00.000Z",
    sessionId: "pi-id",
    workspace: "/original",
    providerSessionKey: "provider-a.jsonl",
    claimedThreadId: null,
    provider: "openai-codex",
    model: "gpt-5",
    inputTokens: 1,
    outputTokens: 2,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 1,
    totalTokens: 3,
    capturedCost: 0.001,
    ...extra,
  };
  const record = parseCompact(JSON.stringify(value), false);
  if (record) db.transaction(() => projectCompactRecord(db, record));
  return value;
}
const batch = (
  generation = 1,
  rows: IdentityBatch["rows"] = [
    { threadId: "thr_a", providerIdentity: "provider-a", title: "A", state: "available" },
  ],
  hostId = "host_a",
): IdentityBatch => ({ hostId, generation, offset: 0, total: rows.length, rows });
it("counts multiple identities exactly once and keeps shared-path records workspace-only", async () => {
  const { db } = await fixture();
  capture(db, 1);
  capture(db, 2, { providerSessionKey: "provider-b.jsonl" });
  capture(db, 3, { providerSessionKey: null, claimedThreadId: "thr_a" });
  acceptIdentityBatch(
    db,
    batch(1, [
      ...batch().rows,
      { threadId: "thr_a", providerIdentity: "provider-b", title: "A", state: "available" },
      { threadId: "thr_b", providerIdentity: "provider-c", title: "B", state: "available" },
    ]),
  );
  reconcileIdentity(db, signal());
  expect(identityView(db)).toMatchObject({
    discovery: "complete",
    backlog: false,
    threads: [{ threadId: "thr_a", totalTokens: 6, events: 2 }],
  });
  expect(identityView(db).grades.slice(0, 2)).toMatchObject([
    { grade: "exact-thread", totalTokens: 6 },
    { grade: "workspace-only", totalTokens: 3 },
  ]);
  expect(collectionView(db, true, false).workspaces).toEqual([
    { workspace: "/original", totalTokens: 9, events: 3 },
  ]);
});
it("persists verified links across missing, archived, deleted metadata and workspace moves", async () => {
  const { db } = await fixture();
  const original = capture(db, 1);
  acceptIdentityBatch(db, batch());
  reconcileIdentity(db, signal());
  for (const [generation, rows, label, state] of [
    [2, [], "Unavailable thread thr_a", "missing"],
    [
      3,
      [{ ...batch().rows[0], title: null, state: "archived" }],
      "Archived thread thr_a",
      "archived",
    ],
    [4, [{ ...batch().rows[0], title: null, state: "deleted" }], "Deleted thread thr_a", "deleted"],
  ] as const) {
    acceptIdentityBatch(db, batch(generation, [...rows] as IdentityBatch["rows"]));
    reconcileIdentity(db, signal());
    expect(identityView(db).threads[0]).toMatchObject({ label, state, totalTokens: 3 });
  }
  expect(
    db.prepare("SELECT workspace,payload FROM usage_events WHERE event_id=?").get(original.eventId),
  ).toMatchObject({ workspace: "/original", payload: JSON.stringify(original) });
});
it("excludes conflicting evidence, untrusted claims and malformed captures", async () => {
  const { db } = await fixture();
  capture(db, 1);
  capture(db, 2, { claimedThreadId: "thr_b" });
  capture(db, 3, { claimedThreadId: "../bad" });
  acceptIdentityBatch(db, batch());
  reconcileIdentity(db, signal());
  expect(identityView(db).threads[0]?.events).toBe(1);
  acceptIdentityBatch(db, batch(2, [{ ...batch().rows[0]!, threadId: "thr_b" }]));
  reconcileIdentity(db, signal());
  expect(identityView(db).threads).toEqual([]);
  expect(identityView(db).grades.find((r) => r.grade === "ambiguous")?.events).toBe(2);
  expect(collectionView(db, true, false).workspaces[0]?.events).toBe(2);
});
it("requires all contiguous batches, rejects host changes and keeps incomplete evidence non-exact", async () => {
  const { db } = await fixture();
  capture(db, 1);
  const part = { ...batch(), total: 2 };
  acceptIdentityBatch(db, part);
  reconcileIdentity(db, signal());
  expect(identityView(db).threads).toEqual([]);
  expect(identityView(db).discovery).toBe("partial");
  expect(() => acceptIdentityBatch(db, { ...batch(), offset: 2, total: 3 })).toThrow();
  acceptIdentityBatch(db, {
    ...batch(),
    offset: 1,
    total: 2,
    rows: [{ ...batch().rows[0]!, providerIdentity: "provider-b" }],
  });
  reconcileIdentity(db, signal());
  expect(identityView(db).threads[0]?.totalTokens).toBe(3);
  expect(() => acceptIdentityBatch(db, batch(2, [], "host_b"))).toThrow();
});
it("retains different hosts, paths and confirmed filesystem aliases without changing ownership", async () => {
  const a = await fixture(),
    b = await fixture();
  capture(a.db, 1, { providerSessionKey: null });
  capture(b.db, 1);
  acceptIdentityBatch(a.db, batch());
  acceptIdentityBatch(b.db, batch(1, [{ ...batch().rows[0]!, threadId: "thr_b" }], "host_b"));
  const actual = join(a.root, "workspace"),
    alias = join(a.root, "alias");
  await mkdir(actual);
  await symlink(actual, alias);
  capture(a.db, 2, { workspace: alias, providerSessionKey: null, sessionId: "import-pi" });
  recordConfirmedRelationship(a.db, {
    sessionId: "import-pi",
    providerIdentity: "provider-a",
    workspace: actual,
  });
  expect(await verifyWorkspaceAlias(a.db, alias, actual, realpath)).toBe(true);
  expect(await verifyWorkspaceAlias(a.db, alias, actual + "-prefix", realpath)).toBe(false);
  reconcileIdentity(a.db, signal());
  reconcileIdentity(b.db, signal());
  expect(identityView(a.db).threads[0]?.threadId).toBe("thr_a");
  expect(identityView(b.db).threads[0]?.threadId).toBe("thr_b");
  expect(collectionView(a.db, true, false).workspaces.some((r) => r.workspace === alias)).toBe(
    true,
  );
});
it("keeps replay ownership and conflict exclusions and bounds unchanged reads", async () => {
  const { db } = await fixture();
  const first = capture(db, 9);
  for (const n of [9, 1]) {
    if (n === 1) capture(db, n);
    const confirmation = parseCompact(
      JSON.stringify({ version: 1, eventId: captureId(n), sessionId: "pi-id", entryId: "entry" }),
      true,
    )!;
    db.transaction(() => projectCompactRecord(db, confirmation));
  }
  acceptIdentityBatch(db, batch());
  reconcileIdentity(db, signal(), 1);
  expect(identityView(db).backlog).toBe(true);
  reconcileIdentity(db, signal(), 1);
  reconcileIdentity(db, signal(), 1);
  expect(identityView(db).threads[0]?.totalTokens).toBe(3);
  capture(db, 2, { totalTokens: 4 });
  db.transaction(() =>
    projectCompactRecord(
      db,
      parseCompact(
        JSON.stringify({ version: 1, eventId: captureId(2), sessionId: "pi-id", entryId: "entry" }),
        true,
      )!,
    ),
  );
  reconcileIdentity(db, signal());
  expect(identityView(db).threads).toEqual([]);
  expect(db.prepare("SELECT event_id FROM usage_entry_owners").get()).toMatchObject({
    event_id: first.eventId,
  });
  const queries: string[] = [];
  const spy = {
    ...db,
    prepare(sql: string) {
      queries.push(sql);
      return db.prepare(sql);
    },
  };
  reconcileIdentity(spy, signal());
  identityView(spy);
  expect(queries.some((q) => q.includes("usage_events"))).toBe(false);
  expect(queries.some((q) => q.includes("payload"))).toBe(false);
  const plan = JSON.stringify(
    db
      .prepare(
        "EXPLAIN QUERY PLAN SELECT * FROM identity_usage WHERE revision<? ORDER BY revision,event_id LIMIT ?",
      )
      .all(1, 200),
  );
  expect(plan).toContain("identity_pending");
});
function captureId(n: number) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}
it("rolls back canceled reconciliation and quarantines overlapping evidence batches", async () => {
  const { db } = await fixture();
  capture(db, 1);
  acceptIdentityBatch(db, batch());
  const controller = new AbortController();
  controller.abort();
  expect(() => reconcileIdentity(db, controller.signal)).toThrow();
  expect(identityView(db).threads).toEqual([]);
  expect(() =>
    acceptIdentityBatch(db, batch(1, [{ ...batch().rows[0]!, threadId: "thr_b" }])),
  ).toThrow();
});
it("does not hide a later conflicting import behind a candidate limit", async () => {
  const { db } = await fixture();
  capture(db, 1, { providerSessionKey: null });
  const rows: IdentityBatch["rows"] = [];
  for (let n = 0; n < 5; n++) {
    recordConfirmedRelationship(db, {
      sessionId: "pi-id",
      workspace: "/original",
      providerIdentity: `p${n}`,
    });
    rows.push({
      threadId: n === 4 ? "thr_b" : "thr_a",
      providerIdentity: `p${n}`,
      title: null,
      state: "available",
    });
  }
  acceptIdentityBatch(db, batch(1, rows));
  reconcileIdentity(db, signal());
  expect(identityView(db).threads).toEqual([]);
  expect(identityView(db).grades.find((r) => r.grade === "ambiguous")?.events).toBe(1);
});
it("keeps durable evidence and scalar identity after the detail payload is removed", async () => {
  const { db, root } = await fixture();
  capture(db, 1);
  acceptIdentityBatch(db, batch());
  reconcileIdentity(db, signal());
  db.prepare("DELETE FROM usage_events").run();
  const reopened = (await openHistoryDatabase(join(root, "usage.sqlite")))!;
  try {
    reconcileIdentity(reopened, signal());
    expect(identityView(reopened).threads[0]?.totalTokens).toBe(3);
    expect(
      reopened.prepare("SELECT occurred_at,workspace FROM identity_usage").get(),
    ).toMatchObject({ occurred_at: "2026-10-01T00:00:00.000Z", workspace: "/original" });
  } finally {
    reopened.close();
  }
});
it("freezes generation totals and rejects contradictory late additions", async () => {
  const { db } = await fixture();
  capture(db, 1);
  acceptIdentityBatch(db, batch());
  reconcileIdentity(db, signal());
  expect(() => acceptIdentityBatch(db, { ...batch(), offset: 1, total: 2 })).toThrow();
  expect(identityView(db).threads[0]?.totalTokens).toBe(3);
});
it("does not restart 1000 usage rows for unchanged or title-only catalog generations", async () => {
  const { db } = await fixture();
  db.transaction(() => {
    for (let n = 1; n <= 1000; n++) {
      const record = parseCompact(
        JSON.stringify({
          version: 1,
          eventId: captureId(n),
          provenance: "observed",
          occurredAt: "2026-10-01T00:00:00.000Z",
          sessionId: "pi-id",
          workspace: "/original",
          providerSessionKey: "provider-a.jsonl",
          claimedThreadId: null,
          provider: "openai-codex",
          model: "gpt-5",
          inputTokens: 1,
          outputTokens: 2,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reasoningTokens: 1,
          totalTokens: 3,
          capturedCost: null,
        }),
        false,
      )!;
      projectCompactRecord(db, record);
    }
  });
  acceptIdentityBatch(db, batch());
  for (let n = 0; n < 6; n++) reconcileIdentity(db, signal());
  expect(identityView(db).threads[0]?.totalTokens).toBe(3000);
  const revision = (
    db.prepare("SELECT revision FROM identity_receipt").get() as { revision: number }
  ).revision;
  for (let generation = 2; generation <= 7; generation++) {
    acceptIdentityBatch(
      db,
      batch(generation, [{ ...batch().rows[0]!, title: generation === 7 ? "New title" : "A" }]),
    );
    reconcileIdentity(db, signal());
    expect(identityView(db).backlog).toBe(false);
    expect(identityView(db).threads[0]?.totalTokens).toBe(3000);
    expect(db.prepare("SELECT revision FROM identity_receipt").get()).toMatchObject({ revision });
  }
  expect(identityView(db).threads[0]?.label).toBe("New title");
  acceptIdentityBatch(db, batch(8, [{ ...batch().rows[0]!, threadId: "thr_conflict" }]));
  reconcileIdentity(db, signal());
  expect(identityView(db).backlog).toBe(true);
  expect(identityView(db).threads).toEqual([]);
  // Identical fresh catalogs must let real conflict work finish across cache intervals.
  for (let generation = 9; generation <= 13; generation++) {
    acceptIdentityBatch(db, batch(generation, [{ ...batch().rows[0]!, threadId: "thr_conflict" }]));
    reconcileIdentity(db, signal());
  }
  expect(identityView(db).backlog).toBe(false);
  expect(identityView(db).threads).toEqual([]);
  expect(identityView(db).grades.find((g) => g.grade === "ambiguous")?.totalTokens).toBe(3000);
});
it("does not replace a resumable delivery with a partial newer catalog heartbeat", async () => {
  const { db } = await fixture();
  capture(db, 1);
  acceptIdentityBatch(db, { ...batch(), total: 2 });
  acceptIdentityBatch(db, { ...batch(9, []), total: null });
  expect(db.prepare("SELECT generation,received FROM identity_receipt").get()).toMatchObject({
    generation: 1,
    received: 1,
  });
  acceptIdentityBatch(db, {
    ...batch(),
    offset: 1,
    total: 2,
    rows: [{ ...batch().rows[0]!, providerIdentity: "provider-b" }],
  });
  reconcileIdentity(db, signal());
  expect(identityView(db).threads[0]?.totalTokens).toBe(3);
});
