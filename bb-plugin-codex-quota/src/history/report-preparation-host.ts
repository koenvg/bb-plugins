import { createHash } from "node:crypto";
import { withRetainedHistory, retainedHistoryReason } from "./storage/retained-history.js";
import type { HistoryReadContext, HistoryDependencies } from "./history-maintenance.js";
import type { hostPreparationSchema } from "./report-preparation-contract.js";
import type { z } from "zod";
import {
  acceptIdentityBatch,
  reconcileIdentity,
  identityView,
} from "./identity/identity-storage.js";

export async function prepareHostReport(
  context: HistoryReadContext,
  deps: HistoryDependencies,
): Promise<z.infer<typeof hostPreparationSchema>> {
  try {
    return await withRetainedHistory(context, deps, false, (db) => {
      context.signal.throwIfAborted();
      if (!context.identities) return { state: "unavailable", reason: "identity-unavailable" };
      acceptIdentityBatch(db, context.identities);
      reconcileIdentity(db, context.signal);
      const receipt = db.prepare("SELECT * FROM identity_receipt WHERE id=1").get();
      // Indexed first-pending markers change after each bounded reconciliation step.
      const pending = db
        .prepare(
          "SELECT event_id,revision FROM identity_usage WHERE revision<(SELECT revision FROM identity_receipt WHERE id=1) ORDER BY revision,event_id LIMIT 1",
        )
        .get();
      const expired = db
        .prepare(
          "SELECT event_id FROM identity_usage WHERE occurred_at<(SELECT compact_cutoff FROM history_retention WHERE id=1) ORDER BY occurred_at,event_id LIMIT 1",
        )
        .get();
      const progress = createHash("sha256")
        .update(JSON.stringify([receipt, pending, expired]))
        .digest("hex");
      const attribution = identityView(db);
      return {
        state: "available",
        attribution:
          context.identities.total === null
            ? { ...attribution, discovery: "partial" }
            : attribution,
        progress,
      };
    });
  } catch (error) {
    return { state: "unavailable", reason: retainedHistoryReason(error, context.signal) };
  }
}
