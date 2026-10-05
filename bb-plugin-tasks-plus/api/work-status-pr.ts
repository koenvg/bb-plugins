import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { TaskWorkStatus } from "../shared/contract.js";
import { canonicalPrIdentity } from "./work-status-pr-identity.js";
import { richDetails, type RichObservation } from "./work-status-rich.js";

type WorkPr = TaskWorkStatus["pullRequests"]["items"][number];
type HostPr = Pick<WorkPr, "url" | "number" | "title" | "state" | "updatedAt">;
export type PrObservation =
  | { outcome: "found"; pullRequest: HostPr }
  | { outcome: "absent" }
  | { outcome: "unavailable" };

/** Identity/lifecycle are independent from rich check/review quality. */
export function normalizeHostPr(
  result: Awaited<ReturnType<BbPluginApi["sdk"]["environments"]["pullRequest"]>>,
): PrObservation {
  if (result.outcome === "absent") return { outcome: "absent" };
  if (result.outcome !== "available") return { outcome: "unavailable" };
  try {
    const pr = result.pullRequest;
    const url = canonicalPrIdentity(pr.url, pr.number);
    if (
      !url ||
      typeof pr.title !== "string" ||
      typeof pr.updatedAt !== "string" ||
      !["open", "draft", "merged", "closed"].includes(pr.state)
    )
      return { outcome: "unavailable" };
    return {
      outcome: "found",
      pullRequest: {
        url,
        number: pr.number,
        title: pr.title,
        state: pr.state,
        updatedAt: pr.updatedAt,
      },
    };
  } catch {
    return { outcome: "unavailable" };
  }
}

type LifecycleEvidence = { state: WorkPr["state"]; time: number };
function lifecycle(evidence: readonly LifecycleEvidence[]): WorkPr["state"] {
  const newest = evidence.reduce(
    (max, e) => (Number.isFinite(e.time) ? Math.max(max, e.time) : max),
    -Infinity,
  );
  // Complete per-URL evidence grouping preserves the slice-3 malformed-time fix.
  // Dated evidence supersedes only older dated evidence, never unorderable evidence.
  const current = evidence.filter((e) => !Number.isFinite(e.time) || e.time === newest);
  const states = new Set(current.map((e) => e.state));
  return states.size === 1 ? current[0]!.state : "unknown";
}

/** Reconcile all evidence before choosing labels; an attachment order never chooses a winner. */
export function taskPullRequests(
  threadIds: readonly string[],
  observations: ReadonlyMap<string, PrObservation>,
  metadata: ReadonlyMap<string, RichObservation> = new Map(),
  now = Date.now(),
): TaskWorkStatus["pullRequests"] {
  const byUrl = new Map<
    string,
    {
      threadIds: string[];
      hosts: HostPr[];
      lifecycle: LifecycleEvidence[];
      rich: RichObservation[];
      association: "verified" | "uncertain";
      identity: { url: string; number: number };
    }
  >();
  const unavailableThreadIds: string[] = [];
  for (const threadId of new Set(threadIds)) {
    const host = observations.get(threadId);
    let rich = metadata.get(threadId);
    if (rich?.time !== undefined && rich.time > now)
      rich = { ...rich, reason: "invalid_metadata", rich: undefined };
    // A current association/absence read supersedes metadata for a former PR.
    if (host?.outcome === "absent") continue;
    const hostPr = host?.outcome === "found" ? host.pullRequest : undefined;
    if (!hostPr) unavailableThreadIds.push(threadId);
    const identity = hostPr ?? rich?.identity;
    if (!identity) continue;
    const group = byUrl.get(identity.url) ?? {
      threadIds: [],
      hosts: [],
      lifecycle: [],
      rich: [],
      association: "verified" as const,
      identity,
    };
    group.threadIds.push(threadId);
    if (!hostPr) group.association = "uncertain";
    if (hostPr) {
      group.hosts.push(hostPr);
      group.lifecycle.push({
        state: hostPr.state,
        time: Date.parse(hostPr.updatedAt),
      });
    }
    if (rich?.identity && rich.identity.url !== identity.url)
      rich = { reason: "identity_mismatch" };
    if (rich) {
      group.rich.push(rich);
      if (
        rich.identity &&
        rich.rich &&
        rich.reason !== "refresh_error" &&
        rich.reason !== "invalid_metadata"
      )
        group.lifecycle.push({
          state: rich.identity.state,
          time: rich.time ?? NaN,
        });
    }
    byUrl.set(identity.url, group);
  }
  const items = [...byUrl.values()].map((group): WorkPr => {
    const representative = [...group.hosts].sort(
      (a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0),
    )[0];
    const pr: WorkPr = {
      ...group.identity,
      title: representative?.title ?? "",
      updatedAt: representative?.updatedAt ?? "",
      state: lifecycle(group.lifecycle),
      threadIds: group.threadIds,
      details: "unavailable",
    };
    return richDetails(pr, group.rich, now, group.association);
  });
  return {
    availability: unavailableThreadIds.length
      ? items.length
        ? "partial"
        : "unavailable"
      : "available",
    items,
    unavailableThreadIds,
  };
}
