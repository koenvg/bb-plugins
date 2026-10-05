import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createIdentityDiscovery } from "./identity-discovery.js";
import { historyReadinessSchema } from "./history-contract.js";
import type { IdentityBatch } from "./identity-contract.js";

export function createIdentityHistoryCall(
  bb: BbPluginApi,
  call: (
    hostId: string,
    signal: AbortSignal,
    input: { identities: IdentityBatch } | null,
  ) => Promise<unknown>,
) {
  const discovery = createIdentityDiscovery(bb.sdk, () => {
    const db = bb.storage.database();
    return {
      exec: (sql) => {
        db.exec(sql);
      },
      prepare: (sql) => db.prepare<import("./history-storage.js").SqlValue[]>(sql),
      transaction: (work) => db.transaction(work)(),
      close: () => {},
    };
  });
  return async (hostId: string, signal: AbortSignal) => {
    let batch: IdentityBatch | undefined;
    try {
      batch = await discovery.next(hostId, AbortSignal.any([signal, AbortSignal.timeout(8_000)]));
    } catch {
      signal.throwIfAborted();
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
}
