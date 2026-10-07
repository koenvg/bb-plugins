import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { openHistoryDatabase } from "../storage/history-storage.js";
import { initializeHistory, projectCompactRecord } from "../storage/history-projection.js";
import { maintainHistory } from "../storage/history-retention.js";
import { acceptIdentityBatch } from "../identity/identity-storage.js";
import { createImportOperation } from "./import-host.js";
import { readHostCalendar } from "../calendar/calendar-host.js";
import { calendarQuerySchema, calendarReportSchema } from "../calendar/calendar-contract.js";
import { importCommandSchema, type ImportCommand } from "./import-contract.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
const now = Date.parse("2026-10-03T12:00:00Z");
const at = "2026-10-01T12:00:00.000Z";
const query = {
  startDate: "2026-09-03",
  timezone: "UTC",
  group: "workspace" as const,
  scope: { kind: "host" as const },
};
const message = (id = "entry-a", tokens = 5, time = at) => ({
  type: "message",
  id,
  parentId: null,
  message: {
    role: "assistant",
    provider: "openai-codex",
    model: "synthetic",
    timestamp: Date.parse(time),
    content: [{ type: "text", text: "PRIVATE_BODY_MUST_NOT_BE_STORED" }],
    usage: {
      input: tokens - 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: tokens,
      cost: { total: 0.02 },
    },
  },
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "codex-uncertain-"));
  roots.push(root);
  const dataDir = join(root, "data"),
    sources = join(root, "sources"),
    workspace = join(root, "workspace"),
    other = join(root, "outside-bb");
  for (const dir of [join(dataDir, "history"), sources, workspace, other])
    await mkdir(dir, { recursive: true });
  const path = join(dataDir, "history/usage-v1.sqlite");
  const db = (await openHistoryDatabase(path))!;
  initializeHistory(db, at, false);
  maintainHistory(db, now);
  acceptIdentityBatch(db, {
    hostId: "host-a",
    generation: 1,
    offset: 0,
    total: 3,
    rows: ["a", "b", "c"].map((id) => ({
      threadId: `thr_${id}`,
      providerIdentity: `provider-${id}`,
      title: null,
      state: "available" as const,
    })),
  });
  let reads = 0;
  const run = createImportOperation({ now: () => now, bodyRead: () => reads++, rows: 2 });
  const context = {
    hostId: "host-a",
    dataDir,
    signal: new AbortController().signal,
    knownWorkspaces: [workspace],
  };
  const call = (command: ImportCommand) => run(command, context);
  const write = async (
    provider: string,
    session: string,
    cwd: string,
    entries = [message()],
    parentSession?: string,
  ) => {
    await writeFile(
      join(sources, `provider-${provider}.jsonl`),
      [
        {
          type: "session",
          version: 3,
          id: session,
          cwd,
          ...(parentSession ? { parentSession } : {}),
        },
        ...entries,
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n",
    );
  };
  await call({
    action: "configure",
    configuration: { bbRoot: sources, ordinaryRoots: [], workspaces: [workspace] },
  });
  const complete = async (includeUncertain = false) => {
    let view = await call({
      action: "start",
      ...(includeUncertain ? { includeUncertain: true } : {}),
    });
    for (let n = 0; n < 50 && view.generation?.state === "stopped"; n++)
      view = await call({ action: "resume" });
    expect(view.reason).toBe("ok");
    expect(view.generation?.state).toBe("completed");
    return view;
  };
  const report = async (includeUncertain = false) => {
    const view = await readHostCalendar(
      {
        dataDir,
        signal: context.signal,
        calendar: { ...query, ...(includeUncertain ? { includeUncertain: true } : {}) },
      },
      { now: () => now },
    );
    expect(view.state).not.toBe("unavailable");
    if (view.state === "unavailable") throw Error(view.reason);
    return view;
  };
  return { root, db, sources, workspace, other, write, complete, report, call, reads: () => reads };
}

it("keeps uncertain import and stats opt-in, with recorded tokens and prices unchanged", async () => {
  const f = await fixture();
  try {
    await f.write("a", "pi-a", f.workspace);
    await f.write("b", "pi-b", f.other, [message("entry-b", 20)]);
    await f.complete();
    expect((await f.report(true)).summary.uncertain).toEqual({ totalTokens: 0, records: 0 });
    const baseline = await f.report();
    const imported = await f.complete(true);
    expect(imported.generation?.includeUncertain).toBe(true);
    expect(imported.generation?.uncertainRecords).toBe(1);
    const normal = await f.report(),
      estimated = await f.report(true);
    expect(normal.summary).toEqual(baseline.summary);
    expect(normal.summary.uncertain).toBeUndefined();
    expect(estimated.summary.totalTokens).toBe(5);
    expect(estimated.summary.money).toEqual(normal.summary.money);
    expect(estimated.summary.uncertain).toEqual({ totalTokens: 20, records: 1 });
    expect(estimated.days.find((d) => d.date === "2026-10-01")?.uncertain?.totalTokens).toBe(20);
    expect(estimated.ranking).toEqual(normal.ranking);
    expect(JSON.stringify(f.db.prepare("SELECT * FROM usage_uncertain").all())).not.toContain(
      "PRIVATE_BODY",
    );
    expect(f.db.prepare("SELECT count(*) AS n FROM usage_entry_owners").get()).toEqual({ n: 1 });
  } finally {
    f.db.close();
  }
});

