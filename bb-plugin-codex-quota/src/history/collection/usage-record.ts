import { z } from "zod";
import { isAbsolute, basename, normalize } from "node:path";
const scalar = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    // oxlint-disable-next-line no-control-regex -- Reject control characters in untrusted input.
    .regex(/^[^\u0000-\u001f\u007f]+$/u);
const token = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const usageRecordSchema = z
  .object({
    version: z.literal(1),
    eventId: z.uuid(),
    provenance: z.enum(["observed", "imported"]),
    occurredAt: z.iso.datetime(),
    sessionId: scalar(256),
    workspace: scalar(16_384).refine(isAbsolute),
    providerSessionKey: scalar(256)
      .refine((v) => basename(v) === v && v.endsWith(".jsonl") && v !== ".jsonl")
      .nullable(),
    claimedThreadId: z
      .string()
      .regex(/^thr_[A-Za-z0-9_-]{1,124}$/)
      .nullable(),
    provider: z.literal("openai-codex"),
    model: scalar(128),
    inputTokens: token,
    outputTokens: token,
    cacheReadTokens: token,
    cacheWriteTokens: token,
    reasoningTokens: token,
    totalTokens: token,
    capturedCost: z.number().finite().positive().max(1e9).nullable(),
  })
  .strict();
export const confirmationSchema = z
  .object({
    version: z.literal(1),
    eventId: z.uuid(),
    sessionId: scalar(256),
    entryId: scalar(256),
  })
  .strict();
const envelopeSchema = z
  .object({
    version: z.literal(2),
    usage: usageRecordSchema,
    metadata: z
      .object({
        responseId: scalar(256).nullable(),
        serviceTier: z.string().max(128).nullable().optional(),
      })
      .strict(),
  })
  .strict();
export function parseCompact(line: string, confirmation: boolean) {
  try {
    const input = JSON.parse(line);
    const envelope = !confirmation && input?.version === 2 ? envelopeSchema.safeParse(input) : null;
    if (envelope && !envelope.success) return null;
    const result = (confirmation ? confirmationSchema : usageRecordSchema).safeParse(
      envelope?.success ? envelope.data.usage : input,
    );
    if (!result.success) return null;
    if ("workspace" in result.data) {
      result.data.workspace = normalize(result.data.workspace);
      result.data.occurredAt = new Date(result.data.occurredAt).toISOString();
    }
    return "workspace" in result.data
      ? { ...result.data, ...(envelope?.success ? { metadata: envelope.data.metadata } : {}) }
      : result.data;
  } catch {
    return null;
  }
}
