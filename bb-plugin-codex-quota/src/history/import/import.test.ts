import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { openHistoryDatabase } from "../storage/history-storage.js";
import { initializeHistory, projectCompactRecord } from "../storage/history-projection.js";
import { initializeIdentityStorage, acceptIdentityBatch } from "../identity/identity-storage.js";
import { executeImport } from "./import-engine.js";
const owned: string[] = [];
afterEach(async () => {
  await Promise.all(owned.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
const instant = "2026-10-01T00:00:00.000Z";
export const header = (id = "pi-a", cwd = "/unused", parentSession?: string) => ({
  type: "session",
  version: 3,
  id,
  cwd,
  timestamp: instant,
  ...(parentSession ? { parentSession } : {}),
});
export const message = (id = "entry-a", parentId: string | null = null) => ({
  type: "message",
  id,
  parentId,
  timestamp: instant,
  message: {
    role: "assistant",
    provider: "openai-codex",
    model: "synthetic",
    timestamp: Date.parse(instant),
    content: [{ type: "text", text: "PRIVATE_PROMPT_TOOL_SECRET" }],
    usage: {
      input: 2,
      output: 3,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 5,
      cost: { total: 0.02 },
    },
  },
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "bbp22-test-"));
  owned.push(root);
  const sources = join(root, "custom-root"),
    workspace = join(root, "workspace");
  await mkdir(sources);
  await mkdir(workspace);
  const db = (await openHistoryDatabase(join(root, "usage.sqlite")))!;
  initializeHistory(db, instant);
  initializeIdentityStorage(db);
  acceptIdentityBatch(db, {
    hostId: "host-a",
    generation: 1,
    offset: 0,
    total: 1,
    rows: [
      {
        providerIdentity: "provider-a",
        threadId: "thr_a",
        title: null,
        state: "available",
      },
    ],
  });
  let reads = 0;
  const opts = {
    signal: new AbortController().signal,
    now: () => Date.parse("2026-10-03T00:00:00.000Z"),
    bodyRead: () => {
      reads++;
    },
  };
  const run = (command: any, options = {}) =>
    executeImport(db, "host-a", command, [workspace], { ...opts, ...options });
  const config = {
    bbRoot: sources,
    ordinaryRoots: [],
    workspaces: [workspace],
  };
  const path = join(sources, "provider-a.jsonl");
  await writeFile(
    path,
    [header("pi-a", workspace), message()].map(JSON.stringify).join("\n") + "\n",
  );
  return {
    root,
    sources,
    workspace,
    db,
    path,
    config,
    run,
    reads: () => reads,
  };
}

it("does not admit unresolved live overlap after detail expiry and reopen", async () => {
  const f = await fixture();
  const time = "2026-08-01T00:00:00.000Z";
  try {
    const old = {
      ...message(),
      timestamp: time,
      message: { ...message().message, timestamp: Date.parse(time) },
    };
    await writeFile(
      f.path,
      [header("pi-a", f.workspace), old].map(JSON.stringify).join("\n") + "\n",
    );
    projectCompactRecord(f.db, {
      version: 1,
      eventId: "00000000-0000-4000-8000-000000000001",
      provenance: "observed",
      occurredAt: time,
      sessionId: "pi-a",
      workspace: f.workspace,
      providerSessionKey: null,
      claimedThreadId: null,
      provider: "openai-codex",
      model: "synthetic",
      inputTokens: 2,
      outputTokens: 3,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      totalTokens: 5,
      capturedCost: 0.02,
    });
    const { maintainHistory } = await import("../storage/history-retention.js");
    maintainHistory(f.db, Date.parse("2026-10-03T00:00:00Z"));
    expect(f.db.prepare("SELECT count(*) AS n FROM usage_events").get()).toEqual({ n: 0 });
    await f.run({ action: "configure", configuration: f.config });
    let v = await f.run({ action: "start" });
    for (let n = 0; v.generation?.state === "stopped" && n < 12; n++)
      v = await f.run({ action: "resume" });
    expect(v.generation).toMatchObject({
      state: "completed",
      records: 0,
      omissions: 1,
      diagnostics: ["unresolved-overlap"],
    });
    expect(f.db.prepare("SELECT total_tokens,events FROM workspace_totals").get()).toEqual({
      total_tokens: 5,
      events: 1,
    });
    const reopened = (await openHistoryDatabase(join(f.root, "usage.sqlite")))!;
    try {
      expect(
        reopened.prepare("SELECT provenance,confirmed,total FROM usage_compact").all(),
      ).toEqual([{ provenance: "observed", confirmed: 0, total: 5 }]);
    } finally {
      reopened.close();
    }
  } finally {
    f.db.close();
  }
});

it("feeds real frozen import omissions, empty results and cancellation into scoped coverage", async () => {
  const { readCoverage, recordCoverage } = await import("../collection/history-coverage.js");
  for (const kind of ["missing", "invalid", "empty", "canceled"]) {
    const f = await fixture();
    try {
      if (kind === "missing") {
        const { unlink } = await import("node:fs/promises");
        await unlink(f.path);
      }
      if (kind === "empty")
        await writeFile(f.path, JSON.stringify(header("pi-a", f.workspace)) + "\n");
      if (kind === "invalid")
        await writeFile(
          f.path,
          [
            header("pi-a", f.workspace),
            { ...message(), message: { ...message().message, usage: { input: -1 } } },
          ]
            .map(JSON.stringify)
            .join("\n") + "\n",
        );
      await f.run({ action: "configure", configuration: f.config });
      let view = await f.run({ action: "start" });
      if (kind === "canceled") view = await f.run({ action: "cancel" });
      else
        for (let n = 0; view.generation?.state === "stopped" && n < 12; n++)
          view = await f.run({ action: "resume" });
      const query = {
        start: "2026-10-01T00:00:00Z",
        end: "2026-10-02T00:00:00Z",
        workspace: f.workspace,
      };
      recordCoverage(f.db, {
        ...query,
        id: "live-inactivity",
        threadId: null,
        kind: "observed-inactivity",
      });
      expect(readCoverage(f.db, query), kind).toMatchObject({
        zero: false,
        state: "incomplete",
        uncertain: true,
      });
      if (kind === "missing") expect(readCoverage(f.db, query).omissions).toBe(1);
      if (kind === "canceled") expect(readCoverage(f.db, query).backlog).toBe(false);
      expect(readCoverage(f.db, { ...query, workspace: "/other" }), kind).toMatchObject(
        ["empty", "invalid"].includes(kind)
          ? { omissions: 0, uncertain: false, backlog: false }
          : { zero: false, uncertain: true, backlog: false },
      );
      expect(
        readCoverage(f.db, {
          ...query,
          start: "2026-10-04T00:00:00Z",
          end: "2026-10-05T00:00:00Z",
        }),
        kind,
      ).toMatchObject({ omissions: 0, uncertain: false, backlog: false });
      expect(
        readCoverage(f.db, { ...query, workspace: undefined, verifiedThread: "thr_unknown" }),
        kind,
      ).toMatchObject({ zero: false, uncertain: true });
    } finally {
      f.db.close();
    }
  }
});
it("status and configuration never consume transcript bytes; missing roots are explicit", async () => {
  const f = await fixture();
  try {
    expect((await f.run({ action: "status" })).reason).toBe("not-configured");
    expect((await f.run({ action: "configure", configuration: f.config })).reason).toBe("ok");
    await f.run({ action: "status" });
    expect(f.reads()).toBe(0);
  } finally {
    f.db.close();
  }
});
it("persists frozen progress and runs only on explicit resume, with no partial text stored", async () => {
  const f = await fixture();
  try {
    await f.run({ action: "configure", configuration: f.config });
    let v = await f.run({ action: "start" }, { rows: 1 });
    expect(v.generation?.state).toBe("stopped");
    expect(v.generation?.startAt).toBe("2026-06-24T00:00:00.000Z");
    const reads = f.reads();
    await f.run({ action: "status" });
    expect(f.reads()).toBe(reads);
    expect((await f.run({ action: "start" })).reason).toBe("unfinished-generation");
    for (let i = 0; i < 10 && v.generation?.state !== "completed"; i++)
      v = await f.run({ action: "resume" });
    expect(v.generation?.state).toBe("completed");
    expect(f.db.prepare("SELECT total_tokens FROM workspace_totals").get()).toEqual({
      total_tokens: 5,
    });
    expect(JSON.stringify(f.db.prepare("SELECT payload FROM usage_events").all())).not.toContain(
      "PRIVATE_PROMPT_TOOL_SECRET",
    );
    expect((await f.run({ action: "configure", configuration: f.config })).reason).toBe("ok");
  } finally {
    f.db.close();
  }
});
async function finish(f: Awaited<ReturnType<typeof fixture>>, options = {}) {
  let v = await f.run({ action: "resume" }, options);
  for (let i = 0; i < 30 && v.generation?.state === "stopped"; i++)
    v = await f.run({ action: "resume" }, options);
  return v;
}
async function start(f: Awaited<ReturnType<typeof fixture>>, configuration = f.config) {
  expect((await f.run({ action: "configure", configuration })).reason).toBe("ok");
  return f.run({ action: "start" });
}
it("rejects missing roots, unknown workspaces and host/path collisions without bytes", async () => {
  const f = await fixture();
  try {
    expect(
      (
        await f.run({
          action: "configure",
          configuration: { ...f.config, bbRoot: join(f.root, "missing") },
        })
      ).reason,
    ).toBe("invalid-configuration");
    const adjacent = join(f.root, "workspace-other");
    await mkdir(adjacent);
    expect(
      (
        await f.run({
          action: "configure",
          configuration: { ...f.config, workspaces: [adjacent] },
        })
      ).reason,
    ).toBe("invalid-configuration");
    await start(f);
    expect(
      (
        await executeImport(f.db, "host-b", { action: "resume" }, [f.workspace], {
          signal: new AbortController().signal,
        })
      ).reason,
    ).toBe("foreign-host");
    expect(f.reads()).toBe(0);
    expect(
      (
        await f.run({
          action: "configure",
          configuration: { ...f.config, bbRoot: f.root },
        })
      ).reason,
    ).toBe("unfinished-generation");
  } finally {
    f.db.close();
  }
});
it("omits candidate symlinks before reading bytes", async () => {
  const f = await fixture();
  try {
    const { symlink } = await import("node:fs/promises");
    const outside = join(f.root, "outside.jsonl");
    await writeFile(outside, JSON.stringify(header("outside", f.workspace)) + "\n");
    await rm(f.path);
    await symlink(outside, f.path);
    await start(f);
    const v = await finish(f);
    expect(f.reads()).toBe(0);
    expect(v.generation?.omissions).toBe(1);
    expect(v.generation?.diagnostics).toContain("missing-source");
  } finally {
    f.db.close();
  }
});
it("omits wrong-workspace, invalid headers and malformed UTF-8 records with content-free diagnostics", async () => {
  const f = await fixture();
  try {
    await writeFile(
      f.path,
      JSON.stringify(header("pi-a", f.workspace + "-other")) +
        "\n" +
        JSON.stringify(message()) +
        "\n",
    );
    await start(f);
    let v = await finish(f);
    expect(v.generation?.diagnostics).toContain("workspace-unverified");
    expect(f.db.prepare("SELECT * FROM workspace_totals").all()).toEqual([]);
    await writeFile(f.path, JSON.stringify(header("pi-a", f.workspace)) + "\n");
    const { appendFile } = await import("node:fs/promises");
    await appendFile(f.path, Buffer.from([0xff, 0x0a]));
    await appendFile(f.path, "{PRIVATE_MALFORMED_SECRET}\n");
    await f.run({ action: "start" });
    v = await finish(f);
    expect(v.generation?.omissions).toBe(2);
    expect(v.generation?.diagnostics).toEqual(["invalid-record"]);
    expect(JSON.stringify(v)).not.toContain("PRIVATE_");
  } finally {
    f.db.close();
  }
});
it("freezes identities at header verification and omits replaced or truncated sources on resume", async () => {
  for (const replace of [false, true]) {
    const f = await fixture();
    try {
      await start(f);
      await f.run({ action: "resume" }, { rows: 1 });
      const old = f.reads();
      if (replace) {
        const { rename } = await import("node:fs/promises");
        await rename(f.path, f.path + ".old");
      }
      await writeFile(f.path, JSON.stringify(header("pi-a", f.workspace)) + "\n");
      const v = await finish(f);
      expect(v.generation?.diagnostics).toContain("source-changed");
      expect(f.reads()).toBe(old);
      expect(f.db.prepare("SELECT * FROM workspace_totals").all()).toEqual([]);
    } finally {
      f.db.close();
    }
  }
});
it("bounds oversized UTF-8 records, preserves original values and accepts distinct equal-valued entries", async () => {
  const f = await fixture();
  try {
    await writeFile(
      f.path,
      [
        header("pi-a", f.workspace),
        {
          type: "message",
          id: "large",
          parentId: null,
          payload: "秘密".repeat(400000),
        },
        message("first"),
        message("second", "first"),
      ]
        .map(JSON.stringify)
        .join("\n") + "\n",
    );
    await start(f);
    const v = await finish(f, { bytes: 2 * 1024 * 1024, rows: 2 });
    expect(v.generation?.diagnostics).toContain("oversize-record");
    expect(f.db.prepare("SELECT total_tokens FROM workspace_totals").get()).toEqual({
      total_tokens: 10,
    });
    const records = f.db.prepare("SELECT payload FROM usage_events").all() as {
      payload: string;
    }[];
    for (const row of records) {
      const r = JSON.parse(row.payload);
      expect(r.occurredAt).toBe(instant);
      expect(r.capturedCost).toBe(0.02);
      expect(r.totalTokens).toBe(5);
      expect(r.workspace).toBe(f.workspace);
      expect(r.provenance).toBe("imported");
      expect(row.payload).not.toContain("秘密");
    }
    expect(v.generation?.coverage).toBe("partial");
  } finally {
    f.db.close();
  }
});
it("confirmed live overlap retains the original first owner and excludes imported replay", async () => {
  const f = await fixture();
  try {
    const { usageRecordSchema } = await import("../collection/usage-record.js");
    const live = usageRecordSchema.parse({
      version: 1,
      eventId: "00000000-0000-4000-8000-000000000001",
      provenance: "observed",
      occurredAt: instant,
      sessionId: "pi-a",
      workspace: f.workspace,
      providerSessionKey: "provider-a.jsonl",
      claimedThreadId: null,
      provider: "openai-codex",
      model: "synthetic",
      inputTokens: 2,
      outputTokens: 3,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      totalTokens: 5,
      capturedCost: 0.02,
    });
    f.db.transaction(() => {
      projectCompactRecord(f.db, live);
      projectCompactRecord(f.db, {
        version: 1,
        eventId: live.eventId,
        sessionId: "pi-a",
        entryId: "entry-a",
      });
    });
    const owner = f.db.prepare("SELECT * FROM usage_entry_owners").get();
    await start(f);
    await finish(f);
    expect(f.db.prepare("SELECT total_tokens FROM workspace_totals").get()).toEqual({
      total_tokens: 5,
    });
    expect(f.db.prepare("SELECT * FROM usage_entry_owners").get()).toEqual(owner);
    expect(
      (
        f.db.prepare("SELECT payload FROM usage_events WHERE event_id=?").get(live.eventId) as {
          payload: string;
        }
      ).payload,
    ).toBe(JSON.stringify(live));
    await f.run({ action: "start" });
    await finish(f);
    expect(f.db.prepare("SELECT total_tokens FROM workspace_totals").get()).toEqual({
      total_tokens: 5,
    });
  } finally {
    f.db.close();
  }
});
it("quarantines unconfirmed overlap, without matching equal tokens or times", async () => {
  const f = await fixture();
  try {
    const { importedUsage } = await import("./import-parser.js");
    const parsed = importedUsage(message(), "pi-a", f.workspace, "provider-a.jsonl");
    if (parsed.kind !== "usage") throw Error("fixture invalid");
    projectCompactRecord(f.db, {
      ...parsed.record,
      eventId: "00000000-0000-4000-8000-000000000002",
      provenance: "observed",
    });
    await start(f);
    const v = await finish(f);
    expect(v.generation?.diagnostics).toContain("unresolved-overlap");
    expect(f.db.prepare("SELECT count(*) AS n FROM usage_events").get()).toEqual({ n: 1 });
    expect(f.db.prepare("SELECT total_tokens FROM workspace_totals").get()).toEqual({
      total_tokens: 5,
    });
  } finally {
    f.db.close();
  }
});
it("imports proven fork ancestry once and accepts the new child branch", async () => {
  const f = await fixture();
  try {
    const ordinary = join(f.root, "ordinary");
    await mkdir(ordinary);
    await writeFile(
      join(ordinary, "fork.jsonl"),
      [header("pi-fork", f.workspace, f.path), message(), message("novel", "entry-a")]
        .map(JSON.stringify)
        .join("\n") + "\n",
    );
    await start(f, { ...f.config, ordinaryRoots: [ordinary] });
    const v = await finish(f);
    expect(
      v.generation?.omissions,
      JSON.stringify({
        v,
        entries: f.db.prepare("SELECT * FROM import_entries").all(),
        events: f.db.prepare("SELECT event_id,accepted FROM usage_events").all(),
      }),
    ).toBe(0);
    expect(v.generation?.replayed).toBe(1);
    expect(f.db.prepare("SELECT total_tokens FROM workspace_totals").get()).toEqual({
      total_tokens: 10,
    });
    expect(f.db.prepare("SELECT session_id FROM usage_events ORDER BY session_id").all()).toEqual([
      { session_id: "pi-a" },
      { session_id: "pi-fork" },
    ]);
  } finally {
    f.db.close();
  }
});
it("does not count unsupported ancestry or copied IDs without parent proof", async () => {
  const f = await fixture();
  try {
    const ordinary = join(f.root, "ordinary");
    await mkdir(ordinary);
    await writeFile(
      join(ordinary, "uncertain.jsonl"),
      [header("pi-copy", f.workspace), message()].map(JSON.stringify).join("\n") + "\n",
    );
    await writeFile(
      join(ordinary, "foreign-parent.jsonl"),
      [header("pi-fork", f.workspace, join(f.root, "outside.jsonl")), message()]
        .map(JSON.stringify)
        .join("\n") + "\n",
    );
    await start(f, { ...f.config, ordinaryRoots: [ordinary] });
    const v = await finish(f);
    expect(v.generation?.diagnostics).toContain("unresolved-ancestry");
    expect(f.db.prepare("SELECT total_tokens FROM workspace_totals").get()).toEqual({
      total_tokens: 5,
    });
  } finally {
    f.db.close();
  }
});
it("supports owning-host workspace aliases but never retargets roots after freeze", async () => {
  const f = await fixture();
  try {
    const { symlink, rename } = await import("node:fs/promises");
    const alias = join(f.root, "workspace-alias");
    await symlink(f.workspace, alias);
    await start(f, { ...f.config, workspaces: [alias] });
    const saved = (await f.run({ action: "status" })).generation;
    await rename(f.sources, f.sources + "-old");
    await mkdir(f.sources);
    const old = f.reads(),
      v = await f.run({ action: "resume" });
    expect(v.generation?.id).toBe(saved?.id);
    expect(v.generation?.startAt).toBe(saved?.startAt);
    expect(v.generation?.diagnostics).toContain("source-changed");
    expect(f.reads()).toBe(old);
    await f.run({ action: "cancel" });
    expect((await f.run({ action: "resume" })).reason).toBe("no-generation");
  } finally {
    f.db.close();
  }
});
it("yields to cancellation without committing an interrupted message slice", async () => {
  const f = await fixture();
  try {
    await writeFile(
      f.path,
      [header("pi-a", f.workspace), ...Array.from({ length: 100 }, (_, i) => message("e" + i))]
        .map(JSON.stringify)
        .join("\n") + "\n",
    );
    await start(f);
    await f.run({ action: "resume" });
    const controller = new AbortController();
    const v = await f.run(
      { action: "resume" },
      { signal: controller.signal, bodyRead: () => controller.abort() },
    );
    expect(v.reason).toBe("selection-changed");
    expect(f.db.prepare("SELECT * FROM usage_events").all()).toEqual([]);
    const completed = await finish(f);
    expect(completed.generation?.records).toBe(100);
    expect(completed.generation?.diagnostics).toContain("interrupted");
  } finally {
    f.db.close();
  }
});
// Real filesystem and SQLite work across 101 identities can exceed Vitest's 5s default on CI.
it("paginates frozen BB identities and bounds ordinary discovery without scanning BB directories", async () => {
  const f = await fixture();
  try {
    const ordinary = join(f.root, "ordinary");
    await mkdir(ordinary);
    await Promise.all(
      Array.from({ length: 257 }, (_, i) => writeFile(join(ordinary, `noise-${i}`), "owned")),
    );
    const rows = Array.from({ length: 101 }, (_, i) => ({
      providerIdentity: `provider-${String(i).padStart(3, "0")}`,
      threadId: "thr_a",
      title: null,
      state: "available" as const,
    }));
    for (let offset = 0; offset < 101; offset += 100)
      acceptIdentityBatch(f.db, {
        hostId: "host-a",
        generation: 2,
        offset,
        total: 101,
        rows: rows.slice(offset, offset + 100),
      });
    await start(f, { ...f.config, ordinaryRoots: [ordinary] });
    expect((await f.run({ action: "status" })).generation?.candidates).toBe(100);
    acceptIdentityBatch(f.db, {
      hostId: "host-a",
      generation: 3,
      offset: 0,
      total: 1,
      rows: [{ ...rows[0], providerIdentity: "later-provider" }],
    });
    const v = await finish(f);
    expect(v.generation?.candidates).toBe(102);
    expect(v.generation?.diagnostics).toContain("discovery-limit");
    expect(
      f.db.prepare("SELECT 1 FROM import_candidates WHERE name='later-provider.jsonl'").get(),
    ).toBeUndefined();
    expect(v.generation?.coverage).toBe("partial");
  } finally {
    f.db.close();
  }
}, 15_000);
it("preserves the original imported owner when a second confirmed provider path carries the same session", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.sources, "provider-b.jsonl"), await readFile(f.path));
    acceptIdentityBatch(f.db, {
      hostId: "host-a",
      generation: 2,
      offset: 0,
      total: 1,
      rows: [
        {
          providerIdentity: "provider-b",
          threadId: "thr_a",
          title: null,
          state: "available",
        },
      ],
    });
    await start(f);
    await finish(f);
    expect(f.db.prepare("SELECT total_tokens FROM workspace_totals").get()).toEqual({
      total_tokens: 5,
    });
    expect(f.db.prepare("SELECT count(*) AS n FROM usage_entry_owners").get()).toEqual({ n: 1 });
    expect(f.db.prepare("SELECT conflicted FROM usage_entry_owners").get()).toEqual({
      conflicted: 0,
    });
    expect(
      (
        f.db.prepare("SELECT payload FROM usage_events").get() as {
          payload: string;
        }
      ).payload,
    ).toContain('"providerSessionKey":"provider-a.jsonl"');
  } finally {
    f.db.close();
  }
});
it("reserves unresolved scalar exclusions across later imports and never resurrects their numeric contribution", async () => {
  const f = await fixture();
  try {
    const { importedUsage } = await import("./import-parser.js");
    const p = importedUsage(message(), "pi-a", f.workspace, "provider-a.jsonl");
    if (p.kind !== "usage") throw Error("Invalid fixture");
    const live = {
      ...p.record,
      eventId: "00000000-0000-4000-8000-000000000005",
      provenance: "observed" as const,
    };
    projectCompactRecord(f.db, live);
    await start(f);
    await finish(f);
    expect(f.db.prepare("SELECT event_id FROM usage_conflicts").get()).toEqual({
      event_id: p.record.eventId,
    });
    projectCompactRecord(f.db, {
      version: 1,
      eventId: live.eventId,
      sessionId: "pi-a",
      entryId: "entry-a",
    });
    await f.run({ action: "start" });
    await finish(f);
    expect(
      f.db.prepare("SELECT accepted FROM usage_events WHERE event_id=?").get(p.record.eventId),
    ).toEqual({ accepted: 0 });
    expect(f.db.prepare("SELECT total_tokens FROM workspace_totals").get()).toEqual({
      total_tokens: 5,
    });
  } finally {
    f.db.close();
  }
});
it("classifies malformed and oversize headers without binding their claims", async () => {
  for (const bytes of [
    Buffer.from([0xff, 10]),
    Buffer.from("PRIVATE_HEADER".repeat(6000) + "\n"),
  ]) {
    const f = await fixture();
    try {
      await writeFile(f.path, bytes);
      await start(f);
      const v = await finish(f);
      expect(v.generation?.omissions).toBe(1);
      expect(v.generation?.diagnostics).toEqual([
        bytes.length > 65536 ? "oversize-record" : "invalid-record",
      ]);
      expect(f.db.prepare("SELECT * FROM identity_imports").all()).toEqual([]);
      expect(JSON.stringify(v)).not.toContain("PRIVATE_");
    } finally {
      f.db.close();
    }
  }
});
it("rejects a source replacement during the read and persists no body fragments", async () => {
  const f = await fixture();
  try {
    await start(f);
    await f.run({ action: "resume" });
    const { renameSync, writeFileSync } = await import("node:fs");
    let replaced = false;
    const v = await f.run(
      { action: "resume" },
      {
        bodyRead: () => {
          if (!replaced) {
            replaced = true;
            renameSync(f.path, f.path + ".old");
            writeFileSync(f.path, "PRIVATE_REPLACEMENT\n");
          }
        },
      },
    );
    expect(v.generation?.diagnostics).toContain("source-changed");
    expect(f.db.prepare("SELECT * FROM usage_events").all()).toEqual([]);
    const path = join(f.root, "usage.sqlite");
    expect((await readFile(path)).includes(Buffer.from("PRIVATE_REPLACEMENT"))).toBe(false);
    expect((await readFile(path)).includes(Buffer.from("PRIVATE_PROMPT_TOOL_SECRET"))).toBe(false);
  } finally {
    f.db.close();
  }
});
it("clamps the retained month boundary and keeps missing prices explicit", async () => {
  const f = await fixture();
  try {
    const m = message();
    m.message.usage.cost.total = 0;
    await writeFile(f.path, [header("pi-a", f.workspace), m].map(JSON.stringify).join("\n") + "\n");
    await f.run({ action: "configure", configuration: f.config });
    const v = await f.run(
      { action: "start" },
      { now: () => Date.parse("2026-05-31T12:00:00.000Z") },
    );
    expect(v.generation?.startAt).toBe("2026-02-19T12:00:00.000Z");
    await finish(f);
    expect(f.db.prepare("SELECT * FROM usage_events").all()).toEqual([]);
    await f.run({ action: "start" });
    await finish(f);
    expect(
      JSON.parse(
        (
          f.db.prepare("SELECT payload FROM usage_events").get() as {
            payload: string;
          }
        ).payload,
      ).capturedCost,
    ).toBeNull();
  } finally {
    f.db.close();
  }
});
it.each([false, true])(
  "uses the confirmed live owner through fork ancestry, chained=%s",
  async (chained) => {
    const f = await fixture();
    try {
      const { importedUsage } = await import("./import-parser.js");
      const usage = importedUsage(message(), "pi-a", f.workspace, "provider-a.jsonl");
      if (usage.kind !== "usage") throw Error("Invalid synthetic record");
      const live = {
        ...usage.record,
        eventId: "00000000-0000-4000-8000-000000000001",
        claimedThreadId: "thr_captured",
        provenance: "observed" as const,
      };
      f.db.transaction(() => {
        projectCompactRecord(f.db, live);
        projectCompactRecord(f.db, {
          version: 1,
          eventId: live.eventId,
          sessionId: live.sessionId,
          entryId: "entry-a",
        });
      });
      const ordinary = join(f.root, "ordinary");
      await mkdir(ordinary);
      const fork = join(ordinary, "fork.jsonl");
      await writeFile(
        fork,
        [header("pi-fork", f.workspace, f.path), message(), message("novel", "entry-a")]
          .map(JSON.stringify)
          .join("\n") + "\n",
      );
      if (chained)
        await writeFile(
          join(ordinary, "chained.jsonl"),
          [
            header("pi-chained", f.workspace, fork),
            message(),
            message("novel", "entry-a"),
            message("grandchild", "novel"),
          ]
            .map(JSON.stringify)
            .join("\n") + "\n",
        );
      await start(f, { ...f.config, ordinaryRoots: [ordinary] });
      const v = await finish(f);
      expect(v.generation?.omissions).toBe(0);
      expect(v.generation?.replayed).toBe(chained ? 3 : 1);
      expect(f.db.prepare("SELECT total_tokens FROM workspace_totals").get()).toEqual({
        total_tokens: chained ? 15 : 10,
      });
      expect(
        (
          f.db.prepare("SELECT payload FROM usage_events WHERE event_id=?").get(live.eventId) as {
            payload: string;
          }
        ).payload,
      ).toBe(JSON.stringify(live));
      expect(
        f.db.prepare("SELECT event_id FROM import_entries WHERE entry='entry-a'").all(),
      ).toEqual(
        Array.from({ length: chained ? 3 : 2 }, () => ({
          event_id: live.eventId,
        })),
      );
      expect(
        f.db.prepare("SELECT event_id FROM usage_entry_owners WHERE session_id='pi-a'").get(),
      ).toEqual({ event_id: live.eventId });
    } finally {
      f.db.close();
    }
  },
);
it("does not use an excluded canonical owner as fork evidence", async () => {
  const f = await fixture();
  try {
    const { importedUsage } = await import("./import-parser.js");
    const usage = importedUsage(message(), "pi-a", f.workspace, "provider-a.jsonl");
    if (usage.kind !== "usage") throw Error("Invalid fixture");
    const live = {
      ...usage.record,
      eventId: "00000000-0000-4000-8000-000000000001",
      provenance: "observed" as const,
    };
    const conflict = {
      ...live,
      eventId: "00000000-0000-4000-8000-000000000002",
      capturedCost: 0.03,
    };
    for (const record of [live, conflict]) {
      projectCompactRecord(f.db, record);
      projectCompactRecord(f.db, {
        version: 1,
        eventId: record.eventId,
        sessionId: "pi-a",
        entryId: "entry-a",
      });
    }
    const ordinary = join(f.root, "ordinary");
    await mkdir(ordinary);
    await writeFile(
      join(ordinary, "fork.jsonl"),
      [header("pi-fork", f.workspace, f.path), message(), message("novel", "entry-a")]
        .map(JSON.stringify)
        .join("\n") + "\n",
    );
    await start(f, { ...f.config, ordinaryRoots: [ordinary] });
    const v = await finish(f);
    expect(v.generation?.omissions).toBe(2);
    expect(v.generation?.replayed).toBe(0);
    expect(v.generation?.diagnostics).toEqual(["unresolved-ancestry"]);
    expect(f.db.prepare("SELECT * FROM workspace_totals").all()).toEqual([]);
    expect(f.db.prepare("SELECT event_id,conflicted FROM usage_entry_owners").get()).toEqual({
      event_id: live.eventId,
      conflicted: 1,
    });
  } finally {
    f.db.close();
  }
});
