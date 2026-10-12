import {
  mkdtemp,
  mkdir,
  realpath,
  readFile,
  writeFile,
  appendFile,
  rename,
  symlink,
  rm,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHostHistory, type HostHistory } from "../history-host.js";
import { loadHistoryStorage, openHistoryDatabase } from "../storage/history-storage.js";
import { projectCompactRecord } from "../storage/history-projection.js";
import { maintainHistory } from "../storage/history-retention.js";
import { parseCompact } from "../collection/usage-record.js";
import type { IdentityBatch } from "../identity/identity-contract.js";
import type { HistoryReadContext } from "../history-maintenance.js";
import type { CalendarQuery } from "../calendar/calendar-contract.js";

const roots: string[] = [],
  histories: HostHistory[] = [];
afterEach(async () => {
  for (const history of histories.splice(0)) history.dispose();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const now = Date.parse("2026-10-01T12:00:00Z");
const query: CalendarQuery = {
  startDate: "2026-09-01",
  timezone: "UTC",
  group: "workspace",
  scope: { kind: "host" },
};
const header = (id = "native-A", extra = {}) => ({
  type: "session_meta",
  payload: { id, session_id: "root-S", cwd: "/fixture", ...extra },
});
const turn = (id = "t1", tier?: unknown) => ({
  type: "turn_context",
  payload: {
    turn_id: id,
    model: "synthetic",
    ...(tier === undefined ? {} : { service_tier: tier }),
  },
});
const usage = (id = "one", total = 120, extra = {}) => ({
  type: "token_usage_record",
  timestamp: "2026-09-15T12:00:00Z",
  payload: {
    thread_id: "native-A",
    turn_id: "t1",
    session_id: "root-S",
    response_id: `resp_${id}`,
    usage: {
      input_tokens: total - 20,
      cached_input_tokens: 40,
      cache_write_input_tokens: 0,
      output_tokens: 20,
      reasoning_output_tokens: 5,
      total_tokens: total,
    },
    ...extra,
  },
});
const snapshot = {
  type: "event_msg",
  payload: {
    type: "token_count",
    info: { last_token_usage: { total_tokens: 120 }, total_token_usage: { total_tokens: 240 } },
  },
};
const text = (rows: unknown[]) => rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
function pi(n = 1, total = 20) {
  return {
    version: 1,
    eventId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    provenance: "observed",
    occurredAt: "2026-09-15T12:00:00.000Z",
    sessionId: "pi-A",
    workspace: "/fixture",
    providerSessionKey: null,
    claimedThreadId: null,
    provider: "openai-codex",
    model: "synthetic",
    inputTokens: total,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: total,
    capturedCost: n === 2 ? 0.03 : null,
  };
}
async function fixture(rows: unknown[], options: { lines?: number; read?: () => void } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "native-speed-")));
  roots.push(root);
  const home = join(root, "codex"),
    dataDir = join(root, "data"),
    sessions = join(home, "sessions");
  await mkdir(sessions, { recursive: true });
  await mkdir(dataDir);
  await mkdir(join(home, "archived_sessions"));
  const file = join(sessions, "rollout.jsonl");
  await writeFile(file, text(rows));
  const context: HistoryReadContext & { identities: IdentityBatch } = {
    dataDir,
    signal: new AbortController().signal,
    identities: { hostId: "host_fixture", generation: 1, offset: 0, total: 0, rows: [] },
  };
  const make = () => {
    const h = createHostHistory({
      now: () => now,
      codexHome: () => home,
      nativeLines: options.lines,
      nativeRead: options.read,
    });
    histories.push(h);
    return h;
  };
  const history = make(),
    path = join(dataDir, "history", "usage-v1.sqlite");
  async function prepare(h = history) {
    let result;
    for (let i = 0; i < 500; i++) {
      result = await h.prepare!(context);
      if (result.state !== "available") throw Error(result.reason);
      if (!result.ingestionPending && !result.attribution.backlog) return result;
    }
    throw Error("Fixture did not settle");
  }
  async function report(q = query, h = history) {
    const result = await h.report(q, context);
    if (result.state === "unavailable") throw Error(result.reason);
    return result;
  }
  return { root, home, sessions, file, dataDir, path, context, make, history, prepare, report };
}

