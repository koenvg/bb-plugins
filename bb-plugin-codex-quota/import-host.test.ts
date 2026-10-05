import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import { createHostHistory } from "./history-host.js";
import { createQuotaHostEntry } from "./host.js";
import { createImportHandler } from "./import-routing.js";
import { openHistoryDatabase } from "./history-storage.js";
import { execFileSync } from "node:child_process";
import { unlink } from "node:fs/promises";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bbp22-host-"));
  roots.push(root);
  const source = join(root, "source"),
    workspace = join(root, "workspace");
  await mkdir(source);
  await mkdir(workspace);
  const paths = { dataDir: join(root, "data"), tempDir: join(root, "temp") };
  let reads = 0;
  const history = createHostHistory({
    agentDir: () => join(root, "agent"),
    now: () => Date.parse("2026-10-03T00:00:00.000Z"),
    bodyRead: () => reads++,
  });
  const entry = createQuotaHostEntry({
    history,
    auth: async () => ({ status: "auth-required" }),
    read: async () => {
      throw Error("No account request");
    },
  });
  const harness = experimental_createHostEntryHarness(entry, {
    experimental_paths: paths,
  });
  const input = (command: any) => ({
    hostId: "host-a",
    command,
    knownWorkspaces: [workspace],
  });
  const configure = () =>
    harness.experimental_call(
      "historicalImport",
      input({
        action: "configure",
        configuration: {
          bbRoot: source,
          ordinaryRoots: [],
          workspaces: [workspace],
        },
      }),
    );
  const identities = {
    hostId: "host-a",
    generation: 1,
    offset: 0,
    total: 1,
    rows: [
      {
        providerIdentity: "provider-a",
        threadId: "thr_a",
        title: null,
        state: "available" as const,
      },
    ],
  };
  await writeFile(
    join(source, "provider-a.jsonl"),
    [
      {
        type: "session",
        version: 3,
        id: "pi-a",
        cwd: workspace,
        timestamp: "2026-10-01T00:00:00.000Z",
      },
      {
        type: "message",
        id: "e-a",
        parentId: null,
        message: {
          role: "assistant",
          provider: "openai-codex",
          model: "synthetic",
          timestamp: Date.parse("2026-10-01T00:00:00.000Z"),
          content: "PRIVATE_SYNTHETIC_TEXT",
          usage: {
            input: 1,
            output: 1,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 2,
            cost: { total: 0 },
          },
        },
      },
    ]
      .map(JSON.stringify)
      .join("\n") + "\n",
  );
  return {
    root,
    source,
    workspace,
    paths,
    history,
    harness,
    input,
    configure,
    identities,
    reads: () => reads,
  };
}
it("opens status without setup, supports import-only storage, persists reload and releases every lease", async () => {
  const f = await fixture();
  try {
    expect(
      (await f.harness.experimental_call("historicalImport", f.input({ action: "status" }))).reason,
    ).toBe("not-configured");
    expect(await f.configure()).toMatchObject({ reason: "ok" });
    const ready = await f.harness.experimental_call("historyReadiness", {
      identities: f.identities,
    });
    expect(ready.state).toBe("not-configured");
    expect(ready.attribution?.discovery).toBe("complete");
    expect(f.reads()).toBe(0);
    await f.harness.experimental_call("historicalImport", f.input({ action: "start" }));
    expect(f.harness.experimental_getRetainedWorkerLeaseCount()).toBe(0);
    await f.harness.experimental_dispose();
    const history = createHostHistory({
      agentDir: () => join(f.root, "agent"),
    });
    const context = {
      dataDir: f.paths.dataDir,
      hostId: "host-a",
      knownWorkspaces: [f.workspace],
      signal: new AbortController().signal,
    };
    const saved = await history.controlImport!({ action: "status" }, context);
    expect(saved.generation?.state).toBe("stopped");
    expect(saved.generation?.bytes).toBe(0);
    let view = saved;
    for (let i = 0; i < 10 && view.generation?.state === "stopped"; i++)
      view = await history.controlImport!({ action: "resume" }, context);
    expect(view.generation?.state).toBe("completed");
    const db = (await openHistoryDatabase(join(f.paths.dataDir, "history/usage-v1.sqlite"), true))!;
    try {
      expect(db.prepare("SELECT total_tokens FROM workspace_totals").get()).toEqual({
        total_tokens: 2,
      });
      expect(db.prepare("SELECT * FROM collector_meta").all()).toEqual([]);
      expect(JSON.stringify(db.prepare("SELECT payload FROM usage_events").all())).not.toContain(
        "PRIVATE_",
      );
    } finally {
      db.close();
    }
    const install = await history.control("install", context);
    expect(install.state).toBe("available");
    expect(install.collection?.workspaces[0].totalTokens).toBe(2);
  } finally {
    await f.harness.experimental_dispose();
  }
});
it("leaves newer schemas untouched and quota usable", async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.paths.dataDir, "history"), { recursive: true });
    const path = join(f.paths.dataDir, "history/usage-v1.sqlite");
    const db = (await openHistoryDatabase(path))!;
    db.exec("PRAGMA user_version=99");
    db.close();
    const before = await readFile(path);
    expect((await f.configure()).reason).toBe("storage-incompatible");
    expect(await readFile(path)).toEqual(before);
    expect(await f.harness.experimental_call("quota", {})).toMatchObject({
      reason: "auth-required",
    });
    expect(f.harness.experimental_getRetainedWorkerLeaseCount()).toBe(0);
  } finally {
    await f.harness.experimental_dispose();
  }
});
it("cancels queued work before dispatch and releases lifecycle-aborted leases", async () => {
  const f = await fixture();
  try {
    await f.configure();
    await f.harness.experimental_call("historyReadiness", {
      identities: f.identities,
    });
    const ctx = {
      hostId: "host-a",
      knownWorkspaces: [f.workspace],
      dataDir: f.paths.dataDir,
      signal: new AbortController().signal,
    };
    const start = f.history.controlImport!({ action: "start" }, ctx);
    const cancel = f.history.controlImport!({ action: "cancel" }, ctx);
    expect((await start).reason).toBe("selection-changed");
    await cancel;
    expect(f.reads()).toBe(0);
    const pending = f.harness.experimental_call("historicalImport", f.input({ action: "start" }));
    await f.harness.experimental_dispose();
    await pending;
    expect(f.harness.experimental_getRetainedWorkerLeaseCount()).toBe(0);
  } finally {
    await f.harness.experimental_dispose();
  }
});
it.each([
  { action: "start" as const, stage: "identity" },
  { action: "start" as const, stage: "environment-page" },
  { action: "resume" as const, stage: "identity" },
])(
  "Cancel invalidates $action during $stage without host dispatch or leaked leases",
  async ({ action, stage }) => {
    const f = await fixture();
    try {
      await f.configure();
      const ready = await f.harness.experimental_call("historyReadiness", {
        identities: f.identities,
      });
      if (action === "resume")
        await f.harness.experimental_call("historicalImport", f.input({ action: "start" }));
      let release!: () => void, entered!: () => void;
      const wait = new Promise<void>((r) => (release = r)),
        blocked = new Promise<void>((r) => (entered = r));
      const accountRead = new AbortController(),
        activeReads = new Set([accountRead]);
      const dispatches: string[] = [];
      let pages = 0;
      const handler = createImportHandler({
        selection: () => ({ hostId: "host-a", generation: 1 }),
        enrolled: async () => ({ status: "connected" }),
        activeReads,
        prepare: async () => {
          if (stage === "identity") {
            entered();
            await wait;
          }
          return ready;
        },
        sdk: {
          environments: {
            list: async () => {
              if (++pages === 1)
                return Array.from({ length: 50 }, () => ({
                  hostId: "host-a",
                  path: f.workspace,
                }));
              entered();
              await wait;
              return [];
            },
          } as any,
        },
        call: async (_host, signal, input) => {
          dispatches.push(input.command.action);
          signal.throwIfAborted();
          return f.harness.experimental_call("historicalImport", input);
        },
      });
      const request = { hostId: "host-a", generation: 1 };
      const pending = handler({ ...request, command: { action } });
      await blocked;
      await handler({ ...request, command: { action: "cancel" } });
      release();
      await pending;
      expect(dispatches).toEqual(["cancel"]);
      expect(f.reads()).toBe(0);
      expect(f.harness.experimental_getRetainedWorkerLeaseCount()).toBe(0);
      expect(activeReads).toEqual(new Set([accountRead]));
      expect(accountRead.signal.aborted).toBe(false);
    } finally {
      await f.harness.experimental_dispose();
    }
  },
);
it("omits a FIFO without blocking Cancel, readiness, collector controls or lease disposal", async () => {
  const f = await fixture();
  try {
    await f.configure();
    await f.harness.experimental_call("historyReadiness", {
      identities: f.identities,
    });
    const path = join(f.source, "provider-a.jsonl");
    await unlink(path);
    execFileSync("mkfifo", [path]);
    await f.harness.experimental_call("historicalImport", f.input({ action: "start" }));
    const view = await f.harness.experimental_call(
      "historicalImport",
      f.input({ action: "resume" }),
    );
    expect(view.generation?.diagnostics).toEqual(["missing-source"]);
    expect(view.generation?.omissions).toBe(1);
    await f.harness.experimental_call("historicalImport", f.input({ action: "cancel" }));
    const ready = await f.harness.experimental_call("historyReadiness", null);
    expect(ready.storage).toBe("compatible");
    await f.harness.experimental_call("collectorControl", { action: "pause" });
    expect(f.reads()).toBe(0);
    expect(f.harness.experimental_getRetainedWorkerLeaseCount()).toBe(0);
  } finally {
    await f.harness.experimental_dispose();
  }
}, 3000);
