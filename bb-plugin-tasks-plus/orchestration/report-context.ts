import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { TasksApiStore } from "../api";
import { correlationSchema, type DispatchClaim } from "./dispatch-contract";
import { createDispatchStore } from "./dispatch-store";
import { createRunStore } from "./run-store";
import { refuse } from "./run-provenance";
import { fingerprint } from "./run-scope";
import { isSideChatShapedThread } from "../shared/side-chat";

type Thread = Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["get"]>>;
interface Observation {
  thread: Thread;
  metadata: Record<string, unknown>;
  matches: string[];
}
const recoverablePhases = new Set([
  "creating",
  "created",
  "creation_unknown",
  "attachment_failed",
  "admission_rejected",
]);

export function createReportContext(bb: BbPluginApi, store: TasksApiStore) {
  const claims = createDispatchStore(bb.storage.database());
  const runs = createRunStore(bb.storage.database());
  function recoverable(
    taskId: string,
    threadId: string,
    observed: Observation,
  ): DispatchClaim {
    const correlation = correlationSchema.safeParse(
      observed.metadata.orchestration,
    );
    if (!correlation.success)
      refuse(
        "report_wrong_worker",
        "No attached association or recoverable creation context.",
      );
    const claim = claims.get(correlation.data.attemptId);
    if (
      !claim ||
      claim.releasedAt ||
      !recoverablePhases.has(claim.phase) ||
      claim.taskId !== taskId ||
      (claim.threadId && claim.threadId !== threadId)
    ) {
      refuse(
        "report_context_conflict",
        "Creation claim is absent, released, attached elsewhere or conflicting.",
      );
    }
    const run = runs.getRun(claim.runId);
    const expected = run && {
      version: 1,
      attemptId: claim.id,
      taskId,
      role: claim.role,
      runId: claim.runId,
      coordinatorThreadId: claim.coordinatorThreadId,
      bbProjectId: run.bbProjectId,
    };
    const originalNativeChild =
      observed.thread.originPluginId === bb.pluginId &&
      observed.thread.parentThreadId === claim.coordinatorThreadId &&
      observed.thread.createdAt >= Date.parse(claim.createdAt);
    const uniqueOriginal =
      observed.matches.length === 1 && observed.matches[0] === threadId;
    if (
      !expected ||
      fingerprint(correlation.data) !== fingerprint(expected) ||
      !originalNativeChild ||
      !uniqueOriginal
    ) {
      refuse(
        "report_context_conflict",
        "Native creation facts do not identify one original authorized worker. Metadata alone is not authority.",
      );
    }
    return claim;
  }
  function local(taskId: string, threadId: string, observed: Observation) {
    const task = store.tasks.getTask(taskId);
    const project = task && store.tasks.getProject(task.projectId);
    const native = observed.thread;
    if (
      !task ||
      !project?.linkedBbProjectId ||
      native.id !== threadId ||
      native.projectId !== project.linkedBbProjectId ||
      native.deletedAt != null ||
      isSideChatShapedThread(native)
    ) {
      refuse(
        "report_context_invalid",
        "Worker and task must belong to the same linked BB project.",
      );
    }
    const association = store.tasks.getTaskThreadByThreadId(taskId, threadId);
    const threadClaims = claims.forThread(threadId);
    if (threadClaims.length > 1)
      refuse("report_context_conflict", "Worker has ambiguous live claims.");
    let claim = threadClaims[0] ?? null;
    if (
      association &&
      claims.claims(taskId).some((candidate) => candidate.id !== claim?.id)
    ) {
      refuse(
        "report_context_conflict",
        "An attached worker cannot bypass a different live task claim.",
      );
    }
    if (claim && claim.taskId !== taskId)
      refuse("report_wrong_worker", "Worker belongs to another task claim.");
    const owners = claims.owners(taskId);
    if (
      owners.length &&
      !owners.some(
        (owner) =>
          owner.threadId === threadId &&
          owner.associationId === association?.id,
      )
    ) {
      refuse(
        "report_wrong_worker",
        "This worker is not the designated attached task owner.",
      );
    }
    if (!association) {
      const original = recoverable(taskId, threadId, observed);
      if (claim && claim.id !== original.id)
        refuse("report_context_conflict", "Worker claims disagree.");
      claim = original;
    } else if (
      claim &&
      (claim.phase !== "attached" || claim.associationId !== association.id)
    ) {
      refuse("report_context_conflict", "Attached worker and claim disagree.");
    }
    const run = claim ? runs.getRun(claim.runId) : null;
    if (
      claim &&
      (!run ||
        run.coordinatorThreadId !== claim.coordinatorThreadId ||
        run.projectId !== task.projectId ||
        run.bbProjectId !== project.linkedBbProjectId ||
        !run.approvedTaskIds.includes(taskId) ||
        task.parentTaskId !== run.epicId)
    ) {
      refuse(
        "report_context_conflict",
        "Original claim/run/task context no longer matches.",
      );
    }
    return {
      task,
      project,
      associationId: association?.id ?? null,
      claimId: claim?.id ?? null,
      runId: run?.id ?? null,
      coordinatorThreadId: run?.coordinatorThreadId ?? null,
      role: claim?.role ?? null,
    };
  }
  async function observe(
    taskId: string,
    threadId: string,
  ): Promise<Observation> {
    const signal = AbortSignal.timeout(2000);
    const thread = await bb.sdk.threads.get({ threadId, signal });
    if (store.tasks.getTaskThreadByThreadId(taskId, threadId))
      return { thread, metadata: {}, matches: [] };
    const metadata = await bb.sdk.threads.getPluginMetadata({
      threadId,
      signal,
    });
    const parsed = correlationSchema.safeParse(metadata.orchestration);
    const claim = parsed.success ? claims.get(parsed.data.attemptId) : null;
    if (
      !parsed.success ||
      !claim ||
      claim.taskId !== taskId ||
      claim.releasedAt ||
      claim.coordinatorThreadId !== thread.parentThreadId
    )
      return { thread, metadata, matches: [] };
    // A canonical returned child ID is already authoritative Tasks evidence.
    if (claim.threadId === threadId)
      return { thread, metadata, matches: [threadId] };
    const children = await bb.sdk.threads.list({
      projectId: thread.projectId!,
      parentThreadId: claim.coordinatorThreadId,
      originPluginId: bb.pluginId,
      includeHidden: true,
      limit: 101,
      signal,
    });
    if (children.length > 100)
      refuse(
        "report_context_size_limit",
        "Creation lookup exceeds 100 candidates; explicit recovery is required.",
      );
    const matches: string[] = [];
    for (let offset = 0; offset < children.length; offset += 4) {
      const identities = await Promise.all(
        children.slice(offset, offset + 4).map(async (child) => {
          const data = await bb.sdk.threads.getPluginMetadata({
            threadId: child.id,
            signal,
          });
          const candidate = correlationSchema.safeParse(data.orchestration);
          return candidate.success && candidate.data.attemptId === claim.id
            ? child.id
            : null;
        }),
      );
      matches.push(...identities.filter((id): id is string => id !== null));
    }
    return { thread, metadata, matches };
  }
  return { observe, local };
}
