import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = await realpath(await mkdtemp(join(tmpdir(), "codex-native-usage-bundle-")));
const priorHome = process.env.CODEX_HOME,
  originalDate = Date,
  originalFetch = globalThis.fetch;
const now = Date.parse("2026-10-01T12:00:00Z");
let bundled;
try {
  globalThis.Date = class extends originalDate {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
    }
  };
  globalThis.fetch = async () => {
    throw Error("Network forbidden");
  };
  process.env.CODEX_HOME = join(root, "codex");
  await mkdir(join(process.env.CODEX_HOME, "sessions"), { recursive: true });
  await mkdir(join(process.env.CODEX_HOME, "archived_sessions"));
  const source = await readFile(new URL("../fixtures/native-legacy-usage.jsonl", import.meta.url));
  const file = join(process.env.CODEX_HOME, "sessions", "rollout.jsonl");
  await writeFile(file, source);
  const artifact = join(root, "host.mjs");
  await writeFile(artifact, await readFile(new URL("../dist/host.js", import.meta.url)));
  bundled = await import(pathToFileURL(artifact).href);
  const signal = new AbortController().signal;
  const context = {
    signal,
    lifecycle: { signal },
    experimental_paths: { dataDir: join(root, "data"), tempDir: join(root, "temp") },
  };
  await mkdir(context.experimental_paths.dataDir);
  const identities = { hostId: "host_fixture", generation: 1, offset: 0, total: 0, rows: [] };
  async function prepare(ctx = context) {
    for (let i = 0; i < 100; i++) {
      const value = await bundled.default.handlers.reportPreparation({ identities }, ctx);
      assert.equal(value.state, "available");
      if (!value.ingestionPending && !value.attribution.backlog) return;
    }
    throw Error("Preparation did not settle");
  }
  const query = {
    startDate: "2026-09-02",
    timezone: "UTC",
    group: "workspace",
    scope: { kind: "host" },
  };
  await prepare();
  const legacyNative = await bundled.default.handlers.calendarReport(query, context);
  assert.equal(legacyNative.summary.totalTokens, 370);
  assert.deepEqual(
    legacyNative.days.flatMap((day) => day.models?.named ?? []),
    [{ model: "synthetic", totalTokens: 370 }],
  );
  const directory = join(context.experimental_paths.dataDir, "history"),
    path = join(directory, "usage-v1.sqlite");
  let db = await bundled.openHistoryDatabase(path);
  db.prepare("INSERT INTO collector_meta VALUES (1,?)").run(new Date(now).toISOString());
  db.close();
  const control = JSON.stringify({
    protocol: 2,
    enabled: false,
    revision: "00000000-0000-4000-8000-000000000099",
  });
  await writeFile(join(directory, "collector-control-v1.json"), control);
  await writeFile(
    join(directory, "events-v1-2026-10-01.jsonl"),
    await readFile(new URL("../fixtures/pi-legacy-usage.jsonl", import.meta.url)),
  );
  await prepare();
  const report = await bundled.default.handlers.calendarReport(query, context);
  assert.equal(report.state, "partial");
  assert.equal(report.summary.totalTokens, 450);
  assert(!/speedTokens|otherSpeedTokens/.test(JSON.stringify(report)));
  assert.equal(report.summary.money.capturedCost, 0.03);
  const modelRows = report.days.flatMap((day) => day.models?.named ?? []);
  assert.deepEqual(modelRows, [{ model: "synthetic", totalTokens: 450 }]);
  assert.equal(report.summary.money.pricedRecords, 1);
  await prepare();
  await prepare();
  assert.equal(
    (await bundled.default.handlers.calendarReport(query, context)).summary.totalTokens,
    450,
  );
  const bytes = await readFile(path);
  await bundled.default.handlers.calendarReport(query, context);
  assert.deepEqual(await readFile(path), bytes);
  assert.deepEqual(await readFile(file), source);
  assert.equal(await readFile(join(directory, "collector-control-v1.json"), "utf8"), control);
  db = await bundled.openHistoryDatabase(path, true);
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 5);
  assert.deepEqual(
    { ...db.prepare("SELECT observed_events,unconfirmed_events FROM history_counters").get() },
    { observed_events: 2, unconfirmed_events: 2 },
  );
  db.close();
  const installed =
    source
      .toString("utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const row = JSON.parse(line);
        delete row.payload.service_tier;
        return JSON.stringify(row);
      })
      .join("\n") + "\n";
  await writeFile(file, installed);
  const nativeContext = {
    ...context,
    experimental_paths: { ...context.experimental_paths, dataDir: join(root, "installed-format") },
  };
  await mkdir(nativeContext.experimental_paths.dataDir);
  await prepare(nativeContext);
  const normal = await bundled.default.handlers.calendarReport(query, nativeContext);
  assert.equal(normal.summary.totalTokens, 370);
  assert(!/speedTokens|otherSpeedTokens/.test(JSON.stringify(normal)));
  assert.deepEqual(
    normal.days.flatMap((day) => day.models?.named ?? []),
    [{ model: "synthetic", totalTokens: 370 }],
  );
  console.log(
    JSON.stringify({
      passed: true,
      entry: "dist/host.js handlers.reportPreparation/calendarReport",
      models: modelRows,
      totalTokens: 450,
      capturedPiCost: 0.03,
      nativeOnlyTokens: normal.summary.totalTokens,
      readOnly: true,
      replaySafe: true,
    }),
  );
} finally {
  bundled?.default.dispose?.();
  globalThis.Date = originalDate;
  globalThis.fetch = originalFetch;
  if (priorHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = priorHome;
  await rm(root, { recursive: true, force: true });
}
