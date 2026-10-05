import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { TasksApiStore } from "../api";
import type { ApprovedRun } from "./run-contract";
import { refuse } from "./run-provenance";

export interface HandoffReadiness {
  state: "unknown" | "blocked" | "ready" | "not_required";
  reason: string;
  references?: readonly string[];
}
export type HandoffReader = (taskId: string, run: ApprovedRun) => HandoffReadiness;
// Until report/handoff storage exists, a closed native dependency proves no
// artifact readiness. No dependencies means there is no native handoff to read.
export function nativeHandoff(store: TasksApiStore, taskId: string): HandoffReadiness {
  return store.tasks.listBlockers(taskId).length
    ? {
        state: "unknown",
        reason:
          "Prerequisite result handoffs are not yet available. Native done/canceled alone is insufficient.",
      }
    : { state: "not_required", reason: "No native prerequisite handoffs." };
}
export async function currentCoordinator(bb: BbPluginApi, run: ApprovedRun) {
  const [thread, project, version] = await Promise.all([
    bb.sdk.threads.get({
      threadId: run.coordinatorThreadId,
      signal: AbortSignal.timeout(1500),
    }),
    bb.sdk.projects.get({
      projectId: run.bbProjectId,
      signal: AbortSignal.timeout(1500),
    }),
    bb.sdk.system.version({ signal: AbortSignal.timeout(1500) }),
  ]);
  if (thread.providerId !== "pi" || version.currentVersion !== "0.44.0")
    refuse(
      "provider_unverified",
      "Coordinator verification is supported only for Pi on BB 0.44.0. A changed path requires new support verification.",
    );
  if (project.id !== run.bbProjectId)
    refuse("project_mismatch", "The linked native BB project could not be verified.");
  if (
    thread.projectId !== run.bbProjectId ||
    thread.deletedAt != null ||
    thread.archivedAt != null ||
    thread.status === "error" ||
    thread.status === "stopping"
  )
    refuse(
      "coordinator_invalid",
      "The live coordinator is unavailable or no longer belongs to the approved BB project.",
    );
  return thread;
}
export async function workerUsable(
  bb: BbPluginApi,
  threadId: string,
  projectId: string,
): Promise<string | null> {
  try {
    const thread = await bb.sdk.threads.get({
      threadId,
      signal: AbortSignal.timeout(1500),
    });
    if (
      thread.projectId !== projectId ||
      thread.deletedAt != null ||
      thread.archivedAt != null ||
      thread.status === "error" ||
      thread.status === "stopping"
    )
      return "The designated worker is missing, failed, deleted, archived, or stopping. Resolve ownership; no replacement is created.";
    const events = await bb.sdk.threads.events.list({
      threadId,
      types: ["system/thread/interrupted"],
      order: "desc",
      limit: "100",
      signal: AbortSignal.timeout(1500),
    });
    if (events.length >= 100)
      return "Worker interruption coverage is incomplete. Resolve ownership.";
    if (
      events.some(
        (event) =>
          event.type === "system/thread/interrupted" && event.data.reason === "manual-stop",
      )
    )
      return "The owner was manually stopped. Explicit recovery is required.";
    return null;
  } catch {
    return "The owner or its interruption history could not be verified. No replacement is created.";
  }
}
