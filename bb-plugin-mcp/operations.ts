import { createHash, randomUUID } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { allowedProjects, type Config } from "./config.js";
import { hasAccess, type Identity } from "./control.js";

export type StartSource = {
  defaults: BbPluginApi["sdk"]["projects"]["defaultExecutionOptions"];
  spawn: BbPluginApi["sdk"]["threads"]["spawn"];
  get: BbPluginApi["sdk"]["threads"]["get"];
};
type Database = ReturnType<BbPluginApi["storage"]["database"]>;
type State = "pending" | "accepted" | "failed" | "unknown";
type RecordRow = {
  id: string;
  issuer: string;
  owner: string;
  tool: string;
  key: string;
  hash: string;
  project: string;
  thread: string | null;
  state: State;
  code: string | null;
  created: number;
  updated: number;
  generation: string;
};
export const operationMigration = `CREATE TABLE operations (
  id TEXT PRIMARY KEY, issuer TEXT NOT NULL, owner TEXT NOT NULL, tool TEXT NOT NULL,
  key TEXT NOT NULL, hash TEXT NOT NULL, project TEXT NOT NULL, thread TEXT,
  state TEXT NOT NULL, code TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL,
  generation TEXT NOT NULL, UNIQUE(issuer, owner, tool, key)
)`;
export const operationLimits = { responseWaitMs: 4000, sdkDeadlineMs: 30000, capacity: 10000 };
const retentionMs = 24 * 60 * 60 * 1000;
const id = z.string().trim().min(1).max(200);
const text = z
  .string()
  .max(32768)
  .refine((v) => v.trim().length > 0 && Buffer.byteLength(v) <= 32768);
const startSchema = z.strictObject({
  projectId: id,
  prompt: text,
  title: z.string().trim().min(1).max(200).optional(),
  operationKey: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/),
});
type StartInput = z.infer<typeof startSchema>;

