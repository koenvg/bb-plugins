import { opendir, lstat } from "node:fs/promises";
import type { Dir } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, isAbsolute } from "node:path";
import { z } from "zod";
import type { HistoryDatabase } from "../storage/history-storage.js";
import type { RecordedUsageFact } from "../recorded-usage.js";
import { insertCompact, effectiveRetentionState } from "../storage/history-retention.js";
import {
  hash,
  responseId,
  responseKey,
  recordSourceMetadata,
  excludeNative,
} from "../storage/usage-metadata.js";
import { missing, openSource, proveDirectory, stamp } from "./native-source.js";

function sourcePath(home: string, relative: string) {
  const parts = relative.split("/");
  if (
    !["sessions", "archived_sessions"].includes(parts[0]) ||
    parts.some(
      (part) =>
        !part || part === "." || part === ".." || part.includes("\\") || part.includes("\0"),
    ) ||
    relative.length > 16384
  )
    throw Error("Native confinement unavailable");
  return join(home, relative);
}
const MAX_LINE = 1024 * 1024;
function scalar(raw: unknown, max = 256): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > max) return null;
  for (let index = 0; index < raw.length; index++) {
    const code = raw.charCodeAt(index);
    if (code < 32 || code === 127) return null;
  }
  return raw;
}
const object = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
const count = (raw: unknown): raw is number =>
  typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0;
type Context = {
  thread: string | null;
  root: string | null;
  workspace: string | null;
  turn: string | null;
  model: string | null;
  blocked: boolean;
};
const emptyContext = (): Context => ({
  thread: null,
  root: null,
  workspace: null,
  turn: null,
  model: null,
  blocked: false,
});
type Source = {
  name: string;
  identity: string;
  size: number;
  stamp: string;
  offset: number;
  edge: string;
  context: string;
  incomplete: number;
};
type Discovery = {
  home: string;
  directories: string[];
  reading: string;
  entry: number;
  fileAfter?: string;
};
type Options = { home?: () => string; now?: () => number; read?: () => void; lines?: number };
function uuid(key: string) {
  return `${key.slice(0, 8)}-${key.slice(8, 12)}-5${key.slice(13, 16)}-8${key.slice(17, 20)}-${key.slice(20, 32)}`;
}

