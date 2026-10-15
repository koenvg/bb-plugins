import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, readdir, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createHostHistory } from "./history-host.js";
import { openHistoryDatabase } from "./storage/history-storage.js";
import { packagedCollectorAsset } from "./collection/collector-compatibility.js";
import { readFileSync } from "node:fs";
import { loadHistoryStorage } from "./storage/history-storage.js";

const publicationFailure = vi.hoisted(() => ({ control: "" }));
vi.mock("node:fs/promises", async (original) => {
  const filesystem = await original<typeof import("node:fs/promises")>();
  return {
    ...filesystem,
    rename: async (
      from: Parameters<typeof filesystem.rename>[0],
      to: Parameters<typeof filesystem.rename>[1],
    ) => {
      if (to === publicationFailure.control) throw Error("private-publication-failure");
      return filesystem.rename(from, to);
    },
  };
});
const roots: string[] = [];
afterEach(async () => {
  publicationFailure.control = "";
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bbp235-"));
  roots.push(root);
  const agent = join(root, "agent"),
    dataDir = join(root, "data");
  await mkdir(agent);
  await writeFile(join(agent, "settings.json"), "unrelated-settings");
  const history = createHostHistory({ agentDir: () => agent, now: () => Date.UTC(2026, 9, 1) });
  const context = { dataDir, signal: new AbortController().signal };
  await history.control("install", context);
  const asset = join(agent, "extensions/bb-codex-usage/index.js");
  const control = join(dataDir, "history/collector-control-v1.json");
  return { root, agent, dataDir, history, context, asset, control };
}

it.each([true, false])(
  "repairs existing bytes preserving capture enabled=%s and retained SQLite totals",
  async (enabled) => {
    const f = await fixture();
    if (!enabled) await f.history.control("pause", f.context);
    const db = await openHistoryDatabase(join(f.dataDir, "history/usage-v1.sqlite"));
    db!.prepare("INSERT INTO workspace_totals VALUES (?,?,?)").run("/retained", 42, 2);
    db!.close();
    await writeFile(f.asset, "ordinary old collector");
    const result = await f.history.repairExisting(f.context);
    expect(result).toMatchObject({
      kind: "repaired",
      preserved: {
        enabled,
        firstObservedAt: "2026-10-01T00:00:00.000Z",
        pauseCount: enabled ? 0 : 1,
      },
      readiness: {
        state: "available",
        reason: "ok",
        storage: "compatible",
        collector: "compatible-v1",
        collection: {
          enabled,
          firstObservedAt: "2026-10-01T00:00:00.000Z",
          pauseCount: enabled ? 0 : 1,
          workspaces: [{ workspace: "/retained", totalTokens: 42, events: 2 }],
        },
      },
    });
    expect(await readFile(f.asset, "utf8")).toBe(packagedCollectorAsset(f.dataDir));
    expect(JSON.parse(await readFile(f.control, "utf8"))).toEqual({
      protocol: 2,
      enabled,
      revision: expect.stringMatching(/^[a-f0-9-]{36}$/),
    });
    expect(await readFile(join(f.agent, "settings.json"), "utf8")).toBe("unrelated-settings");
    const before = await readFile(f.control);
    const assetBefore = await lstat(f.asset);
    expect(await f.history.repairExisting(f.context)).toMatchObject({
      kind: "unchanged",
      reason: "collector-compatible",
    });
    expect(await readFile(f.control)).toEqual(before);
    const assetAfter = await lstat(f.asset);
    expect({ ino: assetAfter.ino, modified: assetAfter.mtimeMs }).toEqual({
      ino: assetBefore.ino,
      modified: assetBefore.mtimeMs,
    });
    f.history.dispose();
  },
);

it.each(["missing", "parent-missing", "symlink", "oversized"])(
  "refuses %s assets without creating paths or publishing control",
  async (state) => {
    const f = await fixture();
    const before = await readFile(f.control);
    if (state === "parent-missing")
      await rm(join(f.agent, "extensions/bb-codex-usage"), { recursive: true });
    else if (state === "oversized") await writeFile(f.asset, "x".repeat(65537));
    else {
      await rm(f.asset);
      if (state === "symlink") await symlink(join(f.agent, "settings.json"), f.asset);
    }
    const result = await f.history.repairExisting(f.context);
    expect(result).toMatchObject({
      kind: "refused",
      reason: state.includes("missing") ? "collector-missing" : "unsafe-collector",
    });
    expect(await readFile(f.control)).toEqual(before);
    if (state.includes("missing"))
      await expect(readFile(f.asset)).rejects.toMatchObject({ code: "ENOENT" });
    else
      expect(await readFile(f.asset, "utf8")).toBe(
        state === "symlink" ? "unrelated-settings" : "x".repeat(65537),
      );
    f.history.dispose();
  },
);

it.each(["missing", "malformed", "symlink", "oversized"])(
  "refuses %s control without repairing the asset",
  async (state) => {
    const f = await fixture();
    await writeFile(f.asset, "old");
    if (state === "missing" || state === "symlink") await rm(f.control);
    if (state === "symlink") await symlink(join(f.agent, "settings.json"), f.control);
    if (state === "malformed") await writeFile(f.control, '{"enabled":true}');
    if (state === "oversized") await writeFile(f.control, "x".repeat(1025));
    expect(await f.history.repairExisting(f.context)).toMatchObject({ kind: "refused" });
    expect(await readFile(f.asset, "utf8")).toBe("old");
    expect(await readdir(join(f.agent, "extensions/bb-codex-usage"))).toEqual(["index.js"]);
    f.history.dispose();
  },
);

it("uses queued eligibility rather than an earlier readiness, including a queued pause and removal", async () => {
  const f = await fixture();
  await writeFile(f.asset, "old");
  expect(await f.history.read(f.context)).toMatchObject({ reason: "collector-incompatible" });
  const pause = f.history.control("pause", f.context);
  const repair = f.history.repairExisting(f.context);
  await pause;
  expect(await repair).toMatchObject({
    kind: "repaired",
    preserved: { enabled: false, pauseCount: 1 },
  });
  await rm(f.asset);
  expect(await f.history.repairExisting(f.context)).toMatchObject({
    kind: "refused",
    reason: "collector-missing",
  });
  f.history.dispose();
});

it("cancellation settles the caller but retains the real queue turn", async () => {
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let opens = 0;
  const history = createHostHistory({
    storage: async () => {
      if (++opens === 1) {
        entered();
        await held;
      }
      return null;
    },
  });
  const controller = new AbortController();
  const pending = history.repairExisting({ dataDir: "/unused", signal: controller.signal });
  await started;
  controller.abort();
  const queued = history.read({ dataDir: "/unused", signal: new AbortController().signal });
  try {
    expect(await pending).toEqual({
      kind: "unavailable",
      reason: "canceled",
      hostWork: "may-have-run",
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(opens).toBe(1);
    release();
    expect(await queued).toEqual({
      state: "unavailable",
      reason: "storage-unavailable",
      storage: "unavailable",
      collector: "unchecked",
      writer: "unconfirmed",
    });
    expect(opens).toBe(2);
  } finally {
    release();
    history.dispose();
  }
});

it.each(["asset", "control"])(
  "never reports repaired after failed %s publication",
  async (failed) => {
    const f = await fixture();
    await f.history.control("pause", f.context);
    await writeFile(f.asset, "old");
    const before = await readFile(f.control);
    publicationFailure.control = failed === "asset" ? f.asset : f.control;
    expect(await f.history.repairExisting(f.context)).toEqual({
      kind: "unavailable",
      reason: "verification-failed",
      hostWork: "may-have-run",
    });
    expect(await readFile(f.asset, "utf8")).toBe(
      failed === "asset" ? "old" : packagedCollectorAsset(f.dataDir),
    );
    expect(await readFile(f.control)).toEqual(before);
    expect(await readdir(join(f.agent, "extensions/bb-codex-usage"))).toEqual(["index.js"]);
    expect(
      (await readdir(join(f.dataDir, "history"))).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
    f.history.dispose();
  },
);

it("does one bounded mutable pass and verifies without ingesting a second batch", async () => {
  const f = await fixture();
  f.history.dispose();
  const history = createHostHistory({
    agentDir: () => f.agent,
    now: () => Date.UTC(2026, 9, 1),
    ingestRows: 1,
  });
  const log = join(f.dataDir, "history/events-v1-2026-10-01.jsonl");
  const records = [1, 2, 3]
    .map(
      (id) =>
        JSON.stringify({
          version: 1,
          eventId: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
          provenance: "observed",
          occurredAt: "2026-10-01T00:00:00.000Z",
          sessionId: "synthetic",
          workspace: "/retained",
          providerSessionKey: "synthetic.jsonl",
          claimedThreadId: null,
          provider: "openai-codex",
          model: "gpt-5",
          inputTokens: 2,
          outputTokens: 3,
          cacheReadTokens: 1,
          cacheWriteTokens: 0,
          reasoningTokens: 0,
          totalTokens: 6,
          capturedCost: null,
        }) + "\n",
    )
    .join("");
  await writeFile(log, records);
  await writeFile(f.asset, "old");
  const result = await history.repairExisting(f.context);
  expect(result).toMatchObject({
    kind: "repaired",
    readiness: {
      writer: "observed",
      collection: {
        backlog: true,
        workspaces: [{ workspace: "/retained", totalTokens: 6, events: 1 }],
      },
    },
  });
  expect(await readFile(log, "utf8")).toBe(records);
  const db = await openHistoryDatabase(join(f.dataDir, "history/usage-v1.sqlite"), true);
  expect(db!.prepare("SELECT count(*) AS n FROM usage_events").get()).toEqual({ n: 1 });
  db!.close();
  history.dispose();
});

it.each(["unsupported-storage", "invalid-collection", "import-only"])(
  "refuses %s without asset/control publication",
  async (state) => {
    const f = await fixture();
    await writeFile(f.asset, "old");
    const db = await openHistoryDatabase(join(f.dataDir, "history/usage-v1.sqlite"));
    if (state === "unsupported-storage") db!.exec("PRAGMA user_version=99");
    if (state === "invalid-collection")
      db!.exec("UPDATE collector_meta SET first_observed='invalid'");
    if (state === "import-only") {
      db!.exec("DELETE FROM collector_meta");
      await rm(f.control);
    }
    db!.close();
    const control = state === "import-only" ? null : await readFile(f.control);
    expect(await f.history.repairExisting(f.context)).toMatchObject({
      kind: "refused",
      reason: state !== "import-only" ? "storage-ineligible" : "collection-invalid",
    });
    expect(await readFile(f.asset, "utf8")).toBe("old");
    if (control) expect(await readFile(f.control)).toEqual(control);
    else await expect(readFile(f.control)).rejects.toMatchObject({ code: "ENOENT" });
    f.history.dispose();
  },
);

it("refuses an unsupported collector runtime without changing capture", async () => {
  const f = await fixture();
  const control = await readFile(f.control);
  const asset = await readFile(f.asset);
  vi.stubGlobal("process", { ...process, versions: { ...process.versions, node: "20.0.0" } });
  try {
    expect(await f.history.repairExisting(f.context)).toMatchObject({
      kind: "refused",
      reason: "runtime-unsupported",
    });
    expect(await readFile(f.asset)).toEqual(asset);
    expect(await readFile(f.control)).toEqual(control);
  } finally {
    vi.unstubAllGlobals();
    f.history.dispose();
  }
});

it("does not report success when read-back fails after both durable publications", async () => {
  const f = await fixture();
  await f.history.control("pause", f.context);
  await writeFile(f.asset, "old");
  const before = await readFile(f.control, "utf8");
  f.history.dispose();
  const factory = (await loadHistoryStorage())!;
  const history = createHostHistory({
    agentDir: () => f.agent,
    now: () => Date.UTC(2026, 9, 1),
    storage: async () => (path, readonly) => {
      if (readFileSync(f.asset, "utf8") !== "old") throw Error("private-readback-failure");
      return factory(path, readonly);
    },
  });
  expect(await history.repairExisting(f.context)).toEqual({
    kind: "unavailable",
    reason: "verification-failed",
    hostWork: "may-have-run",
  });
  expect(await readFile(f.asset, "utf8")).toBe(packagedCollectorAsset(f.dataDir));
  const published = JSON.parse(await readFile(f.control, "utf8"));
  expect(published).toEqual({
    protocol: 2,
    enabled: false,
    revision: expect.stringMatching(/^[a-f0-9-]{36}$/),
  });
  expect(published.revision).not.toBe(JSON.parse(before).revision);
  history.dispose();
});

it("rechecks missing eligibility after waiting behind uncooperative queued work", async () => {
  const f = await fixture();
  await writeFile(f.asset, "old");
  expect(await f.history.read(f.context)).toMatchObject({ reason: "collector-incompatible" });
  f.history.dispose();
  const factory = (await loadHistoryStorage())!;
  let release!: () => void,
    entered!: () => void,
    loads = 0;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const history = createHostHistory({
    agentDir: () => f.agent,
    now: () => Date.UTC(2026, 9, 1),
    storage: async () => {
      if (++loads === 1) {
        entered();
        await held;
      }
      return factory;
    },
  });
  const active = history.read(f.context);
  await started;
  const repair = history.repairExisting(f.context);
  const control = await readFile(f.control);
  await rm(f.asset);
  release();
  await active;
  expect(await repair).toMatchObject({ kind: "refused", reason: "collector-missing" });
  expect(await readFile(f.control)).toEqual(control);
  await expect(readFile(f.asset)).rejects.toMatchObject({ code: "ENOENT" });
  history.dispose();
});
