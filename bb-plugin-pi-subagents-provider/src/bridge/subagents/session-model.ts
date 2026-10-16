import { constants, type Stats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { basename, dirname, join, parse, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { boundedValue, type Capture } from "../../subagents-contract.js";
import { resolvePiBridgeSessionDir } from "../session-paths.js";
import type { CaptureTarget } from "./capture.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const text = z.string().min(1).max(4096);
const factSchema = z.object({
  event: z.enum(["subagent:async-started", "subagent:async-complete"]),
  sessionId: text,
  sessionFile: text,
  id: z.string().regex(uuid),
  owner: text,
  mode: z.string(),
  unsupported: z.boolean(),
  sessionRoot: text.optional(),
  routeRootId: z.string().regex(uuid).optional(),
  success: z.boolean().optional(),
  state: z.string().optional(),
  timestamp: z.number().int().nonnegative().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  count: z.number().int().optional(),
  child: z
    .object({
      index: z.literal(0).optional(),
      context: z.string().optional(),
      success: z.boolean(),
      sessionFile: text.optional(),
      sessionPath: text.optional(),
    })
    .optional(),
});
type Fact = z.infer<typeof factSchema>;
type Ancestry = { path: string; stat: Stats }[];
type Launch = { start: string; root: string; file: string; headerId: string };
type SessionModelEvidence =
  | { state: "probing"; launch: Launch }
  | { state: "absent"; launch: Launch; ancestry: Ancestry }
  | {
      state: "ready";
      launch: Launch;
      ancestry: Ancestry;
      completion: string;
      endedAt: number;
      startedAt: number;
    }
  | { state: "rejected"; root?: string };

const nonnegative = z.number().finite().nonnegative();
const textBlock = z.object({ type: z.literal("text"), text: z.string() });
const imageBlock = z.object({ type: z.literal("image"), data: z.string(), mimeType: z.string() });
const thinkingBlock = z.object({ type: z.literal("thinking"), thinking: z.string() });
const toolBlock = z.object({
  type: z.literal("toolCall"),
  id: text,
  name: text,
  arguments: z.record(z.string(), z.unknown()),
});
const inputContent = z.union([z.string(), z.array(z.union([textBlock, imageBlock]))]);
const assistantContent = z.array(z.union([textBlock, thinkingBlock, toolBlock]));
const usageSchema = z.object({
  input: nonnegative,
  output: nonnegative,
  cacheRead: nonnegative,
  cacheWrite: nonnegative,
  totalTokens: nonnegative,
  cost: z.object({
    input: nonnegative,
    output: nonnegative,
    cacheRead: nonnegative,
    cacheWrite: nonnegative,
    total: nonnegative,
  }),
});
const assistantSchema = z.object({
  role: z.literal("assistant"),
  api: text,
  provider: z.string().min(1).max(160),
  model: z.string().min(1).max(256),
  stopReason: z.enum(["pending", "stop", "length", "toolUse", "error", "aborted", "deferred"]),
  content: assistantContent,
  usage: usageSchema,
});
const messageSchema = z.discriminatedUnion("role", [
  assistantSchema,
  z.object({ role: z.literal("system"), content: z.union([z.string(), z.array(textBlock)]) }),
  z.object({ role: z.literal("user"), content: inputContent }),
  z.object({
    role: z.literal("toolResult"),
    toolCallId: z.string(),
    toolName: z.string(),
    content: z.array(z.union([textBlock, imageBlock])),
    isError: z.boolean(),
  }),
  z.object({
    role: z.literal("custom"),
    customType: z.string(),
    content: inputContent,
    display: z.boolean(),
  }),
  z.object({
    role: z.literal("bashExecution"),
    command: z.string(),
    output: z.string(),
    cancelled: z.boolean(),
    truncated: z.boolean(),
  }),
  z.object({
    role: z.literal("compactionSummary"),
    summary: z.string(),
    tokensBefore: nonnegative,
  }),
]);
const payloadSchemas = {
  message: z.object({ message: messageSchema }),
  model_change: z.object({ provider: z.string(), modelId: z.string() }),
  thinking_level_change: z.object({ thinkingLevel: z.string() }),
  usage: z.object({
    kind: z.string(),
    provider: z.string(),
    model: z.string(),
    usage: usageSchema,
  }),
  compaction: z.object({
    summary: z.string(),
    firstKeptEntryId: z.string(),
    tokensBefore: nonnegative,
  }),
  custom: z.object({ customType: z.string() }),
  custom_message: z.object({ customType: z.string(), content: inputContent, display: z.boolean() }),
  label: z.object({ targetId: z.string(), label: z.string().optional() }),
  session_info: z.object({ name: z.string().optional() }),
  context_edit: z.object({
    targetId: z.string(),
    replacement: z.union([
      z.null(),
      z.object({ content: z.union([inputContent, assistantContent]) }),
    ]),
  }),
};
function sameIdentity(a: Stats, b: Stats) {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.uid === b.uid &&
    a.gid === b.gid &&
    a.mode === b.mode &&
    a.birthtimeMs === b.birthtimeMs
  );
}
function stable(a: Stats, b: Stats) {
  return (
    sameIdentity(a, b) &&
    a.nlink === b.nlink &&
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs &&
    a.ctimeMs === b.ctimeMs
  );
}
function secure(stat: Stats, owned: boolean) {
  const uid = process.getuid?.();
  if (uid === undefined || stat.isSymbolicLink() || (stat.uid !== uid && (owned || stat.uid !== 0)))
    throw new Error("Untrusted owner");
  // Shared root-owned sticky ancestors are allowed, never the bridge-owned subtree.
  if (stat.mode & 0o022 && !(!owned && stat.uid === 0 && stat.isDirectory() && stat.mode & 0o1000))
    throw new Error("Writable path");
}
async function ancestry(path: string, base: string, check: () => void): Promise<Ancestry> {
  const paths: string[] = [];
  for (let p = path; ; p = dirname(p)) {
    paths.unshift(p);
    if (p === parse(p).root) break;
  }
  const result: Ancestry = [];
  for (const p of paths) {
    check();
    const stat = await lstat(p);
    check();
    secure(stat, p === base || p.startsWith(base + sep));
    if (!stat.isDirectory()) throw new Error("Not a directory");
    result.push({ path: p, stat });
  }
  if ((await realpath(path)) !== path) throw new Error("Noncanonical path");
  check();
  return result;
}
async function recheck(paths: Ancestry, check: () => void, unchanged: boolean, base?: string) {
  for (const { path, stat } of paths) {
    check();
    const next = await lstat(path);
    check();
    const owned = base && (path === base || path.startsWith(base + sep));
    if (!(unchanged && owned ? stable(stat, next) : sameIdentity(stat, next)))
      throw new Error("Changed ancestry");
  }
}
function parseModel(
  bytes: Buffer,
  route: Extract<SessionModelEvidence, { state: "ready" }>,
  parentFile: string,
): Omit<NonNullable<Capture["resolvedModel"]>, "capturedAt"> | undefined {
  if (bytes.at(-1) !== 10) return;
  const lines = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
    .decode(bytes)
    .split("\n");
  lines.pop();
  if (lines.length < 2 || lines.length > 2048 || Buffer.byteLength(lines[0]!) > 4096) return;
  let previous: string | null = null;
  let timestamp = route.startedAt;
  let messageTimestamp = route.startedAt;
  let childHeaderId: string | undefined;
  const ids = new Set<string>();
  const editableIds = new Set<string>();
  let latest: Record<string, unknown> | undefined;
  for (const [index, line] of lines.entries()) {
    if (!line || Buffer.byteLength(line) > 64 * 1024) return;
    const entry = JSON.parse(line);
    if (
      !boundedValue(entry, 64 * 1024) ||
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry)
    )
      return;
    const at =
      typeof entry.timestamp === "string" &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(entry.timestamp)
        ? Date.parse(entry.timestamp)
        : NaN;
    if (!Number.isFinite(at) || at < timestamp || at > route.endedAt) return;
    timestamp = at;
    if (index === 0) {
      if (
        entry.type !== "session" ||
        entry.version !== 3 ||
        typeof entry.id !== "string" ||
        !entry.id.trim() ||
        entry.id.length > 160 ||
        entry.id === route.launch.headerId ||
        entry.parentSession !== parentFile ||
        typeof entry.cwd !== "string"
      )
        return;
      childHeaderId = entry.id;
      if (entry.parentId !== undefined) return;
      continue;
    }
    if (
      typeof entry.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,160}$/.test(entry.id) ||
      ids.has(entry.id) ||
      entry.id === childHeaderId ||
      entry.parentId !== previous
    )
      return;
    if (
      typeof entry.type !== "string" ||
      !Object.hasOwn(payloadSchemas, entry.type) ||
      !payloadSchemas[entry.type as keyof typeof payloadSchemas].safeParse(entry).success
    )
      return;
    if (["label", "context_edit"].includes(entry.type) && !ids.has(entry.targetId)) return;
    if (entry.type === "context_edit" && !editableIds.has(entry.targetId)) return;
    if (
      entry.type === "custom_message" ||
      (entry.type === "message" &&
        ["user", "assistant", "toolResult", "custom"].includes(entry.message.role))
    )
      editableIds.add(entry.id);
    if (
      entry.type === "compaction" &&
      entry.firstKeptEntryId !== entry.id &&
      !ids.has(entry.firstKeptEntryId)
    )
      return;
    ids.add(entry.id);
    previous = entry.id;
    if (entry.type === "message") {
      const message = entry.message;
      if (
        !Number.isSafeInteger(message.timestamp) ||
        message.timestamp < messageTimestamp ||
        message.timestamp > at
      )
        return;
      messageTimestamp = message.timestamp;
      if (message.role === "assistant") {
        latest = message;
      }
    }
  }
  if (
    !latest ||
    !["stop", "length", "toolUse"].includes(String(latest.stopReason)) ||
    latest.errorMessage !== undefined ||
    !Array.isArray(latest.content)
  )
    return;
  const valid = (value: unknown, max: number): value is string =>
    typeof value === "string" && value.trim().length > 0 && value.length <= max;
  if (!valid(latest.provider, 160) || !valid(latest.model, 256)) return;
  return { provider: latest.provider, model: latest.model };
}