/** Private source reader. The host queue owns admission and cursor acknowledgement. No report scans. */
export function createNativeUsage(options: Options = {}) {
  let directory: Dir | null = null;
  let directoryPath = "";
  let directoryProof = "";
  let entry = 0;
  const home = () =>
    resolve((options.home ?? (() => process.env.CODEX_HOME || join(homedir(), ".codex")))());
  async function close() {
    const held = directory;
    directory = null;
    if (held) await held.close();
  }
  async function available() {
    for (const root of ["sessions", "archived_sessions"]) {
      try {
        await lstat(join(home(), root));
        return true;
      } catch (error) {
        if (!missing(error)) throw error;
      }
    }
    return false;
  }
  async function prepareNativeUsage(db: HistoryDatabase, signal: AbortSignal) {
    signal.throwIfAborted();
    const deadline = performance.now() + 250;
    const saved = db
      .prepare("SELECT value,pending,incomplete FROM native_discovery WHERE id=1")
      .get() as { value: string; pending: number; incomplete: number } | undefined;
    let discovery: Discovery = saved
      ? JSON.parse(saved.value)
      : { home: home(), directories: ["sessions", "archived_sessions"], reading: "", entry: 0 };
    if (discovery.home !== home()) {
      await close();
      discovery = {
        home: home(),
        directories: ["sessions", "archived_sessions"],
        reading: "",
        entry: 0,
      };
    }
    if (!discovery.directories.length && !discovery.reading)
      discovery.directories = ["sessions", "archived_sessions"];
    let incomplete = saved?.incomplete ?? 0,
      discovered = 0;
    db.prepare("INSERT OR REPLACE INTO native_discovery VALUES (1,?,1,?)").run(
      JSON.stringify(discovery),
      incomplete,
    );
    try {
      while (discovered < 128 && performance.now() < deadline) {
        signal.throwIfAborted();
        if (!directory) {
          const name = discovery.reading || discovery.directories.shift();
          if (!name) break;
          discovery.reading = name;
          directoryPath = sourcePath(discovery.home, name);
          try {
            directoryProof = await proveDirectory(directoryPath);
            directory = await opendir(directoryPath, { bufferSize: 1 });
            entry = 0;
          } catch (error) {
            discovery.reading = "";
            discovery.entry = 0;
            if (!missing(error)) incomplete = 1;
            continue;
          }
        }
        // Reopen after a process interruption. Skipped entries consume the same bounded discovery budget.
        const item = await directory.read();
        discovered++;
        if (!item) {
          await close();
          discovery.reading = "";
          discovery.entry = 0;
          continue;
        }
        entry++;
        if (entry <= discovery.entry) continue;
        discovery.entry = entry;
        if ((await proveDirectory(directoryPath)) !== directoryProof)
          throw Error("Native directory changed");
        const relative = join(discovery.reading, item.name),
          path = sourcePath(discovery.home, relative);
        if (item.isSymbolicLink()) {
          incomplete = 1;
          continue;
        }
        if (item.isDirectory()) {
          discovery.directories.push(relative);
          continue;
        }
        if (!item.isFile() || !item.name.endsWith(".jsonl")) {
          if (!item.isFile()) incomplete = 1;
          continue;
        }
        const stat = await lstat(path);
        if (!stat.isFile() || stat.isSymbolicLink()) {
          incomplete = 1;
          continue;
        }
        db.prepare(`INSERT INTO native_sources VALUES (?,?,?, ?,0,'',?,0)
          ON CONFLICT(name) DO UPDATE SET size=CASE WHEN native_sources.stamp!=excluded.stamp THEN max(excluded.size,native_sources.offset+1) ELSE excluded.size END`).run(
          relative,
          "",
          stat.size,
          stamp(stat),
          JSON.stringify(emptyContext()),
        );
      }
      let bytes = 2 * 1024 * 1024,
        lines = Math.min(options.lines ?? 256, 256);
      // Small reads rotate by acknowledged progress; a large active file cannot monopolize the pass.
      let sources = db
        .prepare(
          "SELECT * FROM native_sources WHERE (offset<size OR identity='') AND name>? ORDER BY name LIMIT 128",
        )
        .all(discovery.fileAfter ?? "") as Source[];
      if (!sources.length)
        sources = db
          .prepare(
            "SELECT * FROM native_sources WHERE offset<size OR identity='' ORDER BY name LIMIT 128",
          )
          .all() as Source[];
      for (const source of sources) {
        if (bytes <= 0 || lines <= 0 || performance.now() >= deadline) break;
        signal.throwIfAborted();
        discovery.fileAfter = source.name;
        let opened;
        try {
          opened = await openSource(sourcePath(discovery.home, source.name));
        } catch {
          signal.throwIfAborted();
          db.prepare("UPDATE native_sources SET incomplete=1 WHERE name=?").run(source.name);
          incomplete = 1;
          continue;
        }
        try {
          let offset = source.offset,
            context: Context = JSON.parse(source.context),
            bad = source.incomplete;
          delete (context as Context & { tier?: unknown }).tier;
          if (
            source.identity !== opened.identity ||
            opened.size < offset ||
            (opened.size === offset && opened.stamp !== source.stamp)
          ) {
            offset = 0;
            context = emptyContext();
          }
          if (offset) {
            const edge = Buffer.alloc(Math.min(64, offset));
            await opened.file.read(edge, 0, edge.length, offset - edge.length);
            bytes -= edge.length;
            if (hash(edge.toString("hex")) !== source.edge) {
              offset = 0;
              context = emptyContext();
            }
          }
          const chunk = Buffer.alloc(
            Math.max(0, Math.min(MAX_LINE + 1, bytes, opened.size - offset)),
          );
          options.read?.();
          const { bytesRead } = await opened.file.read(chunk, 0, chunk.length, offset);
          bytes -= bytesRead;
          signal.throwIfAborted();
          const facts: RecordedUsageFact[] = [];
          let consumed = 0;
          while (consumed < bytesRead && lines > 0 && performance.now() < deadline) {
            signal.throwIfAborted();
            const end = chunk.indexOf(10, consumed);
            if (end < 0 || end >= bytesRead) {
              if (bytesRead - consumed >= MAX_LINE) bad = 1;
              break;
            }
            lines--;
            if (end - consumed > MAX_LINE) {
              bad = 1;
              break;
            }
            try {
              const row = object(
                JSON.parse(
                  new TextDecoder("utf-8", { fatal: true }).decode(chunk.subarray(consumed, end)),
                ),
              );
              const payload = object(row.payload);
              if (row.type === "session_meta") {
                const thread = scalar(payload.id),
                  workspace = scalar(payload.cwd, 16384);
                if (!context.thread) {
                  if (!thread || !workspace || !isAbsolute(workspace)) {
                    context.blocked = true;
                    bad = 1;
                  } else {
                    context.thread = thread;
                    context.root = scalar(payload.session_id);
                    context.workspace = workspace;
                  }
                } else if (thread !== context.thread) {
                  context.turn = null;
                  bad = 1;
                }
              } else if (row.type === "turn_context") {
                context.turn = scalar(payload.turn_id);
                context.model = scalar(payload.model, 128);
              } else if (row.type === "token_usage_record") {
                const fact = decodeFact(db, row, context, options.now?.() ?? Date.now());
                if (fact) facts.push(fact);
                else bad = 1;
              } else if (
                row.type === "event_msg" &&
                payload.type === "token_count" &&
                payload.info != null
              ) {
                // Snapshots have no stable request identity. Never admit them, including legacy-only segments.
                bad = 1;
              }
            } catch {
              context.turn = null;
              bad = 1;
            }
            consumed = end + 1;
          }
          await opened.verify();
          signal.throwIfAborted();
          const next = offset + consumed,
            edge = Buffer.alloc(Math.min(64, next));
          await opened.file.read(edge, 0, edge.length, next - edge.length);
          await opened.verify();
          signal.throwIfAborted();
          db.transaction(() => {
            for (const fact of facts) {
              signal.throwIfAborted();
              admitNative(db, fact, options.now?.() ?? Date.now());
            }
            db.prepare("INSERT OR REPLACE INTO native_sources VALUES (?,?,?,?,?,?,?,?)").run(
              source.name,
              opened.identity,
              opened.size,
              opened.stamp,
              next,
              hash(edge.toString("hex")),
              JSON.stringify(context),
              bad,
            );
            signal.throwIfAborted();
          });
        } finally {
          await opened.file.close();
        }
      }
      signal.throwIfAborted();
      const pending =
        !!discovery.reading ||
        discovery.directories.length > 0 ||
        !!db.prepare("SELECT name FROM native_sources WHERE offset<size LIMIT 1").get();
      db.prepare("INSERT OR REPLACE INTO native_discovery VALUES (1,?,?,?)").run(
        JSON.stringify(discovery),
        pending ? 1 : 0,
        incomplete,
      );
      const progress = db
        .prepare(
          "SELECT name,identity,size,offset,incomplete FROM native_sources ORDER BY name LIMIT 128",
        )
        .all();
      return {
        pending,
        progress: hash(JSON.stringify([discovery, pending, incomplete, progress])),
      };
    } catch (error) {
      await close();
      throw error;
    }
  }
  return { available, prepare: prepareNativeUsage, dispose: close };
}

