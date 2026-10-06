import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { createIdentityDiscovery } from "./identity-discovery.js";
import { openHistoryDatabase, type HistoryDatabase } from "../storage/history-storage.js";
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
        list: async (args = {}) => {
          calls.push({ method: "environments", args: { ...args } });
          return environments.slice(Number(args.offset), Number(args.offset) + Number(args.limit));
        },
      },
      threads: {
        list: async (args = {}) => {
          calls.push({ method: "threads", args: { ...args } });
          const rows = args.archived ? archived : active;
          return rows.slice(Number(args.offset), Number(args.offset) + Number(args.limit));
        },
        events: {
          list: async (args) => {
            calls.push({ method: "events", args: { ...args } });
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
        list: async (args = {}) =>
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
  expect((await discovery.next("host_a", controller.signal)).total).toBeNull();
  expect(JSON.stringify(db.prepare("SELECT * FROM discovery_rows").all())).not.toContain("secret");
  malformed = false;
  await expect(discovery.next("host_a", controller.signal)).rejects.toThrow();
  await host.harness.lifecycle.dispose();
});
it("keeps skipped or unknown Pi environments partial instead of claiming unique identity", async () => {
  const db = await fixture();
  const host = createFakePluginHost({
    pluginId: "identity-test",
    sdk: {
      environments: { list: async () => [] },
      threads: {
        list: async () => [
          makeThreadResponse({ id: "thr_unknown", providerId: "pi", environmentId: "env_missing" }),
        ],
      },
    },
  });
  const discovery = createIdentityDiscovery(host.bb.sdk, () => db);
  expect((await discovery.next("host_a", new AbortController().signal)).total).toBeNull();
  expect(db.prepare("SELECT count(*) AS n FROM discovery_rows").get()).toMatchObject({ n: 0 });
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
        list: async (args = {}) => {
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
          list: async (args) => {
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
