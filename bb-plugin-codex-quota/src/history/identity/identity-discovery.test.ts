import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { createIdentityDiscovery } from "./identity-discovery.js";
import { openHistoryDatabase, type HistoryDatabase } from "../storage/history-storage.js";
import { initializeHistory, projectCompactRecord } from "../storage/history-projection.js";
import { parseCompact } from "../collection/usage-record.js";
import {
  initializeIdentityStorage,
  acceptIdentityBatch,
  reconcileIdentity,
  identityView,
} from "./identity-storage.js";
const fixtures: { root: string; db: HistoryDatabase }[] = [];
afterEach(async () => {
  for (const { root, db } of fixtures.splice(0)) {
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bbp19-discovery-")),
    db = (await openHistoryDatabase(join(root, "discovery.sqlite")))!;
  fixtures.push({ root, db });
  return db;
}

it("resolves removed worktrees with bounded metadata reads and keeps unknown ownership non-exact", async () => {
  const db = await fixture();
  const usage = await fixture();
  initializeHistory(usage, "2026-10-01T00:00:00.000Z");
  initializeIdentityStorage(usage);
  for (const [n, provider] of ["active", "removed", "unknown", "shared"].entries()) {
    const record = parseCompact(
      JSON.stringify({
        version: 1,
        eventId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        provenance: "observed",
        occurredAt: "2026-10-01T00:00:00.000Z",
        sessionId: `pi-${n}`,
        workspace: "/original",
        providerSessionKey: `${provider}.jsonl`,
        claimedThreadId: null,
        provider: "openai-codex",
        model: "synthetic",
        inputTokens: 1,
        outputTokens: 2,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        totalTokens: 3,
        capturedCost: null,
      }),
      false,
    )!;
    usage.transaction(() => projectCompactRecord(usage, record));
  }
  let now = 1;
  let resolved = false;
  let omitted = false;
  const active = [
    makeThreadResponse({ id: "thr_active", providerId: "pi", environmentId: "env_removed_active" }),
  ];
  const archived = Array.from({ length: 51 }, (_, n) =>
    makeThreadResponse({
      id: `thr_removed_${n}`,
      providerId: "pi",
      environmentId: `env_removed_${n}`,
      archivedAt: 1,
    }),
  );
  archived.splice(
    1,
    0,
    makeThreadResponse({
      id: "thr_unknown",
      providerId: "pi",
      environmentId: "env_unknown",
      archivedAt: 1,
      title: "Do not share unknown title",
    }),
  );
  archived.push(
    makeThreadResponse({
      id: "thr_unknown_later",
      providerId: "pi",
      environmentId: "env_unknown",
      archivedAt: 1,
    }),
  );
  const host = createFakePluginHost({
    pluginId: "identity-test",
    sdk: {
      environments: {
        list: async () => [{ id: "env_active", hostId: "host_a" }],
        get: async (args: { environmentId: string }) => {
          if (args.environmentId === "env_unknown" && !resolved) throw Error("Not found");
          return {
            id: args.environmentId,
            hostId: args.environmentId === "env_unknown" ? "host_b" : "host_a",
            lifecycle: { phase: "destroyed" },
          };
        },
      },
      threads: {
        list: async (args: { archived: boolean; offset: number; limit: number }) =>
          (args.archived
            ? archived.filter((t) => !omitted || !t.id.startsWith("thr_unknown"))
            : active
          ).slice(args.offset, args.offset + args.limit),
        events: {
          list: async (args: { threadId: string }) => {
            const ids =
              args.threadId === "thr_unknown"
                ? ["unknown", "shared"]
                : args.threadId === "thr_active"
                  ? ["active", "shared"]
                  : args.threadId === "thr_removed_0"
                    ? ["removed"]
                    : [];
            return ids.map((providerThreadId, n) => ({
              seq: n + 1,
              threadId: args.threadId,
              type: "thread/identity",
              data: { providerThreadId },
            }));
          },
        },
      },
    },
  });
  let discovery = createIdentityDiscovery(
    host.bb.sdk,
    () => db,
    () => now,
  );
  const complete = async () => {
    for (let n = 0; n < 150; n++) {
      const before = host.harness.inspection.sdk.calls.length;
      const batch = await discovery.next("host_a", new AbortController().signal);
      expect(host.harness.inspection.sdk.calls.length - before).toBeLessThanOrEqual(4);
      if (batch.total !== null) return batch;
      // Restart while pending environment lookups remain.
      discovery = createIdentityDiscovery(
        host.bb.sdk,
        () => db,
        () => now,
      );
    }
    throw Error("Discovery did not progress");
  };
  const batch = await complete();
  expect(batch.rows.filter((r) => r.threadId === "thr_unknown")).toEqual([
    {
      threadId: "thr_unknown",
      providerIdentity: null,
      title: null,
      state: "archived",
      ownershipUnknown: true,
    },
    {
      threadId: "thr_unknown",
      providerIdentity: "unknown",
      title: null,
      state: "archived",
      ownershipUnknown: true,
    },
    {
      threadId: "thr_unknown",
      providerIdentity: "shared",
      title: null,
      state: "archived",
      ownershipUnknown: true,
    },
  ]);
  expect(
    db.prepare("SELECT * FROM discovery_ownership WHERE thread_id='thr_unknown'").get(),
  ).toMatchObject({ reason: "lookup-failed" });
  expect(host.harness.inspection.sdk.callsTo("environments.get")).toHaveLength(53);
  expect(
    host.harness.inspection.sdk.calls.every((c) =>
      ["environments.list", "environments.get", "threads.list", "threads.events.list"].includes(
        c.path,
      ),
    ),
  ).toBe(true);
  acceptIdentityBatch(usage, batch);
  reconcileIdentity(usage, new AbortController().signal);
  const view = identityView(usage);
  expect(view.threads).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ threadId: "thr_active", totalTokens: 3 }),
      expect.objectContaining({ threadId: "thr_removed_0", state: "archived", totalTokens: 3 }),
    ]),
  );
  expect(view.threads).toHaveLength(2);
  expect(view.grades.find((g) => g.grade === "workspace-only")?.totalTokens).toBe(6);
  expect(
    usage.prepare("SELECT thread_id FROM identity_usage WHERE provider_key='unknown.jsonl'").get(),
  ).toEqual({ thread_id: null });
  expect(
    usage.prepare("SELECT * FROM identity_metadata WHERE thread_id='thr_unknown'").all(),
  ).toEqual([]);
  discovery.delivered(batch);
  const receipt = await discovery.next("host_a", new AbortController().signal);
  expect(receipt.offset).toBe(batch.total);
  now = 60_001;
  const unchanged = await complete();
  expect(unchanged).toEqual(receipt);
  omitted = true;
  now = 120_001;
  const absent = await complete();
  // New delivery recipients must also receive the retained uncertainty.
  discovery.resetDelivery(absent);
  const retained = await discovery.next("host_a", new AbortController().signal);
  expect(retained.rows.filter((r) => r.threadId === "thr_unknown")).toEqual(
    batch.rows.filter((r) => r.threadId === "thr_unknown"),
  );
  omitted = false;
  resolved = true;
  now = 180_001;
  const changed = await complete();
  expect(changed.generation).toBeGreaterThan(batch.generation);
  acceptIdentityBatch(usage, changed);
  reconcileIdentity(usage, new AbortController().signal);
  expect(identityView(usage).threads.find((r) => r.threadId === "thr_active")?.totalTokens).toBe(6);
  await host.harness.lifecycle.dispose();
});
it("pages environments, active/archived Pi threads and every retained identity with durable bounded progress", async () => {
  const db = await fixture();
  const calls: { method: string; args: Record<string, unknown> }[] = [];
  const environments = Array.from({ length: 51 }, (_, n) => ({
    id: `env_${n}`,
    hostId: n === 50 ? "host_b" : "host_a",
  }));
  const active = Array.from({ length: 51 }, (_, n) =>
    makeThreadResponse({ id: `thr_${n}`, providerId: "pi", environmentId: "env_0" }),
  );
  const archived = [
    makeThreadResponse({
      id: "thr_archived",
      providerId: "pi",
      environmentId: "env_50",
      archivedAt: 1,
    }),
  ];
  const host = createFakePluginHost({
    pluginId: "identity-test",
    sdk: {
      environments: {
        list: async (args: Record<string, unknown>) => {
          calls.push({ method: "environments", args });
          return environments.slice(Number(args.offset), Number(args.offset) + Number(args.limit));
        },
      },
      threads: {
        list: async (args: Record<string, unknown>) => {
          calls.push({ method: "threads", args });
          const rows = args.archived ? archived : active;
          return rows.slice(Number(args.offset), Number(args.offset) + Number(args.limit));
        },
        events: {
          list: async (args: Record<string, unknown>) => {
            calls.push({ method: "events", args });
            const count = args.threadId === "thr_0" ? 51 : 1;
            return Array.from({ length: count }, (_, n) => ({
              id: `e${n}`,
              threadId: args.threadId,
              scope: { kind: "thread" },
              seq: n + 1,
              createdAt: 1,
              type: "thread/identity",
              data: { providerThreadId: `${args.threadId}-provider-${n}` },
            }))
              .filter((e) => e.seq > Number(args.afterSeq))
              .slice(0, Number(args.limit));
          },
        },
      },
    },
  });
  let discovery = createIdentityDiscovery(
    host.bb.sdk,
    () => db,
    () => 1,
  );
  let result = await discovery.next("host_a", new AbortController().signal);
  expect(result.total).toBeNull();
  expect(calls.length).toBeLessThanOrEqual(4);
  discovery = createIdentityDiscovery(
    host.bb.sdk,
    () => db,
    () => 1,
  );
  for (let n = 0; result.total === null && n < 100; n++)
    result = await discovery.next("host_a", new AbortController().signal);
  expect(result.total).toBe(152);
  expect(result.rows).toHaveLength(100);
  discovery.delivered(result);
  const rest = await discovery.next("host_a", new AbortController().signal);
  expect(rest.offset).toBe(100);
  expect(rest.rows).toHaveLength(52);
  expect(
    rest.rows.some((r) => r.providerIdentity === "thr_0-provider-50") ||
      result.rows.some((r) => r.providerIdentity === "thr_0-provider-50"),
  ).toBe(true);
  const before = calls.length;
  const b = await discovery.next("host_b", new AbortController().signal);
  expect(b.rows.some((r) => r.threadId === "thr_archived" && r.state === "archived")).toBe(true);
  expect(calls.length).toBe(before);
  expect(
    calls
      .filter((c) => c.method === "events")
      .every(
        (c) =>
          JSON.stringify(c.args.types) === '["thread/identity"]' &&
          c.args.order === "asc" &&
          c.args.limit === "50",
      ),
  ).toBe(true);
  expect(calls.filter((c) => c.method === "threads").some((c) => c.args.archived === true)).toBe(
    true,
  );
  await host.harness.lifecycle.dispose();
});
it("does not complete failed/invalid identity pages and checks cancellation after SDK await", async () => {
  const db = await fixture();
  let malformed = true;
  const controller = new AbortController();
  const host = createFakePluginHost({
    pluginId: "identity-test",
    sdk: {
      environments: { list: async () => [{ id: "env_a", hostId: "host_a" }] },
      threads: {
        list: async (args: { archived: boolean }) =>
          args.archived
            ? []
            : [makeThreadResponse({ id: "thr_a", providerId: "pi", environmentId: "env_a" })],
        events: {
          list: async () => {
            if (!malformed) controller.abort();
            return [
              {
                seq: 1,
                threadId: "thr_a",
                type: "item/agentMessage/delta",
                data: { secret: "never persist" },
              },
            ];
          },
        },
      },
    },
  });
  const discovery = createIdentityDiscovery(host.bb.sdk, () => db);
  await expect(discovery.next("host_a", controller.signal)).rejects.toThrow(
    "Identity page unavailable",
  );
  expect(JSON.stringify(db.prepare("SELECT * FROM discovery_rows").all())).not.toContain("secret");
  malformed = false;
  await expect(discovery.next("host_a", controller.signal)).rejects.toThrow();
  await host.harness.lifecycle.dispose();
});
it.each(["lookup-failed", "no-host", "wrong-environment", "no-environment"])(
  "finishes discovery with explicit uncertainty for %s",
  async (reason) => {
    const db = await fixture();
    const host = createFakePluginHost({
      pluginId: "identity-test",
      sdk: {
        environments: {
          list: async () => [],
          get: async () => {
            if (reason === "lookup-failed") throw Error("Unavailable");
            return {
              id: reason === "wrong-environment" ? "env_other" : "env_missing",
              hostId: reason === "no-host" ? null : "host_b",
            };
          },
        },
        threads: {
          list: async (args: { archived: boolean }) =>
            args.archived
              ? []
              : [
                  makeThreadResponse({
                    id: "thr_unknown",
                    providerId: "pi",
                    environmentId: reason === "no-environment" ? null : "env_missing",
                  }),
                ],
          events: {
            list: async () => [
              {
                seq: 1,
                threadId: "thr_unknown",
                type: "thread/identity",
                data: { providerThreadId: "unknown" },
              },
            ],
          },
        },
      },
    });
    const discovery = createIdentityDiscovery(host.bb.sdk, () => db);
    let result = await discovery.next("host_a", new AbortController().signal);
    for (let n = 0; result.total === null && n < 10; n++)
      result = await discovery.next("host_a", new AbortController().signal);
    expect(result.total).toBe(2);
    expect(result.rows.every((r) => r.ownershipUnknown && r.title === null)).toBe(true);
    expect(db.prepare("SELECT reason FROM discovery_ownership").get()).toEqual({
      reason: reason === "wrong-environment" ? "no-host" : reason,
    });
    await host.harness.lifecycle.dispose();
  },
);
it("does not turn canceled ownership lookup into durable uncertainty", async () => {
  const db = await fixture();
  const controller = new AbortController();
  const host = createFakePluginHost({
    pluginId: "identity-test",
    sdk: {
      environments: {
        list: async () => [],
        get: async () => {
          controller.abort();
          return { id: "env_missing", hostId: "host_a" };
        },
      },
      threads: {
        list: async () => [
          makeThreadResponse({ id: "thr_a", providerId: "pi", environmentId: "env_missing" }),
        ],
      },
    },
  });
  const discovery = createIdentityDiscovery(host.bb.sdk, () => db);
  await expect(discovery.next("host_a", controller.signal)).rejects.toThrow();
  expect(db.prepare("SELECT reason FROM discovery_ownership").get()).toEqual({ reason: "pending" });
  expect(db.prepare("SELECT * FROM discovery_environments").all()).toEqual([]);
  await host.harness.lifecycle.dispose();
});
it("refreshes B despite an unfinished A delivery and resumes unchanged A after cache expiry", async () => {
  const db = await fixture();
  let now = 1,
    conflict = false,
    calls = 0;
  const host = createFakePluginHost({
    pluginId: "identity-test",
    sdk: {
      environments: {
        list: async () => {
          calls++;
          return [
            { id: "env_a", hostId: "host_a" },
            { id: "env_b", hostId: "host_b" },
          ];
        },
      },
      threads: {
        list: async (args: { archived: boolean }) => {
          calls++;
          return args.archived
            ? []
            : [
                makeThreadResponse({ id: "thr_a", providerId: "pi", environmentId: "env_a" }),
                makeThreadResponse({ id: "thr_b", providerId: "pi", environmentId: "env_b" }),
                ...(conflict
                  ? [
                      makeThreadResponse({
                        id: "thr_conflict",
                        providerId: "pi",
                        environmentId: "env_b",
                      }),
                    ]
                  : []),
              ];
        },
        events: {
          list: async (args: { threadId: string; afterSeq: string; limit: string }) => {
            calls++;
            const rows = Array.from({ length: args.threadId === "thr_a" ? 101 : 1 }, (_, n) => ({
              id: `e${n}`,
              threadId: args.threadId,
              scope: { kind: "thread" },
              seq: n + 1,
              createdAt: 1,
              type: "thread/identity",
              data: { providerThreadId: args.threadId === "thr_a" ? `a${n}` : "b0" },
            }));
            return rows.filter((r) => r.seq > Number(args.afterSeq)).slice(0, Number(args.limit));
          },
        },
      },
    },
  });
  const discovery = createIdentityDiscovery(
    host.bb.sdk,
    () => db,
    () => now,
  );
  const complete = async (hostId: string) => {
    let result = await discovery.next(hostId, new AbortController().signal);
    for (let n = 0; result.total === null && n < 30; n++)
      result = await discovery.next(hostId, new AbortController().signal);
    expect(result.total).not.toBeNull();
    return result;
  };
  const a = await complete("host_a");
  expect(a.rows).toHaveLength(100);
  expect(a.total).toBe(102);
  discovery.delivered(a);
  const b = await complete("host_b");
  discovery.delivered(b);
  const before = calls;
  conflict = true;
  now = 120001;
  const changed = await complete("host_b");
  expect(calls).toBeGreaterThan(before);
  expect(changed.generation).toBeGreaterThan(b.generation);
  expect(
    changed.rows.some((r) => r.threadId === "thr_conflict" && r.providerIdentity === "b0"),
  ).toBe(true);
  discovery.delivered(changed);
  const rest = await complete("host_a");
  expect(rest.generation).toBe(a.generation);
  expect(rest.offset).toBe(100);
  expect(rest.rows).toHaveLength(2);
  discovery.delivered(rest);
  await host.harness.lifecycle.dispose();
});

