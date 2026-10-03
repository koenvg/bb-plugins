import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import { createQuotaHostEntry } from "./host.js";
import { createHostHistory } from "./history-host.js";
import { openHistoryDatabase } from "./history-storage.js";

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bbp17-history-")); roots.push(root);
  const paths = { dataDir: join(root, "data"), tempDir: join(root, "temp") };
  const history = createHostHistory({ agentDir: () => join(root, "agent") });
  return { root, paths, history, context: { signal: new AbortController().signal, dataDir: paths.dataDir } };
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("host-local readiness", () => {
  it("does not create storage, install an extension, use auth, or fetch on a quota-only read", async () => {
    const { root, paths, history } = await fixture();
    const entry = createQuotaHostEntry({ auth: async () => { throw Error("must not authenticate"); }, read: async () => { throw Error("must not fetch"); }, history });
    const harness = experimental_createHostEntryHarness(entry, { experimental_paths: paths });
    expect(await harness.experimental_call("historyReadiness", null)).toEqual({
      state: "not-configured", reason: "not-configured", storage: "unconfigured", collector: "missing", writer: "unconfirmed",
    });
    expect(await readdir(root)).toEqual([]);
    expect(harness.experimental_getRetainedWorkerLeaseCount()).toBe(0);
    await harness.experimental_dispose();
  });

  it("uses fixed missing-capability diagnostics and leaves quota independently callable", async () => {
    const { paths } = await fixture();
    const history = createHostHistory({ storage: async () => null, agentDir: () => "/not-used" });
    const entry = createQuotaHostEntry({ history, auth: async () => ({ status: "auth-required" }), read: async () => { throw Error("not called"); } });
    const harness = experimental_createHostEntryHarness(entry, { experimental_paths: paths });
    expect(await harness.experimental_call("historyReadiness", null)).toEqual({ state: "unavailable", reason: "storage-unavailable", storage: "unavailable", collector: "unchecked", writer: "unconfirmed" });
    expect(await harness.experimental_call("quota", {})).toEqual({ state: "unavailable", reason: "auth-required", snapshot: null });
    await harness.experimental_dispose();
  });

  it("rejects canceled reads before touching storage", async () => {
    const { history, context } = await fixture();
    expect(await history.read({ ...context, signal: AbortSignal.abort() })).toMatchObject({ state: "unavailable", reason: "selection-changed" });
  });

  it("keeps a newer database byte-for-byte unchanged", async () => {
    const { paths, context, history } = await fixture();
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(paths.dataDir, "history"), { recursive: true });
    const path = join(paths.dataDir, "history/usage-v1.sqlite");
    const db = await openHistoryDatabase(path); if (!db) throw Error("test SQLite required");
    db.exec("PRAGMA user_version = 99"); db.close();
    const bytes = await readFile(path);
    expect(await history.read(context)).toMatchObject({ reason: "storage-incompatible", storage: "incompatible" });
    expect(await readFile(path)).toEqual(bytes);
  });

  it("reports collector runtime incompatibility without hiding compatible storage", async () => {
    const { context } = await fixture();
    const history = createHostHistory({ collector: async () => "incompatible" });
    expect(await history.read(context)).toEqual({ state: "unavailable", reason: "collector-incompatible", storage: "unconfigured", collector: "incompatible", writer: "unconfirmed" });
  });
  it("discards a late capability result after host lifecycle cancellation", async () => {
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    const { paths } = await fixture();
    const history = createHostHistory({ storage: async () => { await delayed; return null; } });
    const entry = createQuotaHostEntry({ history, auth: async () => ({ status: "auth-required" }), read: async () => { throw Error("not called"); } });
    const harness = experimental_createHostEntryHarness(entry, { experimental_paths: paths });
    const pending = harness.experimental_call("historyReadiness", null);
    await harness.experimental_dispose(); release();
    expect(await pending).toMatchObject({ reason: "selection-changed" });
  });
});
