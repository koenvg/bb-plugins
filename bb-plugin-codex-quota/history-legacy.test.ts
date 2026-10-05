import { mkdtemp, rm, writeFile, readFile, access, symlink, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHostHistory } from "./history-host.js";
import { openHistoryDatabase } from "./history-storage.js";
import { readCalendarTotals } from "./history-retention.js";
import { recordCoverage } from "./history-coverage.js";
import type { HistoryReadiness } from "./history-contract.js";
// Frozen BBP-18 installed writer. This fixture must retain its protocol-1 behavior.
import { COLLECTOR_ENTRY as LEGACY_ENTRY } from "./fixtures/legacy-collector-v1.fixture.js";
import { writeFileSync } from "node:fs";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const initial = Date.parse("2026-10-01T12:00:00.000Z");
const record = (n: number, occurredAt = "2026-09-30T00:00:00.000Z") => ({
  version: 1,
  eventId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  provenance: "observed",
  occurredAt,
  sessionId: "session",
  workspace: "/original",
  providerSessionKey: null,
  claimedThreadId: null,
  provider: "openai-codex",
  model: "gpt-5",
  inputTokens: 2,
  outputTokens: 3,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 1,
  totalTokens: 5,
  capturedCost: 0.25,
});
type Status = { phase: string; token?: string; reason?: string };
const status = (view: HistoryReadiness) =>
  (view.health as unknown as { legacyRetirement: Status })?.legacyRetirement;
