import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { openHistoryDatabase, type HistoryDatabase } from "./history-storage.js";
import { recordHistoryExecutions, explainHistoryExecution } from "../history-sql.test-support.js";
import { initializeHistory, projectCompactRecord, collectionView } from "./history-projection.js";
import { parseCompact } from "../collection/usage-record.js";
const fixtures: { root: string; db: HistoryDatabase }[] = [];
afterEach(async () => {
  for (const { root, db } of fixtures.splice(0)) {
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bbp18-projection-")),
    db = (await openHistoryDatabase(join(root, "usage.sqlite")))!;
  fixtures.push({ root, db });
  initializeHistory(db, "2026-10-01T00:00:00.000Z");
  return db;
}
function record(n: number, workspace = "/workspace") {
  return {
    version: 1,
    eventId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    provenance: "observed",
    occurredAt: "2026-10-01T00:00:00.000Z",
    sessionId: "session",
    workspace,
    providerSessionKey: null,
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
  };
}
const compact = (value: unknown) =>
  parseCompact(JSON.stringify(value), !("workspace" in (value as object)))!;
const bind = (n: number, entryId = "entry") => ({
  version: 1,
  eventId: record(n).eventId,
  sessionId: "session",
  entryId,
});
it("rolls back events, replay ownership, counters and totals together", async () => {
  const db = await fixture();
  expect(() =>
    db.transaction(() => {
      projectCompactRecord(db, compact(record(1)));
      projectCompactRecord(db, compact(bind(1)));
      throw Error("rollback");
    }),
  ).toThrow();
  expect(collectionView(db, true, false)).toMatchObject({
    workspaces: [],
    unconfirmedEvents: 0,
    conflictingEntries: 0,
  });
  expect(db.prepare("SELECT count(*) AS n FROM usage_entry_owners").get()).toMatchObject({ n: 0 });
  db.transaction(() => {
    projectCompactRecord(db, compact(record(1)));
    projectCompactRecord(db, compact(bind(1)));
  });
  expect(collectionView(db, true, false)).toMatchObject({
    unconfirmedEvents: 0,
    workspaces: [{ workspace: "/workspace", totalTokens: 3, events: 1 }],
  });
});
it("keeps conflicting confirmation-before-event evidence excluded", async () => {
  const db = await fixture();
  db.transaction(() => {
    projectCompactRecord(db, compact(bind(1)));
    projectCompactRecord(db, compact(bind(1, "different-entry")));
    projectCompactRecord(db, compact(record(1)));
  });
  expect(collectionView(db, true, false)).toMatchObject({ workspaces: [], conflictingEntries: 1 });
});
it("bounds ranking with a persistent index and no grouping or detailed-event scan", async () => {
  const db = await fixture();
  db.transaction(() => {
    for (let n = 1; n <= 80; n++) projectCompactRecord(db, compact(record(n, `/workspace-${n}`)));
  });
  const capture = recordHistoryExecutions(db);
  const view = collectionView(capture.db, true, false);
  expect(view.workspaces).toHaveLength(50);
  expect(view.truncated).toBe(true);
  expect(view.unconfirmedEvents).toBe(80);
  expect(view.workspaces[0]).toMatchObject({
    workspace: "/workspace-1",
    totalTokens: 3,
    events: 1,
  });
  expect(view.workspaces[49]).toMatchObject({
    workspace: "/workspace-54",
    totalTokens: 3,
    events: 1,
  });
  const rankings = capture.executed.filter((execution) =>
    /\bFROM workspace_totals\b/i.test(execution.sql),
  );
  expect(rankings).toHaveLength(1);
  expect(rankings[0].method).toBe("all");
  expect(rankings[0].sql).toMatch(/\bORDER BY total_tokens DESC,\s*workspace\s+LIMIT 51\b/i);
  const plan = explainHistoryExecution(db, rankings[0]).join("\n");
  expect(plan).toMatch(/\bUSING (?:COVERING )?INDEX workspace_ranking\b/);
  expect(plan).not.toContain("TEMP B-TREE");
  expect(plan).not.toMatch(/\b(?:usage_events|usage_compact)\b/);
});
