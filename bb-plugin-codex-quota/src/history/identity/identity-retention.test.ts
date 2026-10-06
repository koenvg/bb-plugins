import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { createIdentityDiscovery } from "./identity-discovery.js";
import { openHistoryDatabase, type HistoryDatabase } from "../storage/history-storage.js";
import { initializeHistory } from "../storage/history-projection.js";
import { initializeIdentityStorage, acceptIdentityBatch } from "./identity-storage.js";

const fixtures: { root: string; db: HistoryDatabase }[] = [];
afterEach(async () => {
  for (const { root, db } of fixtures.splice(0)) {
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bbp147-retention-")),
    db = (await openHistoryDatabase(join(root, "discovery.sqlite")))!;
  fixtures.push({ root, db });
  return db;
}

it.each([101, 501])(
  "bounds snapshots with %i identities while retaining receipts and resumed delivery",
  async (identities) => {
    const db = await fixture();
    let now = 1;
    let title = "Initial";
    const host = createFakePluginHost({
      pluginId: "identity-retention-test",
      sdk: {
        environments: {
          list: async () => [
            { id: "env_a", hostId: "host_a" },
            { id: "env_b", hostId: "host_b" },
          ],
        },
        threads: {
          list: async (args = {}) =>
            args.archived
              ? []
              : [
                  makeThreadResponse({ id: "thr_a", providerId: "pi", environmentId: "env_a" }),
                  makeThreadResponse({
                    id: "thr_b",
                    providerId: "pi",
                    environmentId: "env_b",
                    title,
                  }),
                ],
          events: {
            list: async (args) =>
              Array.from({ length: args.threadId === "thr_a" ? identities : 1 }, (_, n) => ({
                seq: n + 1,
                threadId: args.threadId,
                type: "thread/identity",
                data: { providerThreadId: `${args.threadId}_${n}` },
              }))
                .filter((r) => r.seq > Number(args.afterSeq))
                .slice(0, Number(args.limit)),
          },
        },
      },
    });
    let discovery = createIdentityDiscovery(
      host.bb.sdk,
      () => db,
      () => now,
    );
    const complete = async (hostId: string) => {
      for (let n = 0; n < 100; n++) {
        const batch = await discovery.next(hostId, new AbortController().signal);
        if (batch.total !== null) return batch;
        discovery = createIdentityDiscovery(
          host.bb.sdk,
          () => db,
          () => now,
        );
      }
      throw Error("Discovery did not complete");
    };
    const a = await complete("host_a");
    discovery.delivered(a);
    const staleB = await complete("host_b");
    for (let n = 0; n < 40; n++) {
      now += 60_000;
      if (n >= 20) title = `Changed ${n}`;
      const b = await complete("host_b");
      discovery.delivered(b);
      if (n >= 20) {
        discovery.resetDelivery(staleB);
        discovery.delivered(staleB);
        const acknowledged = await complete("host_b");
        expect(acknowledged.offset).toBe(2);
        expect(acknowledged.rows).toEqual([]);
      }
      const resumed = await complete("host_a");
      expect(resumed.generation).toBe(a.generation);
      expect(resumed.offset).toBe(100);
      expect(resumed.rows).toHaveLength(Math.min(100, identities - 99));
      // Each target and receipt must still have a complete source snapshot.
      expect(
        db
          .prepare(`SELECT count(*) AS n FROM discovery_receipts d WHERE total !=
      (SELECT count(*) FROM discovery_rows r WHERE r.generation=d.generation AND r.host_id IN (d.host_id,''))`)
          .get(),
      ).toEqual({ n: 0 });
      const generations = db
        .prepare("SELECT count(DISTINCT generation) AS n FROM discovery_rows WHERE generation>0")
        .get() as { n: number };
      expect(generations.n).toBeLessThanOrEqual(4);
      expect(
        (db.prepare("SELECT count(*) AS n FROM discovery_receipts").get() as { n: number }).n,
      ).toBeLessThanOrEqual(2);
      const bytes = db
        .prepare(
          "SELECT sum(length(host_id)+length(thread_id)+coalesce(length(provider_identity),0)+coalesce(length(title),0)+length(state)) AS n FROM discovery_rows",
        )
        .get() as { n: number };
      expect(bytes.n).toBeLessThan(100_000);
      for (const table of ["discovery_environments", "discovery_threads", "discovery_catalogs"]) {
        expect(
          (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n,
        ).toBeLessThanOrEqual(8);
      }
      const pages = db.prepare("PRAGMA page_count").get() as { page_count: number };
      const size = db.prepare("PRAGMA page_size").get() as { page_size: number };
      expect(pages.page_count * size.page_size).toBeLessThan(512_000);
    }
    const remaining = await complete("host_a");
    discovery.resetDelivery(remaining);
    const replay = await complete("host_a");
    expect(replay.offset).toBe(0);
    expect(replay.rows).toEqual(a.rows);
    discovery.delivered(replay);
    for (let n = 0; n < 10; n++) {
      const rest = await complete("host_a");
      discovery.delivered(rest);
      if (rest.offset + rest.rows.length === rest.total) break;
    }
    expect((await complete("host_a")).offset).toBe(identities + 1);
    await host.harness.lifecycle.dispose();
  },
);

it("retains canonical evidence and ownership resolution for hosts that miss many generations", async () => {
  const db = await fixture();
  const offline = await fixture();
  initializeHistory(offline, "2026-10-01T00:00:00.000Z");
  initializeIdentityStorage(offline);
  let now = 1;
  let stage: "unknown" | "absent" | "resolved" | "gone" = "unknown";
  const host = createFakePluginHost({
    pluginId: "identity-retention-evidence-test",
    sdk: {
      environments: {
        list: async () => [
          { id: "env_a", hostId: "host_a" },
          { id: "env_b", hostId: "host_b" },
        ],
      },
      threads: {
        list: async (args = {}) =>
          args.archived || stage === "absent" || stage === "gone"
            ? []
            : [
                makeThreadResponse({
                  id: "thr_known",
                  providerId: "pi",
                  environmentId: "env_a",
                  title: "Known title",
                }),
                makeThreadResponse({
                  id: "thr_unknown",
                  providerId: "pi",
                  environmentId: stage === "resolved" ? "env_b" : null,
                  title: "Private unknown title",
                }),
              ],
        events: {
          list: async (args) => [
            {
              seq: 1,
              threadId: args.threadId,
              type: "thread/identity",
              data: { providerThreadId: args.threadId === "thr_known" ? "known" : "unknown" },
            },
          ],
        },
      },
    },
  });
  let discovery = createIdentityDiscovery(
    host.bb.sdk,
    () => db,
    () => now,
  );
  const complete = async (hostId: string) => {
    for (let n = 0; n < 100; n++) {
      const batch = await discovery.next(hostId, new AbortController().signal);
      if (batch.total !== null) return batch;
      discovery = createIdentityDiscovery(
        host.bb.sdk,
        () => db,
        () => now,
      );
    }
    throw Error("Discovery did not complete");
  };
  const original = await complete("host_a");
  discovery.delivered(original);
  const oldOffline = await complete("host_offline");
  acceptIdentityBatch(offline, oldOffline);
  discovery.delivered(oldOffline);
  stage = "absent";
  for (let n = 0; n < 12; n++) {
    now += 60_000;
    const batch = await complete("host_driver");
    discovery.delivered(batch);
  }
  // A new delivery recipient still receives uncertainty after metadata disappears.
  const uncertain = await complete("host_new");
  expect(uncertain.rows).toEqual(oldOffline.rows);
  const replay = await complete("host_a");
  discovery.resetDelivery(replay);
  const retained = await complete("host_a");
  expect(retained.rows).toEqual(original.rows);
  stage = "resolved";
  now += 60_000;
  discovery.delivered(await complete("host_driver"));
  stage = "gone";
  for (let n = 0; n < 12; n++) {
    now += 60_000;
    discovery.delivered(await complete("host_driver"));
  }
  const resolution = await complete("host_offline");
  expect(resolution.generation).toBeGreaterThan(oldOffline.generation);
  expect(resolution.rows).toEqual([
    {
      threadId: "thr_unknown",
      providerIdentity: null,
      title: null,
      state: "available",
      ownershipUnknown: false,
    },
  ]);
  acceptIdentityBatch(offline, resolution);
  expect(offline.prepare("SELECT count(*) AS n FROM identity_uncertain").get()).toEqual({ n: 0 });
  const owner = await complete("host_b");
  expect(owner.rows).toContainEqual({
    threadId: "thr_unknown",
    providerIdentity: "unknown",
    title: "Private unknown title",
    state: "available",
  });
  expect(JSON.stringify(resolution)).not.toContain("Private unknown title");
  expect(
    db
      .prepare("SELECT count(DISTINCT generation) AS n FROM discovery_rows WHERE generation>0")
      .get(),
  ).toEqual({ n: 5 });
  await host.harness.lifecycle.dispose();
});

it.each(["complete", "uncertainty", "fingerprint"])(
  "recovers legacy %s evidence in bounded pages before retiring old snapshots",
  async (phase) => {
    const db = await fixture();
    const host = createFakePluginHost({
      pluginId: "identity-retention-upgrade",
      sdk: { environments: { list: async () => [] }, threads: { list: async () => [] } },
    });
    let now = 1;
    let discovery = createIdentityDiscovery(
      host.bb.sdk,
      () => db,
      () => now,
    );
    for (let n = 0; n < 6; n++) await discovery.next("host_a", new AbortController().signal);
    // A pre-retention installation has many snapshots and an old completed state.
    const state = JSON.parse(
      (db.prepare("SELECT value FROM discovery_state").get() as { value: string }).value,
    );
    state.generation = 20;
    state.phase = phase;
    state.finishedAt = 1;
    delete state.evidenceAll;
    delete state.retained;
    db.transaction(() => {
      db.exec("DELETE FROM discovery_receipts; DELETE FROM discovery_targets");
      for (let generation = 1; generation <= 20; generation++) {
        for (let n = 0; n < 120; n++)
          db.prepare(
            "INSERT INTO discovery_rows(generation,host_id,thread_id,provider_identity,title,state) VALUES (?,'host_a','thr_a',?,?,'archived')",
          ).run(generation, `provider_${n}`, `Title ${generation}`);
      }
      db.prepare(
        "INSERT INTO discovery_rows(generation,host_id,thread_id,provider_identity,title,state) VALUES (1,'host_a','thr_a','legacy-only','Title 1','archived')",
      ).run();
      db.prepare("UPDATE discovery_state SET value=?").run(JSON.stringify(state));
    });
    now = 60_001;
    let batch = await discovery.next("host_a", new AbortController().signal);
    expect(batch.total).toBeNull();
    expect(db.prepare("SELECT count(DISTINCT generation) AS n FROM discovery_rows").get()).toEqual({
      n: 20,
    });
    for (let n = 0; batch.total === null && n < 100; n++) {
      discovery = createIdentityDiscovery(
        host.bb.sdk,
        () => db,
        () => now,
      );
      batch = await discovery.next("host_a", new AbortController().signal);
    }
    expect(batch.total).toBe(121);
    const received = [...batch.rows];
    discovery.delivered(batch);
    const rest = await discovery.next("host_a", new AbortController().signal);
    received.push(...rest.rows);
    expect(received).toContainEqual({
      threadId: "thr_a",
      providerIdentity: "legacy-only",
      title: "Title 1",
      state: "archived",
    });
    expect(received.find((r) => r.providerIdentity === "provider_0")?.title).toBe("Title 20");
    discovery.delivered(rest);
    for (let n = 0; n < 20; n++)
      await discovery.next("host_a", new AbortController().signal, false);
    expect(db.prepare("SELECT count(*) AS n FROM discovery_rows").get()).toEqual({ n: 241 });
    expect(db.prepare("SELECT count(DISTINCT generation) AS n FROM discovery_rows").get()).toEqual({
      n: 2,
    });
    await host.harness.lifecycle.dispose();
  },
);

it("rolls back canceled cleanup and leaves usage and public metadata unchanged", async () => {
  const db = await fixture();
  const host = createFakePluginHost({
    pluginId: "identity-retention-cancellation",
    sdk: { environments: { list: async () => [] }, threads: { list: async () => [] } },
  });
  let now = 1;
  let discovery = createIdentityDiscovery(
    host.bb.sdk,
    () => db,
    () => now,
  );
  const complete = async () => {
    for (let n = 0; n < 10; n++) {
      const batch = await discovery.next("host_a", new AbortController().signal);
      if (batch.total !== null) return batch;
    }
    throw Error("Discovery did not complete");
  };
  await complete();
  now += 60_000;
  await complete();
  now += 60_000;
  await complete();
  now += 60_000;
  await complete();
  db.exec(`INSERT INTO discovery_receipts VALUES (2,'host_retired',0,0,0);
    INSERT INTO discovery_environments VALUES (2,'env_obsolete','host_a');
    CREATE TABLE usage_records (value TEXT);
    INSERT INTO usage_records VALUES ('Retained usage');`);
  const snapshot = () =>
    JSON.stringify([
      db.prepare("SELECT * FROM discovery_receipts ORDER BY generation,host_id").all(),
      db.prepare("SELECT * FROM discovery_environments ORDER BY generation,environment_id").all(),
      db.prepare("SELECT value FROM discovery_state").get(),
    ]);
  const before = snapshot();
  const controller = new AbortController();
  const guarded: HistoryDatabase = {
    ...db,
    exec(sql) {
      db.exec(sql);
      if (sql.startsWith("DELETE FROM discovery_receipts")) controller.abort();
    },
  };
  discovery = createIdentityDiscovery(
    host.bb.sdk,
    () => guarded,
    () => now,
  );
  await expect(discovery.next("host_a", controller.signal, false)).rejects.toThrow();
  expect(snapshot()).toBe(before);
  // A canceled call must not start the next scan or retire a receipt.
  now += 60_000;
  await expect(discovery.next("host_a", controller.signal)).rejects.toThrow();
  expect(snapshot()).toBe(before);
  discovery = createIdentityDiscovery(
    host.bb.sdk,
    () => db,
    () => now,
  );
  await discovery.next("host_a", new AbortController().signal, false);
  expect(db.prepare("SELECT * FROM discovery_receipts WHERE host_id='host_retired'").all()).toEqual(
    [],
  );
  expect(db.prepare("SELECT * FROM discovery_environments").all()).toEqual([]);
  expect(db.prepare("SELECT * FROM usage_records").all()).toEqual([{ value: "Retained usage" }]);
  expect(
    host.harness.inspection.sdk.calls.every((c) =>
      ["environments.list", "threads.list"].includes(c.path),
    ),
  ).toBe(true);
  await host.harness.lifecycle.dispose();
});
