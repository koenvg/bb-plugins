import { z } from "zod";

export const historyRequestSchema = z.object({
  hostId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
  generation: z.number().int().min(0).max(1_000_000_000),
}).strict();

export const historyReadinessSchema = z.object({
  state: z.enum(["available", "not-configured", "unavailable"]),
  reason: z.enum(["ok", "not-configured", "storage-unavailable", "storage-incompatible", "collector-incompatible",
    "no-selection", "foreign-host", "selection-changed", "host-offline", "unsupported"]),
  storage: z.enum(["compatible", "unconfigured", "unavailable", "incompatible", "unchecked"]),
  collector: z.enum(["compatible-v1", "missing", "incompatible", "unchecked"]),
  writer: z.literal("unconfirmed"),
}).strict().refine((view) => view.state === "available"
  ? view.reason === "ok" && view.storage === "compatible" && view.collector === "compatible-v1"
  : view.state === "not-configured" ? view.reason === "not-configured" && ["compatible", "unconfigured"].includes(view.storage)
    && ["missing", "compatible-v1"].includes(view.collector)
  : !["ok", "not-configured"].includes(view.reason));
export type HistoryReadiness = z.infer<typeof historyReadinessSchema>;
export type HistoryRequest = z.infer<typeof historyRequestSchema>;
export function historyUnavailable(reason: HistoryReadiness["reason"]): HistoryReadiness {
  return { state: "unavailable", reason, storage: "unchecked", collector: "unchecked", writer: "unconfirmed" };
}
