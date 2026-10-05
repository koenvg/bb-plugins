import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import { createQuotaHostEntry } from "./host.js";
import { createHostHistory } from "./history-host.js";
import { openHistoryDatabase } from "./history-storage.js";
import { createIdentityHistoryCall } from "./identity-server.js";
import { historyReadinessSchema } from "./history-contract.js";
import type { BbPluginApi } from "@get-bb/plugin-sdk";

it("redelivers an unchanged cached catalog after host recovery without changing its fingerprint or generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "bbp16-delivery-")),
    directory = join(root, "data/history"),
    dataDir = join(root, "data");
  await mkdir(directory, { recursive: true });
  const db = (await openHistoryDatabase(join(root, "server.sqlite")))!;
  let sdkCalls = 0;
  const fake = createFakePluginHost({
    pluginId: "storage-delivery",
    sdk: {
      environments: {
        list: async () => {
          sdkCalls++;
          return [{ id: "env_owned", hostId: "host-one" }];
        },
      },
      threads: {
        list: async (args: { archived: boolean }) => {
          sdkCalls++;
          return args.archived
            ? []
            : [
                makeThreadResponse({
                  id: "thr_owned",
                  providerId: "pi",
                  environmentId: "env_owned",
                }),
              ];
        },
        events: {
          list: async () => {
            sdkCalls++;
            return [
              {
                id: "identity-one",
                threadId: "thr_owned",
                scope: { kind: "thread" },
                seq: 1,
                createdAt: 1,
                type: "thread/identity",
                data: { providerThreadId: "provider-owned" },
              },
            ];
          },
        },
      },
    },
  });
  // Public storage adapter, backed entirely by this persistent temporary database.
  const bb = {
    ...fake.bb,
    storage: {
      ...fake.bb.storage,
      database: () => ({
        exec: db.exec,
        prepare: db.prepare,
        transaction: (work: () => unknown) => () => db.transaction(work),
      }),
    },
  } as unknown as BbPluginApi;
  const history = createHostHistory({
    agentDir: () => join(root, "agent"),
    now: () => Date.parse("2026-10-01T12:00:00Z"),
    collector: async () => "compatible-v1",
  });
  const entry = createQuotaHostEntry({
    history,
    auth: async () => ({ status: "auth-required" }),
    read: async () => {
      throw Error("No network");
    },
  });
  const harness = experimental_createHostEntryHarness(entry, {
    experimental_paths: { dataDir, tempDir: join(root, "temp") },
  });
  try {
    // Installation is restricted to this owned temporary fixture; no Pi process runs.
    await harness.experimental_call("collectorControl", { action: "install" });
    await harness.experimental_call("collectorControl", { action: "pause" });
    const r = {
      version: 1,
      eventId: "00000000-0000-4000-8000-000000000001",
      provenance: "observed",
      occurredAt: "2026-09-30T00:00:00.000Z",
      sessionId: "original-session",
      workspace: "/original",
      providerSessionKey: "provider-owned.jsonl",
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
    };
    await writeFile(join(directory, "events-v1-2026-09-30.jsonl"), JSON.stringify(r) + "\n");
    await writeFile(
      join(directory, "confirmations-v1-2026-09-30.jsonl"),
      JSON.stringify({
        version: 1,
        eventId: r.eventId,
        sessionId: r.sessionId,
        entryId: "entry-one",
      }) + "\n",
    );
    const call = createIdentityHistoryCall(bb, (_host, _signal, input) =>
      harness.experimental_call("historyReadiness", input),
    );
    const read = async () =>
      historyReadinessSchema.parse(await call("host-one", new AbortController().signal));
    let before = await read();
    for (let n = 0; before.collection?.attribution?.discovery !== "complete" && n < 12; n++)
      before = await read();
    expect(before.collection?.attribution?.threads).toMatchObject([
      { threadId: "thr_owned", totalTokens: 5 },
    ]);
    const catalog = db
      .prepare("SELECT generation,digest,total FROM discovery_targets WHERE host_id='host-one'")
      .get();
    const calls = sdkCalls;
    await writeFile(join(directory, "usage-v1.sqlite"), "owned-confirmed-corruption");
    let recovered = await read();
    for (let n = 0; recovered.collection?.attribution?.discovery !== "complete" && n < 5; n++)
      recovered = await read();
    expect(recovered.health?.state).toBe("recovered");
    expect(recovered.collection?.enabled).toBe(false);
    expect(recovered.collection?.attribution?.threads).toMatchObject([
      { threadId: "thr_owned", totalTokens: 5 },
    ]);
    expect(
      db
        .prepare("SELECT generation,digest,total FROM discovery_targets WHERE host_id='host-one'")
        .get(),
    ).toEqual(catalog);
    expect(sdkCalls).toBe(calls);
    expect((await harness.experimental_call("quota", {})).reason).toBe("auth-required");
  } finally {
    await harness.experimental_dispose();
    await fake.harness.lifecycle.dispose();
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});