async function fixture(hook?: (step: string) => void) {
  const root = await mkdtemp(join(tmpdir(), "bbp23-legacy-"));
  roots.push(root);
  const dataDir = join(root, "data"),
    agentDir = join(root, "agent"),
    directory = join(dataDir, "history");
  const context = { dataDir, signal: new AbortController().signal };
  let now = initial;
  const make = () =>
    createHostHistory({
      agentDir: () => agentDir,
      now: () => now,
      ingestRows: 2,
      maintenanceRows: 2,
      retirementRows: 2,
      retirementCheckpoint: hook,
    } as never);
  let history = make();
  await history.control("install", context);
  const events = [record(1, "2026-08-01T00:00:00.000Z"), record(2)];
  await writeFile(
    join(directory, "events-v1.jsonl"),
    events.map((v) => JSON.stringify(v) + "\n").join(""),
  );
  await writeFile(
    join(directory, "confirmations-v1.jsonl"),
    events
      .map(
        (v, n) =>
          JSON.stringify({
            version: 1,
            eventId: v.eventId,
            sessionId: "session",
            entryId: `entry-${n}`,
          }) + "\n",
      )
      .join(""),
  );
  const control = (action: string, confirmation?: unknown) =>
    history.control(action as never, context, confirmation as never);
  const read = () => history.read(context);
  const pause = () => control("pause");
  const prepare = async () => {
    await pause();
    const view = await control("prepare-legacy");
    expect(status(view)?.phase).toBe("awaiting-confirmation");
    return status(view)!.token!;
  };
  const confirm = (token: string, stopped = true) =>
    control("retire-legacy", { token, legacyWritersStopped: stopped });
  const finish = async () => {
    let view = await read();
    for (let n = 0; n < 100 && status(view)?.phase !== "complete"; n++) view = await read();
    expect(status(view)?.phase).toBe("complete");
    return view;
  };
  return {
    root,
    dataDir,
    directory,
    context,
    control,
    read,
    pause,
    prepare,
    confirm,
    finish,
    setNow: (v: number) => {
      now = v;
    },
    reopen: () => {
      history = make();
    },
  };
}
it("requires paused capture and a fresh explicit stopped-writer confirmation, never quiet-file guesses", async () => {
  const f = await fixture(),
    path = join(f.directory, "collector-control-v1.json"),
    before = await readFile(path);
  expect((await f.control("prepare-legacy")).reason).toBe("retirement-incomplete");
  expect(await readFile(path)).toEqual(before);
  const token = await f.prepare();
  expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ protocol: 2, enabled: false });
  for (let n = 0; n < 4; n++) expect(status(await f.read())?.phase).toBe("awaiting-confirmation");
  expect((await f.confirm(token, false)).reason).toBe("retirement-incomplete");
  expect((await f.confirm("00000000-0000-4000-8000-000000000099")).reason).toBe(
    "retirement-incomplete",
  );
  expect(await readFile(join(f.directory, "events-v1.jsonl"), "utf8")).toContain(record(1).eventId);
  expect((await f.read()).collection?.enabled).toBe(false);
});
it("reconciles the final tail and retains original in-window bodies, prices, ownership and observation", async () => {
  const f = await fixture(),
    token = await f.prepare();
  await f.confirm(token);
  const view = await f.finish();
  expect(view.collection).toMatchObject({
    enabled: false,
    pauseCount: 1,
    workspaces: [{ workspace: "/original", totalTokens: 10, events: 2 }],
  });
  expect(view.writer).toBe("observed");
  expect(view.health?.legacyLogsPending).toBe(false);
  await expect(access(join(f.directory, "events-v1.jsonl"))).rejects.toThrow();
  await expect(access(join(f.directory, "confirmations-v1.jsonl"))).rejects.toThrow();
  expect(await readFile(join(f.directory, "events-legacy-retained-v1.jsonl"), "utf8")).toBe(
    JSON.stringify(record(2)) + "\n",
  );
  const db = (await openHistoryDatabase(join(f.directory, "usage-v1.sqlite")))!;
  try {
    expect(
      db
        .prepare("SELECT event_id,evidence,conflicted FROM usage_entry_owners ORDER BY entry_id")
        .all(),
    ).toHaveLength(2);
    expect(
      db
        .prepare(
          "SELECT workspace,occurred_at,captured_cost FROM usage_compact ORDER BY occurred_at",
        )
        .all(),
    ).toEqual([
      { workspace: "/original", occurred_at: "2026-08-01T00:00:00.000Z", captured_cost: 0.25 },
      { workspace: "/original", occurred_at: "2026-09-30T00:00:00.000Z", captured_cost: 0.25 },
    ]);
  } finally {
    db.close();
  }
  f.reopen();
  expect((await f.read()).collection?.workspaces).toEqual(view.collection?.workspaces);
});
it.each(["append", "replace", "control", "expired"])(
  "rejects %s changes to the confirmation boundary",
  async (kind) => {
    const f = await fixture(),
      token = await f.prepare();
    if (kind === "append")
      await writeFile(join(f.directory, "events-v1.jsonl"), JSON.stringify(record(3)) + "\n", {
        flag: "a",
      });
    if (kind === "replace")
      await writeFile(join(f.directory, "events-v1.jsonl"), JSON.stringify(record(3)) + "\n");
    if (kind === "control") {
      await f.control("resume");
      await f.pause();
    }
    if (kind === "expired") f.setNow(initial + 16 * 60000);
    expect((await f.confirm(token)).reason).toBe("retirement-incomplete");
    await access(join(f.directory, "events-v1.jsonl"));
  },
);
it.each(["output-written", "published", "source-removed"])(
  "resumes bounded retirement after interruption at %s",
  async (step) => {
    let armed = false,
      fired = false;
    const f = await fixture((point) => {
      if (armed && !fired && point === step) {
        fired = true;
        throw Object.assign(Error("private-secret"), { code: "EIO" });
      }
    });
    const token = await f.prepare();
    armed = true;
    let failed = await f.confirm(token);
    for (let n = 0; n < 100 && !fired; n++) failed = await f.read();
    expect(fired).toBe(true);
    expect(failed.reason).toBe("retirement-incomplete");
    expect(JSON.stringify(failed)).not.toContain("private-secret");
    f.reopen();
    const view = await f.finish();
    expect(view.collection?.workspaces).toEqual([
      { workspace: "/original", totalTokens: 10, events: 2 },
    ]);
    expect(await readFile(join(f.directory, "events-legacy-retained-v1.jsonl"), "utf8")).toBe(
      JSON.stringify(record(2)) + "\n",
    );
  },
);
it("retains invalid-source uncertainty after retirement and expires sealed bodies without resurrecting replay", async () => {
  const f = await fixture();
  await writeFile(join(f.directory, "events-v1.jsonl"), "invalid\n", { flag: "a" });
  const token = await f.prepare();
  await f.confirm(token);
  await f.finish();
  let db = (await openHistoryDatabase(join(f.directory, "usage-v1.sqlite")))!;
  try {
    recordCoverage(db, {
      id: "empty",
      workspace: "/empty",
      threadId: null,
      start: "2026-09-30T00:00:00.000Z",
      end: "2026-10-01T00:00:00.000Z",
      kind: "observed-inactivity",
    });
    expect(
      readCalendarTotals(db, {
        workspace: "/empty",
        start: "2026-09-30T00:00:00.000Z",
        end: "2026-10-01T00:00:00.000Z",
        timezone: "UTC",
      }).coverage,
    ).toMatchObject({ zero: false, uncertain: true });
  } finally {
    db.close();
  }
  await f.control("resume");
  f.setNow(Date.parse("2026-11-17T12:00:00.000Z"));
  await f.finish();
  expect(await readFile(join(f.directory, "events-legacy-retained-v1.jsonl"), "utf8")).toBe("");
  db = (await openHistoryDatabase(join(f.directory, "usage-v1.sqlite")))!;
  try {
    expect(
      db
        .prepare("SELECT total,captured_cost,detail_available FROM usage_compact WHERE event_id=?")
        .get(record(2).eventId),
    ).toEqual({ total: 5, captured_cost: 0.25, detail_available: 0 });
  } finally {
    db.close();
  }
});
it("fails closed on symlinks and partial final records, without retiring unrelated files", async () => {
  const f = await fixture();
  const foreign = join(f.root, "foreign");
  await writeFile(foreign, "unrelated");
  await rm(join(f.directory, "events-v1.jsonl"));
  await symlink(foreign, join(f.directory, "events-v1.jsonl"));
  expect((await f.control("prepare-legacy")).reason).toBe("retirement-incomplete");
  expect(await readFile(foreign, "utf8")).toBe("unrelated");
  await rm(join(f.directory, "events-v1.jsonl"));
  await writeFile(join(f.directory, "events-v1.jsonl"), "partial");
  const token = await f.prepare();
  await f.confirm(token);
  let view = await f.read();
  for (let n = 0; n < 10 && view.reason !== "retirement-incomplete"; n++) view = await f.read();
  expect(view.reason).toBe("retirement-incomplete");
  expect(await readFile(join(f.directory, "events-v1.jsonl"), "utf8")).toBe("partial");
});
it("fences actual obsolete writer handlers before retirement and after explicit resume/reinstall", async () => {
  const f = await fixture();
  await writeFile(
    join(f.directory, "collector-control-v1.json"),
    JSON.stringify({ protocol: 1, enabled: true }),
  );
  async function oldWriter() {
    const handlers = new Map<string, Function>();
    const module = await import(
      /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(`export default ${LEGACY_ENTRY}`)}`
    );
    module.default(
      { on: (name: string, handler: Function) => handlers.set(name, handler) },
      { protocol: 1, dataDir: f.dataDir },
    );
    return handlers;
  }
  const context = {
    cwd: "/original",
    sessionManager: { getSessionId: () => "legacy-session", getLeafId: () => null },
  };
  const message = () => ({
    role: "assistant",
    provider: "openai-codex",
    model: "gpt-5",
    timestamp: initial,
    usage: {
      input: 2,
      output: 3,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 5,
      cost: { total: 0.5 },
    },
  });
  const old = await oldWriter();
  await old.get("message_end")!({ message: message() }, context);
  await old.get("session_shutdown")!({}, context);
  const before = await readFile(join(f.directory, "events-v1.jsonl"), "utf8");
  expect(before.split("\n").filter(Boolean)).toHaveLength(3);
  const token = await f.prepare();
  const fenced = await oldWriter();
  await fenced.get("message_end")!({ message: message() }, context);
  await fenced.get("session_shutdown")!({}, context);
  expect(await readFile(join(f.directory, "events-v1.jsonl"), "utf8")).toBe(before);
  await f.confirm(token);
  await f.finish();
  await f.control("resume");
  await f.control("install");
  const restarted = await oldWriter();
  await restarted.get("message_end")!({ message: message() }, context);
  await restarted.get("session_shutdown")!({}, context);
  await expect(access(join(f.directory, "events-v1.jsonl"))).rejects.toThrow();
});
it("requires fresh consent for a changed source and merges already retained bodies without loss", async () => {
  const f = await fixture(),
    token = await f.prepare();
  await f.confirm(token);
  await f.finish();
  await writeFile(join(f.directory, "events-v1.jsonl"), JSON.stringify(record(3)) + "\n");
  expect((await f.read()).reason).toBe("retirement-incomplete");
  const next = await f.prepare();
  expect(next).not.toBe(token);
  await f.confirm(next);
  const view = await f.finish();
  expect(view.collection?.workspaces).toEqual([
    { workspace: "/original", totalTokens: 15, events: 3 },
  ]);
  expect(await readFile(join(f.directory, "events-legacy-retained-v1.jsonl"), "utf8")).toBe(
    JSON.stringify(record(2)) + "\n" + JSON.stringify(record(3)) + "\n",
  );
});
it("rebuilds retained legacy detail after corruption without enabling capture or guessing older compact history", async () => {
  const f = await fixture(),
    token = await f.prepare();
  await f.confirm(token);
  await f.finish();
  await writeFile(join(f.directory, "usage-v1.sqlite"), "confirmed-corruption");
  const view = await f.read();
  expect(view.health?.state).toBe("recovered");
  expect(view.collection).toMatchObject({
    enabled: false,
    workspaces: [{ workspace: "/original", totalTokens: 5, events: 1 }],
  });
  const db = (await openHistoryDatabase(join(f.directory, "usage-v1.sqlite")))!;
  try {
    expect(db.prepare("SELECT captured_cost,occurred_at FROM usage_compact").get()).toEqual({
      captured_cost: 0.25,
      occurred_at: record(2).occurredAt,
    });
  } finally {
    db.close();
  }
});
it("reconciles retained sources before resuming a copy after mid-retirement corruption", async () => {
  const f = await fixture(),
    token = await f.prepare();
  const active = await f.confirm(token);
  expect(status(active)?.phase).toBe("retaining");
  await writeFile(join(f.directory, "usage-v1.sqlite"), "confirmed-corruption");
  const view = await f.finish();
  expect(view.collection).toMatchObject({
    enabled: false,
    workspaces: [{ workspace: "/original", totalTokens: 5, events: 1 }],
  });
  expect(
    await readFile(join(f.directory, "confirmations-legacy-retained-v1.jsonl"), "utf8"),
  ).toContain(record(2).eventId);
});
it("does not mutate source or control for an already-cancelled retirement dispatch", async () => {
  const f = await fixture(),
    before = await readFile(join(f.directory, "collector-control-v1.json")),
    abort = new AbortController();
  abort.abort();
  const history = createHostHistory({ now: () => initial });
  expect(
    (await history.control("prepare-legacy", { ...f.context, signal: abort.signal })).reason,
  ).toBe("selection-changed");
  expect(await readFile(join(f.directory, "collector-control-v1.json"))).toEqual(before);
  await expect(access(join(f.directory, "legacy-retirement-v1.json"))).rejects.toThrow();
});
it("preserves unrelated source backlog during legacy-only tail reconciliation", async () => {
  const f = await fixture();
  await writeFile(join(f.directory, "events-v1-2026-10-01.jsonl"), "partial-daily-record");
  const token = await f.prepare();
  await f.confirm(token);
  const view = await f.finish();
  expect(view.collection?.backlog).toBe(true);
  expect(view.health?.legacyLogsPending).toBe(false);
  expect(await readFile(join(f.directory, "events-v1-2026-10-01.jsonl"), "utf8")).toBe(
    "partial-daily-record",
  );
});
it("blocks publication when control changes during a bounded copy and reports its actual enabled state", async () => {
  let directory = "",
    changed = false;
  const f = await fixture((stage) => {
    if (stage === "output-written" && !changed) {
      changed = true;
      writeFileSync(
        join(directory, "collector-control-v1.json"),
        JSON.stringify({
          protocol: 2,
          revision: "00000000-0000-4000-8000-000000000999",
          enabled: true,
        }),
      );
    }
  });
  directory = f.directory;
  const token = await f.prepare(),
    view = await f.confirm(token);
  expect(view.reason).toBe("retirement-incomplete");
  expect(status(view)).toMatchObject({ phase: "blocked", reason: "control-changed" });
  expect(view.collection?.enabled).toBe(true);
  await access(join(directory, "events-v1.jsonl"));
  await expect(access(join(directory, "events-legacy-retained-v1.jsonl"))).rejects.toThrow();
});
it("does not adopt an unowned spool or a symlink operation lock", async () => {
  const f = await fixture(),
    spool = join(f.directory, ".events-legacy-retained-v1.tmp");
  await writeFile(spool, "unrelated-owned-fixture");
  await f.control("pause");
  expect((await f.control("prepare-legacy")).reason).toBe("retirement-incomplete");
  expect(await readFile(spool, "utf8")).toBe("unrelated-owned-fixture");
  await rm(spool);
  const target = join(f.dataDir, "unrelated-lock-target");
  await writeFile(target, "unrelated-owned-fixture");
  await symlink(target, join(f.directory, "legacy-retirement-v1.lock"));
  expect((await f.control("prepare-legacy")).reason).toBe("retirement-incomplete");
  expect(await readFile(target, "utf8")).toBe("unrelated-owned-fixture");
});
it("rejects sealed source metadata changes even when modification time and size stay unchanged", async () => {
  const f = await fixture(),
    token = await f.prepare();
  await f.confirm(token);
  await f.finish();
  await chmod(join(f.directory, "events-legacy-retained-v1.jsonl"), 0o640);
  const view = await f.read();
  expect(view.reason).toBe("retirement-incomplete");
  expect(status(view)).toMatchObject({ phase: "blocked", reason: "source-changed" });
});
it("upgrades checkpoint schema 2 without new backfill or changing scalar ownership", async () => {
  const f = await fixture();
  await f.read();
  await f.read();
  const db = (await openHistoryDatabase(join(f.directory, "usage-v1.sqlite")))!;
  try {
    db.exec("DROP TABLE history_legacy_pending; PRAGMA user_version=2");
  } finally {
    db.close();
  }
  f.reopen();
  const view = await f.read();
  expect(view.collection?.workspaces).toEqual([
    { workspace: "/original", totalTokens: 10, events: 2 },
  ]);
  const reopened = (await openHistoryDatabase(join(f.directory, "usage-v1.sqlite")))!;
  try {
    expect(reopened.prepare("PRAGMA user_version").get()).toEqual({ user_version: 4 });
    expect(
      reopened
        .prepare("SELECT captured_cost FROM usage_compact WHERE event_id=?")
        .get(record(2).eventId),
    ).toEqual({ captured_cost: 0.25 });
    expect(
      reopened
        .prepare(
          "SELECT event_id FROM usage_entry_owners WHERE session_id='session' AND entry_id='entry-1'",
        )
        .get(),
    ).toEqual({ event_id: record(2).eventId });
  } finally {
    reopened.close();
  }
});