it("feeds public prepare/report with mixed Pi and forward-format speed policy, preserving prices and subset classes", async () => {
  const small = usage("unknown", 10);
  small.payload.usage = {
    input_tokens: 10,
    cached_input_tokens: 0,
    cache_write_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: 10,
  };
  const f = await fixture([
    header(),
    turn("t1", "default"),
    usage("normal"),
    snapshot,
    turn("t1", "fast"),
    usage("fast"),
    snapshot,
    turn("t1", "ultrafast"),
    usage("ultra"),
    turn("t1", "future"),
    small,
  ]);
  await f.prepare();
  const db = (await openHistoryDatabase(f.path))!;
  db.transaction(() => {
    projectCompactRecord(db, parseCompact(JSON.stringify(pi()), false)!);
    projectCompactRecord(
      db,
      parseCompact(
        JSON.stringify({
          version: 2,
          usage: pi(2, 60),
          metadata: { responseId: "resp_pi-fast", serviceTier: "priority" },
        }),
        false,
      )!,
    );
  });
  db.close();
  await f.prepare();
  const view = await f.report();
  expect(view.summary).toMatchObject({
    totalTokens: 450,
    speedTokens: { normal: 150, fast: 180, ultrafast: 120 },
    money: { capturedCost: 0.03, pricedRecords: 1, records: 6 },
  });
  expect(view.days[14].classes).toEqual({
    state: "available",
    input: 270,
    output: 60,
    reasoning: 15,
    cacheRead: 120,
    cacheWrite: 0,
  });
  const before = await readFile(f.path),
    source = await readFile(f.file),
    names = await readdir(join(f.dataDir, "history"));
  await f.report();
  await f.report({ ...query, scope: { kind: "workspace", workspace: "/fixture" } });
  expect(await readFile(f.path)).toEqual(before);
  expect(await readFile(f.file)).toEqual(source);
  expect(await readdir(join(f.dataDir, "history"))).toEqual(names);
  expect(names).not.toContain("collector-control-v1.json");
  const checked = (await openHistoryDatabase(f.path, true))!;
  expect(
    checked.prepare("SELECT observed_events,unconfirmed_events FROM history_counters").get(),
  ).toEqual({ observed_events: 2, unconfirmed_events: 2 });
  expect(
    checked.prepare("SELECT count(*) AS n FROM usage_compact WHERE captured_cost IS NULL").get(),
  ).toEqual({ n: 5 });
  checked.close();
});
it("installed-format usage remains Normal; snapshots, identical counters, replay, archive move and reopen do not inflate it", async () => {
  const f = await fixture([header(), turn(), usage("a"), snapshot, usage("b"), snapshot, snapshot]);
  await f.prepare();
  expect((await f.report()).summary).toMatchObject({
    totalTokens: 240,
    speedTokens: { normal: 240, fast: 0, ultrafast: 0 },
  });
  await appendFile(f.file, text([usage("a"), usage("b")]));
  await f.prepare();
  expect((await f.report()).summary.totalTokens).toBe(240);
  await rename(f.file, join(f.home, "archived_sessions", "moved.jsonl"));
  await f.prepare(f.make());
  expect((await f.report()).summary.totalTokens).toBe(240);
});
it("child-before-parent replay rejects inherited identities and conflicting headers without replacing ownership or dates", async () => {
  const child = usage("child", 120, { thread_id: "child" });
  const f = await fixture([header("child"), header(), usage("parent"), turn(), child]);
  await f.prepare();
  await writeFile(join(f.sessions, "parent.jsonl"), text([header(), turn(), usage("parent")]));
  await f.prepare();
  expect((await f.report()).summary.totalTokens).toBe(240);
  expect((await f.report()).days[14].coverage.state).toBe("incomplete");
});
it("response tier including null/unknown overrides exact-turn tiers; mismatched turns do not inherit speed", async () => {
  const f = await fixture([
    header(),
    turn("t1", "ultrafast"),
    usage("null", 120, { service_tier: null }),
    usage("unknown", 120, { service_tier: "future" }),
    usage("wrong-turn", 120, { turn_id: "other" }),
    usage("priority", 120, { service_tier: "priority" }),
  ]);
  await f.prepare();
  expect((await f.report()).summary.speedTokens).toEqual({ normal: 360, fast: 120, ultrafast: 0 });
});
it("separates speed-only disagreement from token ownership, and quarantines contradictory native counts", async () => {
  const f = await fixture([
    header(),
    turn(),
    usage("conflict", 120, { service_tier: "fast" }),
    usage("conflict", 120, { service_tier: "ultrafast" }),
  ]);
  await f.prepare();
  expect((await f.report()).summary).toMatchObject({
    totalTokens: 120,
    speedTokens: { normal: 120, fast: 0, ultrafast: 0 },
  });
  await appendFile(f.file, text([usage("conflict", 121, { service_tier: "fast" })]));
  await f.prepare();
  expect((await f.report()).summary.totalTokens).toBe(0);
});
for (const order of ["pi-first", "native-first"])
  it(`exact response aliases count once in ${order} order and keep Pi price`, async () => {
    const f = await fixture(
      order === "pi-first" ? [header(), turn()] : [header(), turn(), usage("alias")],
    );
    await f.prepare();
    const db = (await openHistoryDatabase(f.path))!;
    db.transaction(() =>
      projectCompactRecord(
        db,
        parseCompact(
          JSON.stringify({
            version: 2,
            usage: pi(2, 120),
            metadata: { responseId: "resp_alias", serviceTier: "fast" },
          }),
          false,
        )!,
      ),
    );
    db.close();
    if (order === "pi-first") await appendFile(f.file, text([usage("alias")]));
    await f.prepare();
    expect((await f.report()).summary).toMatchObject({
      totalTokens: 120,
      speedTokens: { normal: 0, fast: 120, ultrafast: 0 },
      money: { capturedCost: 0.03, pricedRecords: 1, records: 1 },
    });
    await appendFile(f.file, text([usage("alias", 121)]));
    await f.prepare();
    expect((await f.report()).summary.totalTokens).toBe(120);
  });
