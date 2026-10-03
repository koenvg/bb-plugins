import { z } from "zod";
import type { TaskWorkStatus } from "../shared/contract.js";
type Queue = NonNullable<
  NonNullable<TaskWorkStatus["pullRequests"]["items"][number]["rich"]>["queue"]
>;
const states = ["queued", "awaiting_checks", "merging", "failed"] as const;
const schema = z
  .object({
    state: z.enum(states),
    position: z.number().int().positive().nullable(),
  })
  .strict();

/** Unknown additive fields stay visible but cannot certify an idle queue. */
export function normalizeQueue(value: unknown): {
  queue?: Queue;
  reason?: "unsupported_queue" | "missing_prerequisites";
} {
  if (value === undefined) return { reason: "missing_prerequisites" };
  if (value === null) return {};
  const parsed = schema.safeParse(value);
  const fields =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const state = states.includes(fields.state as (typeof states)[number])
    ? (fields.state as (typeof states)[number])
    : "unknown";
  const reported = JSON.stringify(value);
  return {
    queue: {
      state,
      position: parsed.success ? parsed.data.position : null,
      reported,
    },
    ...(parsed.success ? {} : { reason: "unsupported_queue" }),
  };
}
