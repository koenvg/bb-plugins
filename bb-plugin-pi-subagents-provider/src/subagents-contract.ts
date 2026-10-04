import { z } from "zod";

export const VIEW_KIND = "pi-subagents-view";
export const VIEW_EXTENSION_KIND = "pi-subagents/pi-subagents-view";
export const VIEW_BYTES = 256 * 1024;
const count = z.number().int().nonnegative().max(8_640_000_000_000_000);
export const captureSchema = z.object({
  status: z.enum(["captured", "pending", "not-captured", "unavailable", "unsupported", "timeout", "stale"]),
  capturedAt: count, reason: z.string().max(500).optional(), task: z.string().max(2000).optional(),
  attemptedAt: count.optional(),
  finalOutput: z.string().max(8000).optional(),
  messages: z.array(z.object({ role: z.string().max(80), kind: z.enum(["text", "toolCall", "toolResult"]), text: z.string().max(1000), textTruncated: z.boolean().optional() })).max(20).optional(),
  truncated: z.object({ task: z.boolean(), finalOutput: z.boolean(), messages: count }).optional(),
});
export type Capture = z.infer<typeof captureSchema>;
export const rowSchema = z.object({
  id: z.string().min(1).max(1800), parentId: z.string().max(1800).optional(), runId: z.string().min(1).max(160),
  sessionId: z.string().min(1).max(4096), generation: count, source: z.enum(["background", "foreground"]),
  label: z.string().max(160), kind: z.enum(["subagent", "workflow", "step", "host-step"]),
  state: z.enum(["queued", "running", "complete", "failed", "partial", "paused", "stopped", "rejected", "unknown", "detached"]),
  index: count.optional(), startedAt: count.optional(), endedAt: count.optional(), durationMs: count.optional(), activity: z.string().max(160).optional(),
  incomplete: z.boolean(), observedAt: count, capture: captureSchema.optional(),
});
export type ViewRow = z.infer<typeof rowSchema>;
export const viewSchema = z.object({
  kind: z.literal(VIEW_KIND), version: z.literal(1), updatedAt: count,
  availability: z.enum(["available", "unavailable", "unsupported"]), reason: z.string().max(500),
  omitted: count, rows: z.array(rowSchema).max(128),
});
export type ViewState = z.infer<typeof viewSchema>;
/** Browser-safe validation before recursive schema parsing. Unknown fields are bounded too. */
export function boundedValue(value: unknown, bytes: number): boolean {
  try {
    const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }]; let nodes = 0;
    while (pending.length) {
      const item = pending.pop()!;
      if (++nodes > 8192 || item.depth > 20) return false;
      if (item.value && typeof item.value === "object") for (const child of Object.values(item.value)) pending.push({ value: child, depth: item.depth + 1 });
    }
    return new TextEncoder().encode(JSON.stringify(value)).length <= bytes;
  } catch { return false; }
}
export function parseViewState(value: unknown): ViewState | undefined {
  if (!boundedValue(value, VIEW_BYTES)) return;
  const parsed = viewSchema.safeParse(value); return parsed.success ? parsed.data : undefined;
}
