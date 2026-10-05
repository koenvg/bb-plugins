import { z } from "zod";
import { prChecksSchema, prReviewersSchema, type TaskWorkStatus } from "../shared/contract.js";
import { ageRichDetails } from "../shared/work-status-freshness.js";
import { canonicalPrIdentity } from "./work-status-pr-identity.js";
import { normalizeConditions } from "./work-status-conditions.js";

type WorkPr = TaskWorkStatus["pullRequests"]["items"][number];
export type RichReason = NonNullable<WorkPr["detailsReason"]>;
export type RichObservation = {
  reason?: RichReason;
  identity?: {
    url: string;
    number: number;
    state: "open" | "draft" | "merged" | "closed";
  };
  time?: number;
  rich?: NonNullable<WorkPr["rich"]>;
  // Queue interpretation belongs to BBP-7. Evidence stays local, not arbitrary RPC data.
  queueEvidence?: unknown;
};
const identitySchema = z
  .object({
    number: z.number().int().positive(),
    url: z.string(),
    state: z.enum(["open", "draft", "merged", "closed"]),
  })
  .strict();
const timeSchema = z.string().datetime({ offset: true });
const producerSchema = z.object({
  version: z.literal(1),
  updatedAt: timeSchema,
  pr: identitySchema,
  checks: prChecksSchema,
  reviewers: prReviewersSchema,
  blockers: z.array(z.string()).max(100),
  mergeQueue: z.unknown().optional(),
  error: z.string().nullable(),
});

/** Validate the producer's version-1 packet, retaining unorderable evidence, too. */
export function normalizeRichMetadata(metadata: unknown): RichObservation {
  const packet =
    metadata && typeof metadata === "object" && "prSummary" in metadata
      ? metadata.prSummary
      : undefined;
  if (packet === undefined || packet === null) return { reason: "metadata_absent" };
  if (typeof packet !== "object") return { reason: "invalid_metadata" };
  const fields = packet as Record<string, unknown>;
  const identity = identitySchema.safeParse(fields.pr);
  const url = identity.success
    ? canonicalPrIdentity(identity.data.url, identity.data.number)
    : null;
  const time = timeSchema.safeParse(fields.updatedAt);
  const evidence: RichObservation = {
    ...(identity.success && url ? { identity: { ...identity.data, url } } : {}),
    ...(time.success ? { time: Date.parse(time.data) } : {}),
  };
  // The producer guarantees <4096 bytes. Bound unknown queue/blocker evidence as well.
  try {
    if (new TextEncoder().encode(JSON.stringify(packet)).byteLength >= 4096)
      return { ...evidence, reason: "invalid_metadata" };
  } catch {
    return { ...evidence, reason: "invalid_metadata" };
  }
  if (fields.version !== 1) return { ...evidence, reason: "unsupported_version" };
  const parsed = producerSchema.safeParse(packet);
  if (!parsed.success || !url) return { ...evidence, reason: "invalid_metadata" };
  const value = parsed.data;
  const { reason: conditionReason, ...normalized } = normalizeConditions(fields, value);
  const reason: RichReason | undefined = value.error !== null ? "refresh_error" : conditionReason;
  return {
    ...evidence,
    reason,
    rich: {
      refreshedAt: value.updatedAt,
      checks: value.checks,
      reviewers: value.reviewers,
      ...normalized,
    },
    queueEvidence: value.mergeQueue,
  };
}

export function richDetails(
  pr: WorkPr,
  observations: readonly RichObservation[],
  now: number,
  association: "verified" | "uncertain",
): WorkPr {
  const unavailable = (reason: RichReason): WorkPr => ({
    ...pr,
    details: "unavailable",
    detailsReason: reason,
  });
  if (pr.state === "unknown") return unavailable("conflict");
  const matching = observations.filter((o) => o.identity?.url === pr.url);
  if (!matching.length) return unavailable(observations[0]?.reason ?? "metadata_absent");
  const undated = matching.filter((o) => o.time === undefined);
  if (undated.length)
    return unavailable(
      matching.length > 1 ? "conflict" : (undated[0]!.reason ?? "invalid_metadata"),
    );
  const newest = Math.max(...matching.map((o) => o.time!));
  const current = matching.filter((o) => o.time === newest);
  const fingerprints = new Set(
    current.map((o) =>
      JSON.stringify({
        state: o.identity?.state,
        rich: o.rich,
        reason: o.reason,
        queue: o.queueEvidence,
      }),
    ),
  );
  if (fingerprints.size !== 1) return unavailable("conflict");
  const candidate = current[0]!;
  if (!candidate.rich) return unavailable(candidate.reason ?? "invalid_metadata");
  if (candidate.identity?.state !== pr.state) return unavailable("lifecycle_mismatch");
  const partialRead = observations.find(
    (o) => !o.identity && o.reason && !["metadata_absent", "identity_mismatch"].includes(o.reason),
  );
  // Metadata may retain a former PR identity when the current host lookup fails.
  // Terminal fallback is historical evidence; only Open can certify current Ready.
  const associationReason =
    pr.state === "open" && association === "uncertain" ? "association_unavailable" : undefined;
  const reason = candidate.reason ?? partialRead?.reason ?? associationReason;
  const details =
    candidate.reason === "refresh_error" ? "unavailable" : reason ? "incomplete" : "available";
  return ageRichDetails(
    {
      ...pr,
      details,
      ...(reason ? { detailsReason: reason } : {}),
      rich:
        associationReason && candidate.rich.readiness === "ready"
          ? { ...candidate.rich, readiness: "unknown" }
          : candidate.rich,
    },
    now,
  );
}