it("retains supported totals but leaves nonzero cache-write classes and native prices unavailable", async () => {
  const row = usage();
  row.payload.usage.cache_write_input_tokens = 5;
  const f = await fixture([header(), turn(), row]);
  await f.prepare();
  const view = await f.report();
  expect(view.summary.totalTokens).toBe(120);
  expect(view.days[14].classes).toEqual({ state: "unavailable" });
  expect(view.summary.money.capturedCost).toBeNull();
});
it("does not acknowledge partial lines, handles replacement/truncation, and never saves raw messages", async () => {
  const f = await fixture([
    header(),
    turn(),
    { type: "response_item", payload: { text: "synthetic-private-sentinel" } },
  ]);
  await f.prepare();
  const full = JSON.stringify(usage("partial"));
  await appendFile(f.file, full.slice(0, 80));
  const pending = await f.history.prepare!(f.context);
  expect(pending).toMatchObject({ state: "available", ingestionPending: true });
  expect((await f.report()).summary.totalTokens).toBe(0);
  await appendFile(f.file, full.slice(80) + "\n");
  await f.prepare();
  expect((await f.report()).summary.totalTokens).toBe(120);
  await writeFile(f.file, text([header(), turn(), usage("partial"), usage("new")]));
  await f.prepare();
  expect((await f.report()).summary.totalTokens).toBe(240);
  const bytes = await readFile(f.path);
  expect(bytes.includes(Buffer.from("synthetic-private-sentinel"))).toBe(false);
});
it("rolls back unacknowledged admission on cancellation and reopens without replay inflation", async () => {
  const controller = new AbortController();
  let cancel = true;
  const f = await fixture([header(), turn(), usage()], {
    read: () => {
      if (cancel) controller.abort();
    },
  });
  expect(await f.history.prepare!({ ...f.context, signal: controller.signal })).toEqual({
    state: "unavailable",
    reason: "selection-changed",
  });
  cancel = false;
  await f.prepare(f.make());
  expect((await f.report()).summary.totalTokens).toBe(120);
});
it("rejects symlink escapes and oversized lines with visible incomplete work", async () => {
  const f = await fixture([header(), turn(), usage()]);
  await writeFile(join(f.root, "outside.jsonl"), text([header(), turn(), usage("outside")]));
  await symlink(join(f.root, "outside.jsonl"), join(f.sessions, "escape.jsonl"));
  await writeFile(
    join(f.sessions, "oversize.jsonl"),
    text([header(), turn()]) + "x".repeat(1024 * 1024 + 1) + "\n",
  );
  const result = await f.history.prepare!(f.context);
  expect(result).toMatchObject({ state: "available", ingestionPending: true });
  const view = await f.report();
  expect(view.summary.totalTokens).toBe(120);
  expect(view.days[14].coverage.state).toBe("incomplete");
});
it("bounds discovery/lines, eventually revisits files, and gives native identity only to the matching provider and host", async () => {
  const f = await fixture([header(), turn(), usage("base")], { lines: 3 });
  for (let i = 0; i < 135; i++)
    await writeFile(join(f.sessions, `${i}.jsonl`), text([header(), turn(), usage(`file${i}`)]));
  await f.prepare();
  expect((await f.report()).summary.totalTokens).toBe(136 * 120);
  f.context.identities = {
    hostId: "host_fixture",
    generation: 2,
    offset: 0,
    total: 2,
    rows: [
      {
        threadId: "thr_native",
        provider: "codex-native",
        providerIdentity: "native-A",
        title: "Native fixture",
        state: "available",
      },
      { threadId: "thr_pi", providerIdentity: "native-A", title: "Pi fixture", state: "available" },
    ],
  } as typeof f.context.identities;
  await f.prepare();
  const report = await f.report({ ...query, group: "thread" });
  expect(report.ranking.map((row) => row.key)).toEqual(["thr_native"]);
}, 15_000);
it("supports schema-4 read-only Normal projection and transactional writer migration", async () => {
  const f = await fixture([header(), turn()]);
  await f.prepare();
  let db = (await openHistoryDatabase(f.path))!;
  db.transaction(() => projectCompactRecord(db, parseCompact(JSON.stringify(pi()), false)!));
  db.exec(
    "DROP TABLE usage_metadata;DROP TABLE usage_response_owners;DROP TABLE native_sources;DROP TABLE native_discovery;PRAGMA user_version=4",
  );
  db.close();
  const before = await readFile(f.path);
  expect((await f.report()).summary.speedTokens).toEqual({ normal: 20, fast: 0, ultrafast: 0 });
  expect(await readFile(f.path)).toEqual(before);
  await f.prepare();
  db = (await openHistoryDatabase(f.path, true))!;
  expect(db.prepare("PRAGMA user_version").get()).toEqual({ user_version: 5 });
  db.close();
});
it("compact speed survives detail expiry, physical expiry removes numbers, and expired rescans cannot restore them", async () => {
  const f = await fixture([header(), turn(), usage("retained", 120, { service_tier: "fast" })]);
  await f.prepare();
  let db = (await openHistoryDatabase(f.path))!;
  maintainHistory(db, Date.parse("2026-11-10T12:00:00Z"));
  db.close();
  expect((await f.report()).summary.speedTokens).toEqual({ normal: 0, fast: 120, ultrafast: 0 });
  expect((await f.report()).days[14].classes.state).toBe("unavailable");
  db = (await openHistoryDatabase(f.path))!;
  maintainHistory(db, Date.parse("2027-02-01T12:00:00Z"));
  expect(db.prepare("SELECT count(*) AS n FROM usage_metadata").get()).toEqual({ n: 0 });
  expect(db.prepare("SELECT count(*) AS n FROM usage_compact").get()).toEqual({ n: 0 });
  const replayOwners = db.prepare("SELECT * FROM usage_response_owners").all();
  expect(replayOwners).toHaveLength(1);
  db.close();
  await writeFile(join(f.home, "archived_sessions", "copied.jsonl"), await readFile(f.file));
  await writeFile(f.file, text([header(), turn(), usage("retained")]));
  await f.prepare(f.make());
  expect(await f.history.report(query, f.context)).toMatchObject({
    state: "unavailable",
    reason: "range-unavailable",
  });
  db = (await openHistoryDatabase(f.path, true))!;
  expect(db.prepare("SELECT count(*) AS n FROM usage_compact").get()).toEqual({ n: 0 });
  expect(db.prepare("SELECT count(*) AS n FROM usage_metadata").get()).toEqual({ n: 0 });
  expect(db.prepare("SELECT * FROM usage_response_owners").all()).toEqual(replayOwners);
  db.close();
});

