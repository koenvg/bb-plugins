import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { correlationSchema, type DispatchClaim } from "./dispatch-contract";

type Thread = Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["get"]>>;

// Editable correlation is a lookup hint. Native facts and durable association
// identity decide whether this is the original, without granting execution.
export function originalWorkerMatches({
  thread,
  claim,
  projectId,
  pluginId,
  correlation,
  associationId,
}: {
  thread: Thread;
  claim: DispatchClaim;
  projectId: string;
  pluginId: string;
  correlation: unknown;
  associationId: string | null;
}): boolean {
  if (thread.projectId !== projectId || (claim.threadId && claim.threadId !== thread.id))
    return false;
  if (correlation === undefined) {
    return (
      claim.threadId === thread.id &&
      claim.associationId !== null &&
      claim.associationId === associationId
    );
  }
  const parsed = correlationSchema.safeParse(correlation);
  const createdAt = Date.parse(claim.createdAt);
  return (
    parsed.success &&
    parsed.data.attemptId === claim.id &&
    parsed.data.taskId === claim.taskId &&
    parsed.data.role === claim.role &&
    parsed.data.runId === claim.runId &&
    parsed.data.coordinatorThreadId === claim.coordinatorThreadId &&
    parsed.data.bbProjectId === projectId &&
    thread.originPluginId === pluginId &&
    thread.parentThreadId === claim.coordinatorThreadId &&
    Number.isFinite(createdAt) &&
    Number.isFinite(thread.createdAt) &&
    thread.createdAt >= createdAt
  );
}