// One generation owns dispatches. Request transports only observe them.
export function operationControl(options: {
  db: Database;
  source: StartSource;
  policy: () => Config | null;
  now?: () => number;
  limits?: Partial<typeof operationLimits>;
}) {
  const { db, source, policy } = options;
  const now = options.now ?? Date.now;
  const limits = { ...operationLimits, ...options.limits };
  const generation = randomUUID();
  let active = false;
  let closed = false;
  let activeReads = 0;
  const running = new Map<string, { done: Promise<void>; timer: ReturnType<typeof setTimeout> }>();
  const read = (operationId: string) =>
    db.prepare("SELECT * FROM operations WHERE id = ?").get(operationId) as RecordRow | undefined;
  const claim = db.transaction((identity: Identity, input: StartInput) => {
    const hash = createHash("sha256")
      .update(JSON.stringify([input.projectId, input.prompt, input.title ?? null]))
      .digest("hex");
    // Expiry permits key reuse only for completed records, never pending/unknown.
    db.prepare("DELETE FROM operations WHERE state IN ('accepted', 'failed') AND updated < ?").run(
      now() - retentionMs,
    );
    const existing = db
      .prepare("SELECT * FROM operations WHERE issuer = ? AND owner = ? AND tool = ? AND key = ?")
      .get(identity.issuer, identity.owner, "bb_start_thread", input.operationKey) as
      | RecordRow
      | undefined;
    if (existing) {
      if (existing.hash !== hash) throw new Error("OPERATION_CONFLICT");
      return { row: existing, fresh: false };
    }
    if (running.size >= 8) throw new Error("OPERATIONS_BUSY");
    if (
      (db.prepare("SELECT count(*) AS count FROM operations").get() as { count: number }).count >=
      limits.capacity
    )
      throw new Error("LEDGER_FULL");
    const row: RecordRow = {
      id: randomUUID(),
      issuer: identity.issuer,
      owner: identity.owner,
      tool: "bb_start_thread",
      key: input.operationKey,
      hash,
      project: input.projectId,
      thread: null,
      state: "pending",
      code: null,
      created: now(),
      updated: now(),
      generation,
    };
    db.prepare(
      "INSERT INTO operations VALUES (@id, @issuer, @owner, @tool, @key, @hash, @project, @thread, @state, @code, @created, @updated, @generation)",
    ).run(row);
    return { row, fresh: true };
  });
  function requireAccess(identity: Identity, project: string, write = false) {
    const config = policy();
    if (
      !active ||
      closed ||
      !hasAccess(config, identity) ||
      !allowedProjects(config).has(project) ||
      (write && (!config.controlEnabled || !identity.scopes?.includes("bb.control")))
    )
      throw new Error("OPERATION_UNAVAILABLE");
  }
  function finish(
    operationId: string,
    state: State,
    code: string | null,
    thread: string | null = null,
  ) {
    if (closed) return;
    db.prepare(
      "UPDATE operations SET state = ?, code = ?, thread = COALESCE(?, thread), updated = ? WHERE id = ? AND generation = ? AND state IN ('pending', 'unknown')",
    ).run(state, code, thread, now(), operationId, generation);
  }
  async function observe(
    identity: Identity,
    operationId: string,
    write = false,
    signal = AbortSignal.timeout(3000),
  ) {
    const row = read(operationId);
    if (!row || row.issuer !== identity.issuer || row.owner !== identity.owner)
      throw new Error("OPERATION_UNAVAILABLE");
    requireAccess(identity, row.project, write);
    if (row.thread) {
      if (activeReads >= 8 || signal.aborted) throw new Error("OPERATION_UNAVAILABLE");
      activeReads++;
      const lookup = Promise.resolve()
        .then(() => source.get({ threadId: row.thread!, signal }))
        .finally(() => {
          activeReads--;
        });
      let abort: () => void = () => {};
      const cancelled = new Promise<never>((_, reject) => {
        abort = () => reject(new Error("OPERATION_UNAVAILABLE"));
        signal.addEventListener("abort", abort, { once: true });
      });
      let thread: Awaited<ReturnType<StartSource["get"]>>;
      try {
        thread = await Promise.race([lookup, cancelled]);
      } finally {
        signal.removeEventListener("abort", abort);
      }
      requireAccess(identity, row.project, write);
      if (thread.id !== row.thread || thread.projectId !== row.project || thread.deletedAt !== null)
        throw new Error("OPERATION_UNAVAILABLE");
    }
    if (signal.aborted) throw new Error("OPERATION_UNAVAILABLE");
    return {
      operationId: row.id,
      state: row.state,
      threadId: row.thread,
      code: row.code,
      meaning:
        row.state === "accepted"
          ? "BB accepted the submission. Agent work is not complete."
          : row.state === "failed"
            ? "No start was dispatched."
            : row.state === "unknown"
              ? "Outcome unknown. Inspect BB before submitting a new key. Do not repeat the action."
              : "Submission outcome pending. Poll this operation; do not submit a new key.",
    };
  }
  async function start(identity: Identity, input: StartInput, signal: AbortSignal) {
    const started = Date.now();
    if (signal.aborted) throw new Error("OPERATION_UNAVAILABLE");
    requireAccess(identity, input.projectId, true);
    const { row, fresh } = claim.immediate(identity, input);
    if (fresh) {
      let dispatched = false;
      let deadline = false;
      const timer = setTimeout(() => {
        deadline = true;
        try {
          finish(
            row.id,
            dispatched ? "unknown" : "failed",
            dispatched ? "SDK_DEADLINE" : "PRE_DISPATCH_DEADLINE",
          );
        } catch {
          /* Durable pending key still prevents replay. */
        }
      }, limits.sdkDeadlineMs);
      const disconnected = () => {
        try {
          finish(
            row.id,
            dispatched ? "unknown" : "failed",
            dispatched ? "CLIENT_DISCONNECTED" : "PRE_DISPATCH_ABORTED",
          );
        } catch {
          /* Keep the durable claim. */
        }
      };
      signal.addEventListener("abort", disconnected, { once: true });
      const done = Promise.resolve().then(async () => {
        try {
          // A failed defaults read cannot create a thread. Never choose a fallback.
          const defaults = await source.defaults({
            projectId: input.projectId,
            signal: AbortSignal.timeout(limits.sdkDeadlineMs),
          });
          if (!defaults) throw new Error("DEFAULTS_UNAVAILABLE");
          if (deadline || signal.aborted) throw new Error("PRE_DISPATCH_ABORTED");
          requireAccess(identity, input.projectId, true);
          const current = read(row.id);
          if (current?.generation !== generation || current.state !== "pending")
            throw new Error("STALE_DISPATCH");
          dispatched = true;
          const thread = await source.spawn({
            providerId: defaults.providerId,
            model: defaults.model,
            permissionMode: defaults.permissionMode,
            reasoningLevel: defaults.reasoningLevel,
            serviceTier: defaults.serviceTier,
            projectId: input.projectId,
            prompt: input.prompt,
            ...(input.title === undefined ? {} : { title: input.title }),
            environment: { type: "project-default" },
            visibility: "visible",
            pluginMetadata: { operationId: row.id },
          });
          if (
            !thread ||
            typeof thread.id !== "string" ||
            !thread.id.length ||
            thread.id.length > 200
          )
            throw new Error();
          finish(row.id, "accepted", null, thread.id);
        } catch {
          // No public transactional spawn-error guarantee: even a BB error may follow creation.
          try {
            finish(
              row.id,
              dispatched ? "unknown" : "failed",
              dispatched ? "BB_OUTCOME_UNKNOWN" : "START_NOT_DISPATCHED",
            );
          } catch {
            /* Never lose the claim or retry. */
          }
        } finally {
          clearTimeout(timer);
          signal.removeEventListener("abort", disconnected);
          running.delete(row.id);
        }
      });
      running.set(row.id, { done, timer });
    }
    const pending = running.get(row.id);
    if (pending) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          pending.done,
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, Math.max(1, limits.responseWaitMs - 1000));
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    if (signal.aborted) throw new Error("OPERATION_UNAVAILABLE");
    return observe(
      identity,
      row.id,
      true,
      AbortSignal.any([
        signal,
        AbortSignal.timeout(Math.max(1, limits.responseWaitMs - (Date.now() - started))),
      ]),
    );
  }
  function result(data: Awaited<ReturnType<typeof observe>>) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data) }],
      structuredContent: data,
    };
  }
  return {
    activate() {
      if (closed) throw new Error("OPERATIONS_CLOSED");
      if (active) return;
      // FULL makes the committed identity durable before SDK dispatch.
      db.pragma("synchronous = FULL");
      db.prepare(
        "UPDATE operations SET state = 'unknown', code = 'PLUGIN_RESTART', updated = ? WHERE state = 'pending' AND generation != ?",
      ).run(now(), generation);
      active = true;
    },
    close() {
      if (closed) return;
      for (const { timer } of running.values()) clearTimeout(timer);
      db.prepare(
        "UPDATE operations SET state = 'unknown', code = 'PLUGIN_STOPPED', updated = ? WHERE state = 'pending' AND generation = ?",
      ).run(now(), generation);
      closed = true;
      active = false;
    },
    register(
      server: McpServer,
      identity: Identity,
      signal: AbortSignal,
      onFailure: (tool: OperationTool) => void,
    ) {
      server.registerTool(
        "bb_start_thread",
        {
          description:
            "Start an ordinary visible BB thread using project defaults. Requires bb.read, bb.control and local control. Agents can change code, take external actions and incur provider costs under existing permissions. Use the same operation key after a lost reply. Accepted is not completed work; unknown requires BB inspection.",
          inputSchema: startSchema,
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
        async (input) => {
          try {
            return result(await start(identity, input, signal));
          } catch (error) {
            onFailure("bb_start_thread");
            const code =
              error instanceof Error &&
              ["OPERATION_CONFLICT", "LEDGER_FULL", "OPERATIONS_BUSY"].includes(error.message)
                ? error.message
                : "OPERATION_UNAVAILABLE";
            return { isError: true, content: [{ type: "text" as const, text: code }] };
          }
        },
      );
      server.registerTool(
        "bb_get_operation",
        {
          description:
            "Read the owner's persisted submission outcome without repeating an action. Accepted is not completed agent work. Unknown outcomes require inspection in BB before a new key.",
          inputSchema: z.strictObject({ operationId: id }),
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async ({ operationId }) => {
          try {
            if (signal.aborted) throw new Error();
            const data = await observe(
              identity,
              operationId,
              false,
              AbortSignal.any([signal, AbortSignal.timeout(3000)]),
            );
            if (signal.aborted) throw new Error();
            return result(data);
          } catch {
            onFailure("bb_get_operation");
            return {
              isError: true,
              content: [{ type: "text" as const, text: "OPERATION_UNAVAILABLE" }],
            };
          }
        },
      );
    },
  };
}
export type OperationTool = "bb_start_thread" | "bb_get_operation";
export type Operations = ReturnType<typeof operationControl>;
