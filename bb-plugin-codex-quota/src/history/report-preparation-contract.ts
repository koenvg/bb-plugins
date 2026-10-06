import { z } from "zod";
import { historyRequestSchema } from "./history-contract.js";
import { attributionViewSchema } from "./identity/identity-contract.js";

const reason = z.enum([
  "no-selection",
  "foreign-host",
  "selection-changed",
  "host-offline",
  "unsupported",
  "not-configured",
  "storage-unavailable",
  "storage-incompatible",
  "discovery-unavailable",
  "identity-unavailable",
]);
export const preparationRequestSchema = historyRequestSchema.extend({ refresh: z.boolean() });
export type PreparationRequest = z.infer<typeof preparationRequestSchema>;
export const preparationSchema = z.discriminatedUnion("state", [
  z
    .object({ state: z.enum(["pending", "settled"]), progress: z.string().min(1).max(256) })
    .strict(),
  z.object({ state: z.literal("unavailable"), reason, progress: z.literal("") }).strict(),
]);
export type Preparation = z.infer<typeof preparationSchema>;
export const preparationUnavailable = (why: z.infer<typeof reason>): Preparation => ({
  state: "unavailable",
  reason: why,
  progress: "",
});
export const hostPreparationSchema = z.discriminatedUnion("state", [
  z
    .object({
      state: z.literal("available"),
      attribution: attributionViewSchema,
      progress: z.string().max(128),
      ingestionPending: z.boolean(),
    })
    .strict(),
  z.object({ state: z.literal("unavailable"), reason }).strict(),
]);