it("drains existing Pi logs even while native oversized work stays pending", async () => {
  const f = await fixture([header(), turn(), usage()]);
  await f.prepare();
  const db = (await openHistoryDatabase(f.path))!;
  db.prepare("INSERT INTO collector_meta VALUES (1,?)").run(new Date(now).toISOString());
  db.close();
  await writeFile(
    join(f.dataDir, "history", "collector-control-v1.json"),
    JSON.stringify({
      protocol: 2,
      enabled: false,
      revision: "00000000-0000-4000-8000-000000000099",
    }),
  );
  await writeFile(join(f.dataDir, "history", "events-v1-2026-10-01.jsonl"), text([pi()]));
  await writeFile(join(f.sessions, "oversize.jsonl"), "x".repeat(1024 * 1024 + 1) + "\n");
  const pending = await f.history.prepare!(f.context);
  expect(pending).toMatchObject({ state: "available", ingestionPending: true });
  expect((await f.report()).summary).toMatchObject({
    totalTokens: 140,
    speedTokens: { normal: 140, fast: 0, ultrafast: 0 },
  });
});

it("rejects a symlinked native root without admitting outside records", async () => {
  const f = await fixture([header(), turn(), usage()]);
  const outside = join(f.root, "outside-sessions");
  await rename(f.sessions, outside);
  await symlink(outside, f.sessions);
  expect(await f.history.prepare!(f.context)).toMatchObject({ state: "available" });
  const report = await f.report();
  expect(report.summary.totalTokens).toBe(0);
  expect(report.days[14].coverage.state).toBe("incomplete");
});