function decodeFact(
  db: HistoryDatabase,
  row: Record<string, unknown>,
  context: Context,
  now: number,
): RecordedUsageFact | null {
  const payload = object(row.payload),
    usage = object(payload.usage),
    id = responseId(payload.response_id);
  const timestamp = z.iso.datetime({ offset: true }).safeParse(row.timestamp);
  if (
    context.blocked ||
    !context.thread ||
    !context.workspace ||
    !id ||
    payload.thread_id !== context.thread ||
    !timestamp.success ||
    Date.parse(timestamp.data) > now
  )
    return null;
  const input = usage.input_tokens,
    cached = usage.cached_input_tokens,
    output = usage.output_tokens,
    reasoning = usage.reasoning_output_tokens,
    total = usage.total_tokens,
    write = usage.cache_write_input_tokens ?? 0;
  if (
    ![input, cached, output, reasoning, total, write].every(count) ||
    !count(input) ||
    !count(cached) ||
    !count(output) ||
    !count(reasoning) ||
    !count(total) ||
    !count(write) ||
    cached > input ||
    reasoning > output ||
    !Number.isSafeInteger(input + output) ||
    total !== input + output
  )
    return null;
  const turnMatches = !!context.turn && payload.turn_id === context.turn;
  const key = responseKey(db, id);
  return {
    eventId: uuid(key),
    occurredAt: new Date(timestamp.data).toISOString(),
    workspace: context.workspace,
    model: turnMatches ? context.model : null,
    totalTokens: total,
    capturedCost: null,
    classes:
      write === 0
        ? { input: input - cached, cacheRead: cached, cacheWrite: 0, output, reasoning }
        : null,
    source: {
      kind: "codex-native",
      responseId: id,
      providerThreadId: context.thread,
      rootSessionId: scalar(payload.session_id) ?? context.root,
    },
  };
}
function admitNative(db: HistoryDatabase, fact: RecordedUsageFact, now: number) {
  if (fact.source.kind !== "codex-native") throw Error("Native admission unavailable");
  const key = responseKey(db, fact.source.responseId),
    retention = effectiveRetentionState(db, now);
  const proof = hash(
    JSON.stringify({
      ...fact,
      source: {
        kind: "codex-native",
        responseId: fact.source.responseId,
        providerThreadId: fact.source.providerThreadId,
      },
    }),
  );
  const owner = db.prepare("SELECT * FROM usage_response_owners WHERE response_key=?").get(key) as
    | {
        pi_event: string | null;
        native_event: string | null;
        native_evidence: string | null;
        native_conflicted: number;
      }
    | undefined;
  if (owner?.native_evidence && owner.native_evidence !== proof) {
    if (owner.native_event) excludeNative(db, owner.native_event);
    db.prepare("UPDATE usage_response_owners SET native_conflicted=1 WHERE response_key=?").run(
      key,
    );
    return;
  }
  if (owner?.native_event || owner?.pi_event) return;
  if (
    fact.occurredAt < retention.compact_cutoff ||
    db.prepare("SELECT event_id FROM usage_expired WHERE event_id=?").get(fact.eventId)
  )
    return;
  const classes = fact.classes ?? {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
  };
  const payload = JSON.stringify({
    version: 1,
    eventId: fact.eventId,
    provenance: "imported",
    occurredAt: fact.occurredAt,
    sessionId: `codex-native:${fact.source.providerThreadId}`,
    workspace: fact.workspace,
    providerSessionKey: null,
    claimedThreadId: null,
    provider: "openai-codex",
    model: fact.model ?? "unavailable",
    inputTokens: classes.input,
    outputTokens: classes.output,
    reasoningTokens: classes.reasoning,
    cacheReadTokens: classes.cacheRead,
    cacheWriteTokens: classes.cacheWrite,
    totalTokens: fact.totalTokens,
    capturedCost: null,
  });
  insertCompact(db, payload, 1, 1);
  if (fact.classes && fact.occurredAt >= retention.detail_cutoff)
    db.prepare("INSERT INTO usage_events VALUES (?,?,?,?,?,1,1)").run(
      fact.eventId,
      `codex-native:${fact.source.providerThreadId}`,
      fact.workspace,
      fact.totalTokens,
      payload,
    );
  else db.prepare("UPDATE usage_compact SET detail_available=0 WHERE event_id=?").run(fact.eventId);
  db.prepare(
    "INSERT INTO workspace_totals VALUES (?,?,1) ON CONFLICT(workspace) DO UPDATE SET total_tokens=total_tokens+excluded.total_tokens,events=events+1",
  ).run(fact.workspace, fact.totalTokens);
  const totals = db
    .prepare("SELECT total_tokens,events FROM workspace_totals WHERE workspace=?")
    .get(fact.workspace) as { total_tokens: number; events: number };
  if (![totals.total_tokens, totals.events].every(count)) throw Error("Native total unavailable");
  recordSourceMetadata(
    db,
    fact.eventId,
    "codex-native",
    fact.source.providerThreadId,
    !!fact.classes,
  );
  db.prepare("INSERT INTO usage_response_owners VALUES (?,NULL,?,?,0)").run(
    key,
    fact.eventId,
    proof,
  );
  // Provider-qualified identity cannot collide with legacy Pi identities or claims.
  db.prepare("INSERT OR IGNORE INTO identity_imports VALUES (?,?,?)").run(
    `codex-native:${fact.source.providerThreadId}`,
    `codex-native:${fact.source.providerThreadId}`,
    fact.workspace,
  );
  db.prepare("UPDATE identity_receipt SET revision=revision+1 WHERE id=1").run();
}
