import { z } from "zod";
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { ULID_PATTERN } from "../shared/contract";

export const WEBHOOKS_CHANGED = "webhooks:changed";
export const WEBHOOK_NAME_MAX_LENGTH = 80;

export const endpointId = z.string().regex(/^wh_[a-f0-9]{32}$/);
export const scopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("global") }).strict(),
  z.object({ kind: z.literal("tracker"), projectId: z.string().regex(ULID_PATTERN) }).strict(),
]);
const endpointSummary = z.object({
  id: endpointId,
  name: z.string().optional(),
  scope: scopeSchema,
  hasAuthorization: z.boolean(),
});
const tracker = z.object({ id: z.string(), prefix: z.string(), name: z.string() });
const settingsState = z.discriminatedUnion("state", [
  z.object({ state: z.literal("blocked") }),
  z.object({
    state: z.literal("healthy"),
    endpoints: z.array(endpointSummary),
    trackers: z.array(tracker),
  }),
]);
const deliveryOutcome = z.union([
  z.object({ code: z.enum(["delivered", "http_error"]), attempts: z.number(), status: z.number() }),
  z.object({
    code: z.enum(["network_error", "timeout", "queue_full", "expired", "disposed"]),
    attempts: z.number(),
  }),
]);
const actionFailure = z.object({
  ok: z.literal(false),
  code: z.enum([
    "invalid_input",
    "invalid_name",
    "invalid_stored",
    "storage_error",
    "limit",
    "not_found",
    "disposed",
    "tracker_not_found",
  ]),
});
const endpointChange = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), endpoint: endpointSummary }),
  actionFailure,
]);
const testResult = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), outcome: deliveryOutcome }),
  actionFailure,
]);
export const addInput = z.object({
  scope: scopeSchema,
  name: z.unknown().optional(),
  url: z.string(),
  authorization: z.string().optional(),
});
export const byId = z.object({ id: endpointId });
export const renameInput = byId.extend({ name: z.unknown() }).strict();

export type WebhookScope = z.infer<typeof scopeSchema>;
export type DeliveryOutcome = z.infer<typeof deliveryOutcome>;
export type EndpointSummary = z.infer<typeof endpointSummary>;
export type WebhookSettings = z.infer<typeof settingsState>;
export type WebhookActionError = z.infer<typeof actionFailure>["code"];
export type Tracker = z.infer<typeof tracker>;

export const webhookRpcContract = defineRpcContract({
  listWebhooks: { input: z.null(), output: settingsState },
  addWebhook: { input: z.unknown(), output: endpointChange },
  renameWebhook: { input: z.unknown(), output: endpointChange },
  deleteWebhook: { input: z.unknown(), output: endpointChange },
  testWebhook: { input: z.unknown(), output: testResult },
});