it("does not acknowledge or admit a source replaced after its descriptor opens", async () => {
  let replace = true;
  const f = await fixture([header(), turn(), usage()], {
    read: () => {
      if (!replace) return;
      replace = false;
      renameSync(f.file, join(f.root, "original.jsonl"));
      writeFileSync(f.file, text([header(), turn(), usage("replacement")]));
    },
  });
  expect(await f.history.prepare!(f.context)).toEqual({
    state: "unavailable",
    reason: "storage-unavailable",
  });
  expect((await f.report()).summary.totalTokens).toBe(0);
  await f.prepare();
  expect((await f.report()).summary.totalTokens).toBe(120);
});

it("rolls back schema-4 migration, facts and controls when version publication fails", async () => {
  const f = await fixture([header(), turn()]);
  await f.prepare();
  const db = (await openHistoryDatabase(f.path))!;
  db.transaction(() => projectCompactRecord(db, parseCompact(JSON.stringify(pi()), false)!));
  db.exec(
    "DROP TABLE usage_metadata;DROP TABLE usage_response_owners;DROP TABLE native_sources;DROP TABLE native_discovery;PRAGMA user_version=4",
  );
  db.close();
  const before = await readFile(f.path);
  const real = (await loadHistoryStorage())!;
  const failing = createHostHistory({
    now: () => now,
    codexHome: () => f.home,
    storage: async () => (path, readonly) => {
      const opened = real(path, readonly);
      return {
        ...opened,
        exec(sql) {
          if (/PRAGMA user_version = 5/u.test(sql)) throw Error("synthetic-publication-failure");
          opened.exec(sql);
        },
      };
    },
  });
  histories.push(failing);
  expect(await failing.prepare!(f.context)).toEqual({
    state: "unavailable",
    reason: "storage-unavailable",
  });
  expect(await readFile(f.path)).toEqual(before);
  expect((await f.report()).summary.speedTokens).toEqual({ normal: 20, fast: 0, ultrafast: 0 });
  expect(await readdir(join(f.dataDir, "history"))).toEqual(["usage-v1.sqlite"]);
});