it("uses best-effort shared-entry deduplication across forks and repeat imports, and reads only the index", async () => {
  const f = await fixture();
  try {
    await f.write("a", "pi-a", f.other);
    await f.write("b", "pi-b", f.other, [message()], "/untrusted/parent.jsonl");
    await f.complete(true);
    await f.complete(true);
    const reads = f.reads();
    await rm(f.sources, { recursive: true });
    const view = await f.report(true);
    expect(view.summary.uncertain).toEqual({ totalTokens: 5, records: 1 });
    expect(view.summary.totalTokens).toBe(0);
    expect(view.state).toBe("partial");
    expect(f.reads()).toBe(reads);
    expect(f.db.prepare("SELECT count(*) AS n FROM usage_uncertain").get()).toEqual({ n: 2 });
  } finally {
    f.db.close();
  }
});

it("suppresses plausible live duplicates but retains additional uncertain usage without promoting it", async () => {
  const f = await fixture();
  try {
    projectCompactRecord(f.db, {
      version: 1,
      eventId: "00000000-0000-4000-8000-000000000001",
      occurredAt: at,
      sessionId: "pi-a",
      workspace: f.workspace,
      providerSessionKey: "provider-a.jsonl",
      claimedThreadId: null,
      provider: "openai-codex",
      model: "synthetic",
      inputTokens: 4,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      totalTokens: 5,
      capturedCost: 0.02,
      provenance: "observed",
    });
    await f.write("a", "pi-a", f.workspace, [
      message(),
      message("entry-extra", 10, "2026-10-01T13:00:00.000Z"),
    ]);
    await f.complete(true);
    const view = await f.report(true);
    expect(view.summary.totalTokens).toBe(5);
    expect(view.summary.uncertain).toEqual({ totalTokens: 10, records: 1 });
    expect(f.db.prepare("SELECT count(*) AS n FROM usage_entry_owners").get()).toEqual({ n: 0 });
  } finally {
    f.db.close();
  }
});

it("retains readable unresolved ancestry as uncertain, never follows the parent claim", async () => {
  const f = await fixture();
  try {
    await f.write("a", "pi-a", f.workspace, [message()], "/outside/parent.jsonl");
    await f.complete(true);
    expect((await f.report(true)).summary.uncertain).toEqual({ totalTokens: 5, records: 1 });
    expect((await f.report()).summary.totalTokens).toBe(0);
    expect(f.db.prepare("SELECT count(*) AS n FROM identity_imports").get()).toEqual({ n: 0 });
  } finally {
    f.db.close();
  }
});

it("expires uncertain scalar records within the existing retention budget", async () => {
  const f = await fixture();
  try {
    await f.write("a", "pi-a", f.other);
    await f.complete(true);
    maintainHistory(f.db, Date.parse("2027-03-01T00:00:00Z"), 1);
    expect(f.db.prepare("SELECT count(*) AS n FROM usage_uncertain").get()).toEqual({ n: 0 });
  } finally {
    f.db.close();
  }
});

it("accepts older indexes without creating tables on report reads, and rejects unsafe totals or modes", async () => {
  const f = await fixture();
  try {
    f.db.exec("DROP TABLE usage_uncertain; DROP TABLE import_uncertain_candidates;");
    expect((await f.report(true)).summary.uncertain).toEqual({ totalTokens: 0, records: 0 });
    expect(
      f.db.prepare("SELECT name FROM sqlite_master WHERE name='usage_uncertain'").get(),
    ).toBeUndefined();
    expect(
      calendarQuerySchema.safeParse({ ...query, includeUncertain: true, group: "thread" }).success,
    ).toBe(false);
    expect(
      calendarQuerySchema.safeParse({ ...query, includeUncertain: true, comparison: true }).success,
    ).toBe(false);
    expect(
      importCommandSchema.safeParse({ action: "resume", includeUncertain: true }).success,
    ).toBe(false);
    const view = await f.report();
    view.summary.uncertain = { totalTokens: 1, records: 1 };
    expect(calendarReportSchema.safeParse(view).success).toBe(false);
  } finally {
    f.db.close();
  }
});
