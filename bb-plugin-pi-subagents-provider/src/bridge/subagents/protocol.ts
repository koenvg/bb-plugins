import { z } from "zod";

export const SNAPSHOT_KIND = "pi-subagents.async-status-snapshot";
export const SNAPSHOT_PREFIX = "PI_SUBAGENT_ASYNC_JSON:";
export const SNAPSHOT_BYTES = 32 * 1024;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const id = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/);
const sessionId = z
  .string()
  .min(1)
  .max(4096)
  // oxlint-disable-next-line eslint/no-control-regex -- Native session identifiers must not contain control bytes.
  .refine((s) => s.trim() === s && !/[\x00-\x1f]/.test(s));
const text = z.string().max(160);
const state = z.enum([
  "queued",
  "running",
  "complete",
  "failed",
  "partial",
  "paused",
  "stopped",
  "rejected",
]);
export interface RunNode {
  id: string;
  kind: "subagent" | "workflow" | "step" | "host-step";
  label: string;
  state: z.infer<typeof state>;
  startedAt?: number;
  updatedAt?: number;
  endedAt?: number;
  activity?: {
    state?: string;
    currentTool?: string;
    lastActivityAt?: number;
    currentToolStartedAt?: number;
    turnCount?: number;
    toolCount?: number;
  };
  children?: RunNode[];
}
const node: z.ZodType<RunNode> = z.lazy(() =>
  z.object({
    id,
    kind: z.enum(["subagent", "workflow", "step", "host-step"]),
    label: text,
    state,
    startedAt: count.optional(),
    updatedAt: count.optional(),
    endedAt: count.optional(),
    activity: z
      .object({
        state: text.optional(),
        currentTool: text.optional(),
        lastActivityAt: count.optional(),
        currentToolStartedAt: count.optional(),
        turnCount: count.optional(),
        toolCount: count.optional(),
      })
      .optional(),
    children: z.array(node).max(8).optional(),
  }),
);
const snapshot = z.object({
  kind: z.literal(SNAPSHOT_KIND),
  version: z.literal(1),
  generatedAt: count,
  caps: z.object({
    maxRuns: count.max(20),
    maxChildrenPerNode: count.max(8),
    maxDepth: count.max(3),
    maxStringLength: count.max(160),
    maxSerializedBytes: count.max(SNAPSHOT_BYTES),
  }),
  omitted: z.object({ runs: count, children: count, byteLimitExceeded: z.boolean() }),
  runs: z.array(node).max(20),
});
const ping = z.object({
  version: z.literal(1),
  methods: z
    .array(z.string())
    .max(32)
    .refine((v) => v.includes("status") && v.includes("ping")),
  session: z.object({ sessionId, sessionFile: sessionId }),
  capabilities: z.object({
    status: z.literal(true),
    asyncStatusSnapshot: z.object({ kind: z.literal(SNAPSHOT_KIND), version: z.literal(1) }),
    statusProjection: z.object({
      version: z.literal(1),
      untargeted: z.literal("in-memory-when-ready"),
      targeted: z.literal("executor"),
    }),
  }),
});
const receipt = z.object({
  sessionId,
  sessionFile: sessionId,
  ping,
  status: z.object({ asyncSnapshot: snapshot }),
});
export type StatusReceipt = z.infer<typeof receipt>;
export type AsyncSnapshot = StatusReceipt["status"]["asyncSnapshot"];

/** Reject before recursive schema parsing, including cycles and deep unknown fields. */
export function boundedJson(value: unknown, bytes: number): boolean {
  const seen = new Set<object>();
  let nodes = 0;
  function visit(v: unknown, depth: number): boolean {
    if (++nodes > 10000 || depth > 16) return false;
    if (v === null || typeof v === "string" || typeof v === "boolean") return true;
    if (typeof v === "number") return Number.isFinite(v);
    if (typeof v !== "object" || seen.has(v)) return false;
    seen.add(v);
    return Object.values(v).every((child) => visit(child, depth + 1));
  }
  try {
    return visit(value, 0) && Buffer.byteLength(JSON.stringify(value), "utf8") <= bytes;
  } catch {
    return false;
  }
}

export function parseStatusReceipt(
  value: unknown,
  expectedFile: string,
  expectedId?: string,
): StatusReceipt | undefined {
  if (!boundedJson(value, 128 * 1024)) return;
  const parsed = receipt.safeParse(value);
  if (!parsed.success) return;
  const data = parsed.data;
  if (
    data.sessionFile !== expectedFile ||
    data.ping.session.sessionFile !== expectedFile ||
    data.ping.session.sessionId !== data.sessionId ||
    (expectedId !== undefined && data.sessionId !== expectedId)
  )
    return;
  const snap = data.status.asyncSnapshot;
  if (
    !boundedJson((value as StatusReceipt).status.asyncSnapshot, SNAPSHOT_BYTES) ||
    snap.runs.length > snap.caps.maxRuns
  )
    return;
  let total = 0;
  const roots = new Set<string>();
  const canonicalIds = new Set<string>();
  function valid(n: RunNode, depth: number, ids: Set<string>): boolean {
    if (
      ++total > 256 ||
      depth > snap.caps.maxDepth ||
      ids.has(n.id) ||
      n.id.length > snap.caps.maxStringLength ||
      n.label.length > snap.caps.maxStringLength ||
      (n.children?.length ?? 0) > snap.caps.maxChildrenPerNode
    )
      return false;
    ids.add(n.id);
    if (n.kind === "subagent" || n.kind === "workflow") {
      if (canonicalIds.has(n.id)) return false;
      canonicalIds.add(n.id);
    }
    const siblingIds = new Set<string>();
    return (n.children ?? []).every((child) => valid(child, depth + 1, siblingIds));
  }
  for (const run of snap.runs) {
    if (
      roots.has(run.id) ||
      !["subagent", "workflow"].includes(run.kind) ||
      !valid(run, 0, new Set())
    )
      return;
    roots.add(run.id);
  }
  return data;
}