it("bounds source rows even when the whole previous uncertainty catalog is now resolved", async () => {
  const db = await fixture();
  const host = createFakePluginHost({
    pluginId: "identity-test",
    sdk: {
      environments: { list: async () => [] },
      threads: { list: async () => [] },
    },
  });
  const discovery = createIdentityDiscovery(
    host.bb.sdk,
    () => db,
    () => 1,
  );
  // Initialize the public module, then exercise recovery from durable carry state.
  for (let n = 0; n < 5; n++) await discovery.next("host_a", new AbortController().signal);
  const state = JSON.parse(
    (db.prepare("SELECT value FROM discovery_state").get() as { value: string }).value,
  );
  state.generation = 2;
  state.phase = "uncertainty";
  db.transaction(() => {
    for (let n = 0; n < 1000; n++) {
      const id = `thr_${String(n).padStart(4, "0")}`;
      db.prepare(
        "INSERT INTO discovery_rows(generation,host_id,thread_id,provider_identity,title,state) VALUES (1,'',?,'unknown',NULL,'archived')",
      ).run(id);
      db.prepare("INSERT INTO discovery_threads VALUES (2,?,'host_a',NULL,'archived',1)").run(id);
    }
    db.prepare("UPDATE discovery_state SET value=?").run(JSON.stringify(state));
  });
  const first = await discovery.next("host_a", new AbortController().signal);
  expect(first.total).toBeNull();
  expect(
    JSON.parse((db.prepare("SELECT value FROM discovery_state").get() as { value: string }).value),
  ).toMatchObject({
    phase: "uncertainty",
    uncertaintyThread: "thr_0199",
    uncertaintyProvider: "unknown",
  });
  expect(db.prepare("SELECT count(*) AS n FROM discovery_rows WHERE generation=2").get()).toEqual({
    n: 0,
  });
  let result = first;
  for (let n = 0; result.total === null && n < 10; n++)
    result = await discovery.next("host_a", new AbortController().signal);
  expect(result.total).toBe(0);
  await host.harness.lifecycle.dispose();
});
