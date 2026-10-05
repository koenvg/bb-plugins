import { createHash } from "node:crypto";
import { usageRecordSchema } from "./usage-record.js";
import type { CompactRow } from "./history-retention.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const fields = [
  "version",
  "occurredAt",
  "sessionId",
  "workspace",
  "provider",
  "model",
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "reasoningTokens",
  "totalTokens",
  "capturedCost",
] as const;
function scalarValues(payload: string) {
  const input = JSON.parse(payload) as Record<string, unknown>;
  const values = Object.fromEntries(fields.map((key) => [key, input[key]]));
  values.occurredAt = new Date(values.occurredAt as string).toISOString();
  return values;
}
function proofs(payload: string) {
  const values = scalarValues(payload),
    { version, ...rest } = values;
  return {
    v: 2,
    d: hash(JSON.stringify(values)),
    // Versions 2/3 hashed provenance into entry evidence. Keep content-free comparison
    // proofs so new aliases can match old owners even after detailed payload expiry.
    o: hash(JSON.stringify({ version, provenance: "observed", ...rest })),
    i: hash(JSON.stringify({ version, provenance: "imported", ...rest })),
  };
}
export function usageEvidence(payload: string) {
  return JSON.stringify(proofs(payload));
}
function evidenceHashes(value: string): string[] {
  if (!value.startsWith("{")) return [value];
  const input = JSON.parse(value) as { v?: number; d?: string; o?: string; i?: string };
  const proof = input.v === 2 ? input : proofs(value);
  if (
    ![proof.d, proof.o, proof.i].every(
      (hash) => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash),
    )
  )
    throw Error("History evidence unavailable");
  return [proof.d!, proof.o!, proof.i!];
}
export function sameUsageEvidence(left: string, right: string) {
  const known = new Set(evidenceHashes(left));
  return evidenceHashes(right).some((value) => known.has(value));
}
export function usageDigest(payload: string) {
  return hash(JSON.stringify({ eventId: JSON.parse(payload).eventId, d: proofs(payload).d }));
}
export function sameCompactUsage(row: CompactRow, payload: string) {
  if (row.digest === usageDigest(payload)) return true;
  // The original version-2/3 digest includes optional metadata and provenance. Compare
  // incoming scalars with those original fields, without rewriting the stored row.
  const legacy = usageRecordSchema.parse({
    ...JSON.parse(payload),
    providerSessionKey: row.provider_key,
    claimedThreadId: row.claimed_thread,
    provenance: row.provenance,
  });
  return row.digest === hash(JSON.stringify(legacy));
}