export function createSessionModelReader(options: {
  parentFile: string;
  env: NodeJS.ProcessEnv;
  generation: number;
  current(): boolean;
  context(): Promise<unknown>;
}) {
  const base = resolvePiBridgeSessionDir({ env: options.env });
  const parentFile = options.parentFile;
  const stem = parentFile.endsWith(".jsonl") ? parentFile.slice(0, -6) : "";
  const allowed = resolve(parentFile) === parentFile && dirname(parentFile) === base && !!stem;
  const records = new Map<string, SessionModelEvidence>();
  let saturated = false;
  let closed = false;
  let busy = false;
  let headerId: string | undefined;
  const current = () => !closed && options.current();
  const rejection = (record?: SessionModelEvidence): SessionModelEvidence => ({
    state: "rejected",
    root: record && (record.state === "rejected" ? record.root : record.launch.root),
  });
  function put(id: string, record: SessionModelEvidence) {
    let bytes = Buffer.byteLength(JSON.stringify([id, record]));
    for (const [key, value] of records)
      if (key !== id) bytes += Buffer.byteLength(JSON.stringify([key, value]));
    if (bytes > 64 * 1024) {
      saturated = true;
      if (records.has(id)) records.set(id, rejection(records.get(id)));
      return false;
    }
    records.set(id, record);
    return true;
  }
  const reject = (id: string) => put(id, rejection(records.get(id)));
  const rejectAll = () => {
    for (const id of records.keys()) reject(id);
  };
  const hostRoot = (root: string | undefined) =>
    root !== undefined &&
    dirname(root) === stem &&
    uuid.test(basename(root)) &&
    resolve(root) === root;
  const rootFromFile = (file: string | undefined) => {
    if (!file) return;
    const root = dirname(dirname(file));
    if (hostRoot(root) && file === join(root, "run-0", "session.jsonl")) return root;
  };

  async function operation<T>(
    work: (check: () => void) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T | undefined> {
    if (busy || !current() || signal?.aborted) return;
    busy = true;
    let expired = false;
    const deadline = performance.now() + 250;
    const check = () => {
      if (expired || performance.now() >= deadline || !current() || signal?.aborted)
        throw new Error("Evidence no longer current");
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const physical = (async () => {
      try {
        check();
        const result = await work(check);
        check();
        return result;
      } catch {
        return undefined;
      } finally {
        busy = false;
      }
    })();
    try {
      return await Promise.race([
        physical,
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => {
            expired = true;
            resolve(undefined);
          }, 250);
          timer.unref?.();
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async observe(raw: unknown): Promise<string | undefined> {
      if (!current() || !allowed) return;
      if (!boundedValue(raw, 16 * 1024)) {
        if (raw !== undefined) rejectAll();
        return;
      }
      const parsed = factSchema.safeParse(raw);
      if (!parsed.success) {
        if (raw !== undefined) rejectAll();
        return;
      }
      const fact: Fact = parsed.data;
      if (fact.sessionFile !== parentFile || fact.owner !== parentFile) {
        if (records.has(fact.id)) reject(fact.id);
        return;
      }
      if (headerId && headerId !== fact.sessionId) {
        rejectAll();
        return;
      }
      headerId = fact.sessionId;
      const signature = JSON.stringify(fact);
      const previous = records.get(fact.id);
      const originalRoot = rootFromFile(fact.child?.sessionFile);
      const normalizedRoot = rootFromFile(fact.child?.sessionPath);
      if (originalRoot && normalizedRoot && originalRoot !== normalizedRoot) {
        rejectAll();
        saturated = true;
        return;
      }
      const observedRoot =
        fact.event === "subagent:async-started"
          ? hostRoot(fact.sessionRoot)
            ? fact.sessionRoot
            : undefined
          : (originalRoot ?? normalizedRoot);
      if (fact.event === "subagent:async-complete" || previous?.state === "rejected") {
        for (const [id, record] of records) {
          if (
            id !== fact.id &&
            observedRoot &&
            (record.state === "rejected" ? record.root : record.launch.root) === observedRoot
          )
            reject(id);
        }
      }
      if (previous?.state === "rejected") {
        if (observedRoot && previous.root && previous.root !== observedRoot) {
          rejectAll();
          saturated = true;
        } else if (observedRoot) put(fact.id, { state: "rejected", root: observedRoot });
        else if (fact.event === "subagent:async-started") rejectAll();
        return;
      }
      if (fact.event === "subagent:async-started") {
        if (previous) {
          if (previous.launch.start !== signature) reject(fact.id);
          return;
        }
        const root = fact.sessionRoot;
        const executor = root && basename(root);
        const supported =
          root &&
          dirname(root) === stem &&
          executor &&
          uuid.test(executor) &&
          executor !== fact.id &&
          fact.routeRootId === executor &&
          fact.mode === "single" &&
          !fact.unsupported;
        let reused = false;
        for (const [id, record] of records) {
          if (root && (record.state === "rejected" ? record.root : record.launch.root) === root) {
            reject(id);
            reused = true;
          }
        }
        if (!supported) rejectAll();
        if (saturated || records.size >= 64) {
          saturated = true;
          return;
        }
        if (!put(fact.id, { state: "rejected", root })) return;
        if (!supported || reused) return;
        const file = join(root, "run-0", "session.jsonl");
        const launch: Launch = { start: signature, root, file, headerId };
        const probing: SessionModelEvidence = { state: "probing", launch };
        if (!put(fact.id, probing)) return;
        const proof = await operation(async (check) => {
          const paths = await ancestry(root, base, check);
          for (const path of [join(root, "run-0"), file]) {
            check();
            try {
              const stat = await lstat(path);
              check();
              secure(stat, true);
              if (path === file || !stat.isDirectory()) return;
              paths.push({ path, stat });
            } catch (error) {
              check();
              if ((error as NodeJS.ErrnoException).code !== "ENOENT") return;
              await recheck(paths, check, false);
              return paths;
            }
          }
        });
        if (records.get(fact.id) === probing)
          put(
            fact.id,
            proof && current()
              ? { state: "absent", launch, ancestry: proof }
              : { state: "rejected", root },
          );
        return;
      }
      if (!previous) {
        if (!saturated && records.size < 64)
          put(fact.id, { state: "rejected", root: observedRoot });
        else saturated = true;
        return;
      }
      if (previous.state === "ready") {
        if (previous.completion !== signature) reject(fact.id);
        return;
      }
      if (
        previous.state !== "absent" ||
        fact.unsupported ||
        (fact.routeRootId !== undefined && fact.routeRootId !== basename(previous.launch.root)) ||
        fact.mode !== "single" ||
        fact.success !== true ||
        fact.state !== "complete" ||
        fact.count !== 1 ||
        fact.child?.index !== 0 ||
        fact.child.context !== "fresh" ||
        fact.child.success !== true ||
        fact.child.sessionFile !== previous.launch.file ||
        fact.child.sessionPath !== previous.launch.file ||
        fact.timestamp === undefined ||
        fact.durationMs === undefined ||
        fact.durationMs > fact.timestamp ||
        fact.timestamp > Date.now() + 1000
      ) {
        reject(fact.id);
        return;
      }
      if (
        !put(fact.id, {
          ...previous,
          state: "ready",
          completion: signature,
          endedAt: fact.timestamp,
          startedAt: fact.timestamp - fact.durationMs,
        })
      )
        return;
      return fact.id;
    },
    async resolve(target: CaptureTarget, signal: AbortSignal): Promise<Capture["resolvedModel"]> {
      if (
        target.generation !== options.generation ||
        target.sessionFile !== parentFile ||
        target.sessionId !== headerId ||
        !(
          (target.kind === "subagent" && target.childId === undefined) ||
          (target.kind === "step" && target.childId === "step:0")
        )
      )
        return;
      const route = records.get(target.asyncId);
      if (route?.state !== "ready") return;
      const result = await operation(async (check) => {
        const valid = () => {
          check();
          if (records.get(target.asyncId) !== route) throw new Error("Route invalidated");
        };
        const matchesContext = (raw: unknown) => {
          if (!boundedValue(raw, 16 * 1024)) return false;
          const context = raw as {
            sessionId?: unknown;
            sessionFile?: unknown;
            guard?: unknown;
            command?: unknown;
          } | null;
          return (
            context?.sessionId === headerId &&
            context?.sessionFile === parentFile &&
            context?.guard === true &&
            context?.command === true
          );
        };
        if (!matchesContext(await options.context())) return;
        valid();
        const rel = relative(base, route.launch.file);
        if (rel.startsWith("..") || rel.split(sep).length > 8) return;
        await recheck(route.ancestry, valid, false);
        const paths = await ancestry(dirname(route.launch.file), base, valid);
        const checked = await lstat(route.launch.file);
        valid();
        secure(checked, true);
        if (
          !checked.isFile() ||
          checked.nlink !== 1 ||
          checked.size < 1 ||
          checked.size > 512 * 1024
        )
          return;
        if ((await realpath(route.launch.file)) !== route.launch.file) return;
        valid();
        const fd = await open(
          route.launch.file,
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        try {
          valid();
          const opened = await fd.stat();
          valid();
          if (!stable(checked, opened)) return;
          const bytes = Buffer.alloc(opened.size + 1);
          let used = 0;
          while (used < bytes.length) {
            valid();
            const { bytesRead } = await fd.read(bytes, used, bytes.length - used, used);
            valid();
            if (!bytesRead) break;
            used += bytesRead;
          }
          if (used !== opened.size || !stable(opened, await fd.stat())) return;
          valid();
          await recheck(paths, valid, true, base);
          if (!stable(checked, await lstat(route.launch.file))) return;
          valid();
          const model = parseModel(bytes.subarray(0, used), route, parentFile);
          if (!model || !matchesContext(await options.context())) return;
          valid();
          await recheck(paths, valid, true, base);
          if (!stable(checked, await fd.stat()) || !stable(checked, await lstat(route.launch.file)))
            return;
          valid();
          return { ...model, capturedAt: Date.now() };
        } finally {
          await fd.close();
        }
      }, signal);
      if (current() && !signal.aborted && records.get(target.asyncId) === route) return result;
    },
    dispose() {
      closed = true;
      rejectAll();
      records.clear();
    },
  };
}
