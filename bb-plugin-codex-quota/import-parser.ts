import { createHash } from "node:crypto";
import { z } from "zod";
import { usageRecordSchema } from "./usage-record.js";
const scalar = z
  .string()
  .min(1)
  .max(256)
  // oxlint-disable-next-line no-control-regex -- Reject control characters in untrusted input.
  .regex(/^[^\u0000-\u001f\u007f]+$/u);
export const importedHeaderSchema = z.object({
  type: z.literal("session"),
  version: z.literal(3),
  id: scalar,
  cwd: z
    .string()
    .min(1)
    .max(4096)
    // oxlint-disable-next-line no-control-regex -- Reject control characters in untrusted input.
    .regex(/^\/[^\u0000-\u001f\u007f]*$/),
  parentSession: z
    .string()
    .min(1)
    .max(4096)
    // oxlint-disable-next-line no-control-regex -- Reject control characters in untrusted input.
    .regex(/^\/[^\u0000-\u001f\u007f]*$/)
    .optional(),
});
export function parseLine(bytes: Buffer): unknown {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export function entryIdentity(value: unknown) {
  return z.object({ type: scalar, id: scalar, parentId: scalar.nullable() }).safeParse(value);
}
export function importedUsage(
  value: unknown,
  sessionId: string,
  workspace: string,
  providerSessionKey: string | null,
) {
  const v = value as {
    type?: string;
    id?: string;
    message?: {
      role?: string;
      provider?: string;
      model?: string;
      timestamp?: number;
      usage?: {
        input?: number;
        output?: number;
        cacheRead?: number;
        cacheWrite?: number;
        reasoning?: number;
        totalTokens?: number;
        cost?: { total?: number };
      };
    };
  };
  if (
    v.type !== "message" ||
    v.message?.role !== "assistant" ||
    v.message.provider !== "openai-codex"
  )
    return { kind: "ignored" as const };
  const m = v.message,
    u = m.usage;
  if (!u || !Number.isFinite(m.timestamp) || Math.abs(m.timestamp!) > 8.64e15)
    return { kind: "invalid" as const };
  const h = createHash("sha256")
    .update(JSON.stringify(["bb-import-v1", sessionId, v.id]))
    .digest("hex");
  const eventId = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
  const cost = u.cost?.total;
  const result = usageRecordSchema.safeParse({
    version: 1,
    eventId,
    provenance: "imported",
    occurredAt: new Date(m.timestamp!).toISOString(),
    sessionId,
    workspace,
    providerSessionKey,
    claimedThreadId: null,
    provider: "openai-codex",
    model: m.model,
    inputTokens: u.input,
    outputTokens: u.output,
    cacheReadTokens: u.cacheRead,
    cacheWriteTokens: u.cacheWrite,
    reasoningTokens: u.reasoning ?? 0,
    totalTokens: u.totalTokens,
    capturedCost:
      typeof cost === "number" && Number.isFinite(cost) && cost > 0 && cost <= 1e9 ? cost : null,
  });
  return result.success
    ? { kind: "usage" as const, record: result.data }
    : { kind: "invalid" as const };
}
