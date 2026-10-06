import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createIdentityDiscovery } from "./identity-discovery.js";
import { historyReadinessSchema } from "../history-contract.js";
import type { IdentityBatch } from "./identity-contract.js";
import {
  hostPreparationSchema,
  preparationUnavailable,
  type Preparation,
} from "../report-preparation-contract.js";

export function createIdentityHistoryCall(
  bb: BbPluginApi,
  call: (
    hostId: string,
    signal: AbortSignal,
    input: { identities: IdentityBatch } | null,
  ) => Promise<unknown>,
  prepareCall?: (
    hostId: string,
    signal: AbortSignal,
    input: { identities: IdentityBatch },
  ) => Promise<unknown>,
) {
  const discovery = createIdentityDiscovery(bb.sdk, () => {
    const db = bb.storage.database();
    return {
      exec: (sql) => {
        db.exec(sql);
      },
      prepare: (sql) => db.prepare<import("../storage/history-storage.js").SqlValue[]>(sql),
      transaction: (work) => db.transaction(work)(),
      close: () => {},
    };
  });
  const read = async (hostId: string, signal: AbortSignal) => {
    let batch: IdentityBatch | undefined;
    try {
      batch = await discovery.next(hostId, AbortSignal.any([signal, AbortSignal.timeout(8_000)]));
    } catch {
      signal.throwIfAborted();
      bb.log.warn("Identity discovery unavailable");
    }
    signal.throwIfAborted(); // Required immediately before host dispatch.
    const result = await call(hostId, signal, batch ? { identities: batch } : null);
    signal.throwIfAborted();
    const parsed = historyReadinessSchema.safeParse(result);
    const attribution = parsed.success
      ? (parsed.data.collection?.attribution ?? parsed.data.attribution)
      : undefined;
    if (batch && attribution) {
      if (batch.total !== null && batch.offset > 0 && attribution.discovery === "unknown")
        discovery.resetDelivery(batch);
      else discovery.delivered(batch);
    }
    return result;
  };
  return Object.assign(read, {
    async prepare(hostId: string, signal: AbortSignal, refresh: boolean): Promise<Preparation> {
      if (!prepareCall) return preparationUnavailable("unsupported");
      let batch: IdentityBatch;
      try {
        batch = await discovery.next(
          hostId,
          AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
          refresh,
        );
      } catch {
        signal.throwIfAborted();
        bb.log.warn("Identity discovery unavailable");
        return preparationUnavailable("discovery-unavailable");
      }
      signal.throwIfAborted();
      const result = hostPreparationSchema.safeParse(
        await prepareCall(hostId, signal, { identities: batch }),
      );
      signal.throwIfAborted();
      if (!result.success) return preparationUnavailable("unsupported");
      if (result.data.state === "unavailable") return preparationUnavailable(result.data.reason);
      const { attribution, progress } = result.data;
      if (batch.total !== null && attribution.discovery === "unknown") {
        if (batch.offset > 0) discovery.resetDelivery(batch);
        return preparationUnavailable("identity-unavailable");
      }
      discovery.delivered(batch);
      return {
        state:
          batch.total === null ||
          batch.offset + batch.rows.length < batch.total ||
          attribution.discovery !== "complete" ||
          attribution.backlog
            ? "pending"
            : "settled",
        progress: discovery.progress(batch) + ":" + progress,
      };
    },
  });
}
