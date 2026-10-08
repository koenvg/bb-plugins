import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { openHistoryDatabase } from "../storage/history-storage.js";
import { initializeHistory, projectCompactRecord } from "../storage/history-projection.js";
import { acceptIdentityBatch } from "../identity/identity-storage.js";
import { importedUsage } from "./import-parser.js";
import { executeImport } from "./import-engine.js";
import type { ImportCommand } from "./import-contract.js";

const at = "2026-10-01T00:00:00.000Z";
const message = (id: string, parentId: string | null = null) => ({
  type: "message",
  id,
  parentId,
  message: {
    role: "assistant",
    provider: "openai-codex",
    model: "synthetic",
    timestamp: Date.parse(at),
    usage: {
      input: 2,
      output: 3,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 5,
      cost: { total: 0.02 },
    },
  },
});
const contextEntry = { type: "custom", id: "context", parentId: null };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bbp177-replay-"));
  const sources = join(root, "sources"),
    ordinary = join(root, "ordinary"),
    workspace = join(root, "workspace");
  await Promise.all([sources, ordinary, workspace].map((p) => mkdir(p)));
  const path = join(root, "usage.sqlite");
  let db = (await openHistoryDatabase(path))!;
  initializeHistory(db, at, false);
  acceptIdentityBatch(db, {
    hostId: "host-synthetic",
    generation: 1,
    offset: 0,
    total: 1,
    rows: [
      {
        providerIdentity: "provider-a",
        threadId: "thr_synthetic",
        title: null,
        state: "available",
      },
    ],
  });
  const parent = join(sources, "provider-a.jsonl"),
    child = join(ordinary, "child.jsonl"),
    chained = join(ordinary, "chained.jsonl");
  const write = (path: string, session: string, entries: unknown[], parentSession?: string) =>
    writeFile(
      path,
      [
        {
          type: "session",
          version: 3,
          id: session,
          cwd: workspace,
          ...(parentSession ? { parentSession } : {}),
        },
        ...entries,
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n",
    );
  const shared = [contextEntry, message("entry-a", "context")];
  const branch = [...shared, message("child-entry", "entry-a")];
  await write(parent, "pi-parent", shared);
  await write(child, "pi-child", branch, parent);
  await write(chained, "pi-chained", [...branch, message("chained-entry", "child-entry")], child);
  const run = (command: ImportCommand) =>
    executeImport(db, "host-synthetic", command, [workspace], {
      signal: new AbortController().signal,
      now: () => Date.parse("2026-10-03T00:00:00Z"),
    });
  expect(
    (
      await run({
        action: "configure",
        configuration: { bbRoot: sources, ordinaryRoots: [ordinary], workspaces: [workspace] },
      })
    ).reason,
  ).toBe("ok");
  return {
    get db() {
      return db;
    },
    parent,
    child,
    chained,
    ordinary,
    workspace,
    shared,
    branch,
    write,
    async completeImport(includeUncertain = false) {
      let result = await run({
        action: "start",
        ...(includeUncertain ? { includeUncertain } : {}),
      });
      for (let i = 0; i < 30 && result.generation?.state === "stopped"; i++)
        result = await run({ action: "resume" });
      expect(result.generation?.state, JSON.stringify(result)).toBe("completed");
      return result.generation!;
    },
    async reopen() {
      db.close();
      db = (await openHistoryDatabase(path))!;
    },
    async dispose() {
      db.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

function snapshot(f: Awaited<ReturnType<typeof fixture>>) {
  return {
    totals: f.db.prepare("SELECT * FROM workspace_totals ORDER BY workspace").all(),
    compact: f.db.prepare("SELECT * FROM usage_compact ORDER BY event_id").all(),
    events: f.db.prepare("SELECT * FROM usage_events ORDER BY event_id").all(),
    owners: f.db.prepare("SELECT * FROM usage_entry_owners ORDER BY session_id,entry_id").all(),
    confirmations: f.db.prepare("SELECT * FROM usage_confirmations ORDER BY event_id").all(),
  };
}

it.each([false, true])(
  "preserves confirmed chained forks after reopen and normal/estimate reimports, live=%s",
  async (liveOverlap) => {
    const f = await fixture();
    try {
      let liveId: string | undefined;
      if (liveOverlap) {
        const usage = importedUsage(
          message("entry-a", "context"),
          "pi-parent",
          f.workspace,
          "provider-a.jsonl",
        );
        if (usage.kind !== "usage") throw Error("Invalid synthetic fixture");
        liveId = "00000000-0000-4000-8000-000000000001";
        projectCompactRecord(f.db, { ...usage.record, eventId: liveId, provenance: "observed" });
        projectCompactRecord(f.db, {
          version: 1,
          eventId: liveId,
          sessionId: "pi-parent",
          entryId: "entry-a",
        });
      }
      const first = await f.completeImport();
      expect(first).toMatchObject({ omissions: 0, replayed: 3, diagnostics: [] });
      const original = snapshot(f);
      expect(original.totals).toEqual([{ workspace: f.workspace, total_tokens: 15, events: 3 }]);
      expect(
        f.db
          .prepare(
            "SELECT session_id,entry_id,conflicted FROM usage_entry_owners ORDER BY session_id",
          )
          .all(),
      ).toEqual([
        { session_id: "pi-chained", entry_id: "chained-entry", conflicted: 0 },
        { session_id: "pi-child", entry_id: "child-entry", conflicted: 0 },
        { session_id: "pi-parent", entry_id: "entry-a", conflicted: 0 },
      ]);
      const inherited = f.db
        .prepare("SELECT path,entry,parent_entry,event_id FROM import_entries ORDER BY path,entry")
        .all();
      if (liveId)
        expect(
          f.db.prepare("SELECT DISTINCT event_id FROM import_entries WHERE entry='entry-a'").all(),
        ).toEqual([{ event_id: liveId }]);
      expect(
        f.db
          .prepare("SELECT captured_cost FROM usage_compact WHERE accepted=1 ORDER BY event_id")
          .all(),
      ).toEqual(Array.from({ length: 3 }, () => ({ captured_cost: 0.02 })));
      for (const estimate of [false, false, true]) {
        await f.reopen();
        const repeat = await f.completeImport(estimate);
        expect(repeat.id).not.toBe(first.id);
        expect(repeat).toMatchObject({ omissions: 0, replayed: 3, diagnostics: [] });
        expect(snapshot(f)).toEqual(original);
        expect(
          f.db
            .prepare(
              "SELECT path,entry,parent_entry,event_id FROM import_entries WHERE generation=? ORDER BY path,entry",
            )
            .all(repeat.id),
        ).toEqual(inherited);
        expect(f.db.prepare("SELECT * FROM usage_uncertain").all()).toEqual([]);
      }
    } finally {
      await f.dispose();
    }
  },
);

it.each(["session", "parent-entry", "usage"])(
  "fails closed for changed %s evidence after a confirmed generation",
  async (kind) => {
    const f = await fixture();
    try {
      await f.completeImport();
      const changed = message("entry-a", kind === "parent-entry" ? "wrong-parent" : "context");
      if (kind === "usage") changed.message.usage.cost.total = 0.03;
      await f.write(
        f.child,
        kind === "session" ? "unrelated" : "pi-child",
        [contextEntry, changed],
        kind === "session" ? undefined : f.parent,
      );
      await f.reopen();
      const repeat = await f.completeImport();
      expect(repeat.diagnostics).toContain("unresolved-ancestry");
      expect(f.db.prepare("SELECT count(*) AS n FROM usage_entry_owners").get()).toEqual({ n: 3 });
      expect(
        f.db.prepare("SELECT * FROM usage_entry_owners WHERE session_id='unrelated'").all(),
      ).toEqual([]);
      expect(
        f.db
          .prepare(
            "SELECT event_id FROM import_entries WHERE generation=? AND path=? AND entry='entry-a'",
          )
          .all(repeat.id, f.child),
      ).toEqual([]);
      expect(
        f.db
          .prepare(
            "SELECT captured_cost FROM usage_compact WHERE session_id='pi-parent' AND accepted=1",
          )
          .get(),
      ).toEqual({ captured_cost: 0.02 });
    } finally {
      await f.dispose();
    }
  },
);

it("rejects unrelated historical entry/session evidence instead of trusting a parent path", async () => {
  const f = await fixture();
  try {
    await f.write(f.parent, "unrelated", f.shared);
    await f.completeImport();
    await f.write(f.parent, "pi-parent", f.shared);
    await f.reopen();
    const repeat = await f.completeImport();
    expect(repeat.diagnostics).toContain("unresolved-ancestry");
    expect(
      f.db.prepare("SELECT * FROM usage_entry_owners WHERE session_id='pi-parent'").all(),
    ).toEqual([]);
    expect(
      f.db
        .prepare("SELECT accepted,captured_cost FROM usage_compact WHERE session_id='unrelated'")
        .get(),
    ).toEqual({ accepted: 1, captured_cost: 0.02 });
  } finally {
    await f.dispose();
  }
});

it("rejects a novel child entry that collides with an unrelated first owner", async () => {
  const f = await fixture();
  try {
    await f.write(join(f.ordinary, "unrelated.jsonl"), "unrelated", [message("collision")]);
    await f.completeImport();
    const original = snapshot(f);
    expect(original.totals).toEqual([{ workspace: f.workspace, total_tokens: 20, events: 4 }]);
    await f.write(
      f.child,
      "pi-child",
      [...f.branch, message("collision", "child-entry")],
      f.parent,
    );
    await f.reopen();
    const repeat = await f.completeImport();
    expect(repeat).toMatchObject({ omissions: 1, diagnostics: ["unresolved-ancestry"] });
    expect(snapshot(f)).toEqual(original);
    expect(
      f.db
        .prepare(
          "SELECT * FROM usage_entry_owners WHERE session_id='pi-child' AND entry_id='collision'",
        )
        .all(),
    ).toEqual([]);
    expect(
      f.db
        .prepare("SELECT * FROM import_entries WHERE generation=? AND path=? AND entry='collision'")
        .all(repeat.id, f.child),
    ).toEqual([]);
  } finally {
    await f.dispose();
  }
});