it("drains the 80-token Pi backlog when native descriptor replacement fails and keeps manual retry replay-safe", async () => {
  let replace = false;
  const f = await fixture([header(), turn(), usage()], {
    read: () => {
      if (!replace) return;
      replace = false;
      renameSync(f.file, join(f.root, "original.jsonl"));
      writeFileSync(f.file, text([header(), turn(), usage("replacement")]));
    },
  });
  await f.prepare();
  const db = (await openHistoryDatabase(f.path))!;
  db.prepare("INSERT INTO collector_meta VALUES (1,?)").run(new Date(now).toISOString());
  db.close();
  await writeFile(
    join(f.dataDir, "history", "collector-control-v1.json"),
    JSON.stringify({
      protocol: 2,
      enabled: false,
      revision: "00000000-0000-4000-8000-000000000099",
    }),
  );
  await writeFile(join(f.dataDir, "history", "events-v1-2026-10-01.jsonl"), text([pi(3, 80)]));
  await appendFile(f.file, text([usage("unacknowledged")]));
  replace = true;
  expect(await f.history.prepare!(f.context)).toEqual({
    state: "unavailable",
    reason: "storage-unavailable",
  });
  expect((await f.report()).summary).toMatchObject({
    totalTokens: 200,
    speedTokens: { normal: 200, fast: 0, ultrafast: 0 },
  });
  await f.prepare();
  expect((await f.report()).summary.totalTokens).toBe(320);
  await f.prepare(f.make());
  expect((await f.report()).summary.totalTokens).toBe(320);
});

for (const field of ["id", "cwd"])
  it.each([0, 10, 31, 127])(
    "rejects native owning " + field + " with control code %s while retaining valid usage",
    async (code) => {
      const f = await fixture([header(), turn(), usage()]);
      const invalid =
        field === "id"
          ? `native-${String.fromCharCode(code)}-bad`
          : `/fixture/${String.fromCharCode(code)}bad`;
      await writeFile(
        join(f.sessions, "invalid-owner.jsonl"),
        text([
          header("invalid-A", { [field]: invalid }),
          turn(),
          usage("invalid", 120, { thread_id: field === "id" ? invalid : "invalid-A" }),
        ]),
      );
      await f.prepare();
      const report = await f.report();
      expect(report.summary).toMatchObject({
        totalTokens: 120,
        speedTokens: { normal: 120, fast: 0, ultrafast: 0 },
      });
      expect(report.days[14].coverage.state).toBe("incomplete");
    },
  );
