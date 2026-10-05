import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { hostContract, quotaViewSchema } from "../quota/contract.js";
import { activityViewSchema, emptyActivity } from "../activity/activity-contract.js";

import {
  historyReadinessSchema,
  historyUnavailable,
  historyRequestSchema,
  collectorRequestSchema,
} from "../history/history-contract.js";
import { createSelectedHost } from "../selection/selected-host.js";
import { createIdentityHistoryCall } from "../history/identity/identity-server.js";
import { importRequestSchema, importViewSchema } from "../history/import/import-contract.js";
import { createImportHandler } from "../history/import/import-routing.js";
import {
  calendarQuerySchema,
  calendarReportSchema,
  calendarUnavailable,
} from "../history/calendar/calendar-contract.js";
const hostIdSchema = z.string().min(1).max(128);
const generationSchema = z.number().int().min(0).max(1_000_000_000);
const selectionSchema = z
  .object({ hostId: hostIdSchema.nullable(), generation: generationSchema })
  .strict();

export const rpcContract = defineRpcContract({
  ping: {
    input: z.object({ hostId: hostIdSchema }).strict(),
    output: z.object({ reachable: z.boolean() }).strict(),
  },
  selection: { input: z.null(), output: selectionSchema },
  selectHost: {
    input: z.object({ hostId: hostIdSchema.nullable() }).strict(),
    output: selectionSchema,
  },
  read: {
    input: z
      .object({
        hostId: hostIdSchema,
        generation: generationSchema,
        refresh: z.boolean().optional(),
      })
      .strict(),
    output: quotaViewSchema,
  },
  historyReadiness: { input: historyRequestSchema, output: historyReadinessSchema },
  calendarReport: {
    input: historyRequestSchema.extend({ query: calendarQuerySchema }),
    output: calendarReportSchema,
  },
  collectorControl: { input: collectorRequestSchema, output: historyReadinessSchema },
  historicalImport: { input: importRequestSchema, output: importViewSchema },
  activity: {
    input: z
      .object({
        hostId: hostIdSchema,
        generation: generationSchema,
        refresh: z.boolean().optional(),
      })
      .strict(),
    output: activityViewSchema,
  },
});

const unavailable = (
  reason: "no-selection" | "foreign-host" | "selection-changed" | "host-offline" | "unsupported",
) => ({ state: "unavailable" as const, reason, snapshot: null });

export default function plugin(bb: BbPluginApi) {
  const hostClient = bb.hosts.experimental_client({ contract: hostContract });
  const session = createSelectedHost({
    async enrolled(hostId) {
      const host = await bb.sdk.hosts.get({ hostId });
      return host.id === hostId && host.type === "persistent" && host.lifecycle.phase === "active"
        ? host
        : null;
    },
  });
  bb.onDispose(() => session.dispose());
  const historyCall = createIdentityHistoryCall(bb, (hostId, signal, input) =>
    hostClient.call("historyReadiness", input, { hostId, signal }),
  );
  const readHistory = (input: import("../history/history-contract.js").HistoryRequest) =>
    session.request(input, {
      schema: historyReadinessSchema,
      unavailable: historyUnavailable,
      call: (signal) => historyCall(input.hostId, signal),
    });
  bb.rpc.register(rpcContract, {
    selection: async () => session.selection(),
    selectHost: ({ hostId }) => session.select(hostId),
    read: (input) =>
      session.request(input, {
        schema: quotaViewSchema,
        unavailable,
        errorReason: "host-offline",
        call: (signal) =>
          hostClient.call(
            "quota",
            { refresh: input.refresh === true },
            { hostId: input.hostId, signal },
          ),
      }),
    activity: (input) =>
      session.request(input, {
        schema: activityViewSchema,
        unavailable: emptyActivity,
        errorReason: "host-offline",
        timeoutMs: 12_000,
        call: (signal) =>
          hostClient.call(
            "activity",
            { refresh: input.refresh === true },
            { hostId: input.hostId, signal },
          ),
      }),
    historyReadiness: readHistory,
    collectorControl: (input) =>
      session.request(input, {
        schema: historyReadinessSchema,
        unavailable: historyUnavailable,
        call: (signal) =>
          hostClient.call(
            "collectorControl",
            {
              action: input.action,
              ...(input.confirmation ? { confirmation: input.confirmation } : {}),
            },
            { hostId: input.hostId, signal },
          ),
      }),
    calendarReport: (input) => {
      const query = structuredClone(input.query);
      const key = JSON.stringify(query);
      return session.request(input, {
        schema: calendarReportSchema,
        unavailable: calendarUnavailable,
        call: async (signal) => {
          const result = await hostClient.call("calendarReport", query, {
            hostId: input.hostId,
            signal,
          });
          return result.state === "unavailable" || JSON.stringify(result.query) === key
            ? result
            : calendarUnavailable("unsupported");
        },
      });
    },
    historicalImport: createImportHandler({
      session,
      sdk: bb.sdk,
      prepare: readHistory,
      call: (hostId, signal, input) =>
        hostClient.call("historicalImport", input, { hostId, signal }),
    }),
    async ping({ hostId }) {
      try {
        const host = await bb.sdk.hosts.get({ hostId });
        if (host.id !== hostId) return { reachable: false };
        return await hostClient.call("ping", null, { hostId });
      } catch {
        return { reachable: false };
      }
    },
  });
}
