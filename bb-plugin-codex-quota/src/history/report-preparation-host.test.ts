import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import { createQuotaHostEntry } from "../plugin/host.js";
import { createHostHistory } from "./history-host.js";
import { openHistoryDatabase } from "./storage/history-storage.js";
import { initializeHistory, projectCompactRecord } from "./storage/history-projection.js";
import { usageRecordSchema } from "./collection/usage-record.js";

const roots: string[] = [];
const now = Date.parse("2026-10-01T12:00:00Z");
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
it("prepares multiple host batches without reading bodies, maintaining history, or changing controls and assets", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "bbp143-host-"));
  roots.push(dataDir);
  const directory = join(dataDir, "history");
  await mkdir(directory);
  const path = join(directory, "usage-v1.sqlite");
  const db = (await openHistoryDatabase(path))!;
  initializeHistory(db, new Date(now).toISOString());
  const control = JSON.stringify({
    protocol: 2,
    enabled: false,
    revision: "00000000-0000-4000-8000-000000000000",
  });
  await writeFile(join(directory, "collector-control-v1.json"), control);
  const body = "must not read transcript or collector data";
  await writeFile(join(directory, "usage-v1.jsonl"), body);
  db.transaction(() => {
    for (let n = 0; n < 801; n++)
      projectCompactRecord(
        db,
        usageRecordSchema.parse({
          version: 1,
          eventId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
          provenance: "observed",
          occurredAt: "2026-09-15T12:00:00.000Z",
          sessionId: "pi-original",
          workspace: "/original",
          providerSessionKey: "provider.jsonl",
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
      );
  });
  const retention = db.prepare("SELECT * FROM history_retention").all();
  const original = db
    .prepare(
      "SELECT event_id,total,workspace,session_id,occurred_at,provider_key FROM usage_compact ORDER BY event_id",
    )
    .all();
  db.close();
  const bodyRead = vi.fn();
  const history = createHostHistory({
    now: () => now,
    bodyRead,
    collector: async () => {
      throw Error("no asset checks");
    },
  });
  const harness = experimental_createHostEntryHarness(
    createQuotaHostEntry({
      history,
      auth: async () => {
        throw Error("no account");
      },
      read: async () => {
        throw Error("no quota");
      },
    }),
    { experimental_paths: { dataDir, tempDir: join(dataDir, "temp") } },
  );
  try {
    let result: import("zod").z.infer<
      typeof import("./report-preparation-contract.js").hostPreparationSchema
    >;
    const progress = new Set<string>();
    let calls = 0;
    do {
      result = await harness.experimental_call("reportPreparation", {
        identities: {
          hostId: "host_a",
          generation: 1,
          offset: 0,
          total: 1,
          rows: [
            {
              threadId: "thr_verified",
              providerIdentity: "provider",
              title: null,
              state: "available",
            },
          ],
        },
      });
      expect(result.state).toBe("available");
      if (result.state !== "available") throw Error(JSON.stringify(result));
      progress.add(result.progress);
    } while (result.state === "available" && result.attribution.backlog && ++calls < 20);
    expect(calls).toBe(4);
    expect(progress.size).toBe(5);
    if (result.state !== "available") throw Error("Preparation unavailable");
    expect(result.attribution).toMatchObject({
      discovery: "complete",
      backlog: false,
      threads: [{ threadId: "thr_verified", totalTokens: 2403 }],
    });
    expect(bodyRead).not.toHaveBeenCalled();
    expect(await readFile(join(directory, "collector-control-v1.json"), "utf8")).toBe(control);
    expect(await readFile(join(directory, "usage-v1.jsonl"), "utf8")).toBe(body);
    const after = (await openHistoryDatabase(path))!;
    try {
      expect(after.prepare("SELECT * FROM history_retention").all()).toEqual(retention);
      expect(
        after
          .prepare(
            "SELECT event_id,total,workspace,session_id,occurred_at,provider_key FROM usage_compact ORDER BY event_id",
          )
          .all(),
      ).toEqual(original);
    } finally {
      after.close();
    }
  } finally {
    await harness.experimental_dispose();
  }
});

it("rejects unsafe control before opening the index for writes", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "bbp143-unsafe-"));
  roots.push(dataDir);
  const directory = join(dataDir, "history");
  await mkdir(directory);
  const path = join(directory, "usage-v1.sqlite");
  const db = (await openHistoryDatabase(path))!;
  initializeHistory(db, new Date(now).toISOString());
  db.close();
  await writeFile(join(directory, "collector-control-v1.json"), "invalid");
  const before = await readFile(path);
  const history = createHostHistory();
  try {
    expect(
      await history.prepare!({
        dataDir,
        signal: new AbortController().signal,
        identities: { hostId: "host_a", generation: 1, offset: 0, total: 0, rows: [] },
      }),
    ).toEqual({ state: "unavailable", reason: "storage-unavailable" });
    expect(await readFile(path)).toEqual(before);
  } finally {
    history.dispose();
  }
});
