import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { TasksApiStore } from "../api";
import type { DispatchClaim } from "./dispatch-contract";
import type { DispatchStore } from "./dispatch-store";
import type { ApprovedRun } from "./run-contract";
import { fingerprint } from "./run-scope";

import { originalWorkerMatches } from "./original-worker";
type Thread = Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["get"]>>;
export interface RecoveryObservation {
  complete: boolean;
  reason: string;
  observedAt: string;
  reconciliationId: string | null;
  candidates: Thread[];
}
// All native reads finish before the caller's final synchronous Tasks decision.
export async function observeRecovery(
  bb: BbPluginApi,
  store: TasksApiStore,
  claims: DispatchStore,
  claim: DispatchClaim,
  run: ApprovedRun,
  knownThreadId?: string,
): Promise<RecoveryObservation> {
  const observedAt = new Date().toISOString();
  const failed = (reason: string): RecoveryObservation => ({
    complete: false,
    reason,
    observedAt,
    reconciliationId: null,
    candidates: [],
  });
  try {
    const rows: Array<{ id: string }> = [];
    // BB's list is an array, with explicit pagination. Both archive selections are
    // needed. A saturated bound is incomplete, not evidence of absence.
    for (const archived of [false, true]) {
      const page = await bb.sdk.threads.list({
        projectId: run.bbProjectId,
        originPluginId: bb.pluginId,
        includeHidden: true,
        archived,
        limit: 101,
        offset: 0,
        signal: AbortSignal.timeout(1500),
      });
      if (!Array.isArray(page) || page.length >= 101)
        return failed("BB listing coverage is incomplete.");
      for (const row of page) {
        if (!row?.id || rows.some((item) => item.id === row.id))
          return failed("BB listings contain incomplete or duplicate identities.");
        rows.push(row);
      }
    }
    const identities = new Set(rows.map((row) => row.id));
    if (claim.threadId) identities.add(claim.threadId);
    if (knownThreadId) identities.add(knownThreadId);
    const candidates: Thread[] = [];
    for (const id of identities) {
      let thread: Thread;
      try {
        thread = await bb.sdk.threads.get({
          threadId: id,
          signal: AbortSignal.timeout(1500),
        });
      } catch {
        return failed(
          "A listed or known worker could not be verified. Missing transport results do not prove absence.",
        );
      }
      if (thread.id !== id) return failed("BB returned a different worker identity.");
      const metadata = await bb.sdk.threads.getPluginMetadata({
        threadId: id,
        signal: AbortSignal.timeout(1500),
      });
      const raw = metadata?.orchestration;
      const related =
        id === claim.threadId ||
        id === knownThreadId ||
        (typeof raw === "object" &&
          raw !== null &&
          "attemptId" in raw &&
          raw.attemptId === claim.id);
      if (!related) continue;
      if (
        !originalWorkerMatches({
          thread,
          claim,
          projectId: run.bbProjectId,
          pluginId: bb.pluginId,
          correlation: raw,
          associationId: store.tasks.getTaskThreadByThreadId(claim.taskId, id)?.id ?? null,
        })
      )
        return failed(
          "Original worker native creation time, parent/project/plugin/task/role/run/attempt context could not be verified.",
        );
      candidates.push(thread);
    }
    candidates.sort((a, b) => a.id.localeCompare(b.id));
    return {
      complete: true,
      reason:
        candidates.length === 1
          ? "One original worker verified."
          : candidates.length
            ? "Multiple original candidates remain unresolved."
            : "Zero observed matches do not prove absence or rule out delayed creation.",
      observedAt,
      candidates,
      reconciliationId: fingerprint({
        claim,
        phase: run.phase,
        owners: claims.owners(claim.taskId),
        associations: store.tasks.listTaskThreads(claim.taskId),
        candidates: candidates.map((thread) => ({
          id: thread.id,
          createdAt: thread.createdAt,
          projectId: thread.projectId,
          parentThreadId: thread.parentThreadId,
          originPluginId: thread.originPluginId,
          status: thread.status,
          deletedAt: thread.deletedAt,
          archivedAt: thread.archivedAt,
        })),
      }),
    };
  } catch {
    return failed(
      "BB listings or metadata are unavailable or interrupted. Keep the durable claim.",
    );
  }
}
