import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { z } from "zod";
import { publishThreadsChanged } from "../delegate";
import type { TasksApiStore } from "../api";
import type { RunController } from "./run";
import { refuse } from "./run-provenance";
import type { DispatchStore } from "./dispatch-store";
import type {
  DispatchClaim,
  DispatchResult,
  dispatchInputSchema,
} from "./dispatch-contract";
import { workerUsable, type createEligibility } from "./dispatch-eligibility";
import { releasedDispatchGrant } from "./recovery-contract";

type Input = z.infer<typeof dispatchInputSchema>;
export function result(
  outcome: DispatchResult["outcome"],
  reason: string,
  claim: DispatchClaim | null = null,
  threadId: string | null = claim?.threadId ?? null,
  candidates: DispatchResult["candidates"] = [],
): DispatchResult {
  return { outcome, reason, claim, threadId, candidates };
}

export function createWorkerOwnership(
  bb: BbPluginApi,
  store: TasksApiStore,
  runs: RunController,
  claims: DispatchStore,
  eligible: ReturnType<typeof createEligibility>,
) {
  function selection(input: Input): DispatchResult | null {
    const owner = claims
      .owners(input.taskId)
      .find((owner) => owner.role === input.role);
    const claim = claims.live(input.taskId, input.role);
    if (owner) {
      const threadClaims = claims.forThread(owner.threadId);
      if (
        !claim ||
        threadClaims.length !== 1 ||
        threadClaims[0]!.id !== claim.id
      )
        return result(
          "resolution_needed",
          "The owner has missing or ambiguous live orchestration claims. Resolve ownership without replacement.",
          claim,
          owner.threadId,
        );
      if (
        claim.runId !== input.runId ||
        claim.coordinatorThreadId !== input.coordinatorThreadId
      )
        return result(
          "resolution_needed",
          "The owner remains bound to its original run and coordinator. Another run requires explicit recovery; no send or replacement.",
          claim,
          owner.threadId,
        );
      if (
        claim &&
        (claim.phase !== "attached" ||
          claim.threadId !== owner.threadId ||
          claim.associationId !== owner.associationId)
      )
        return result(
          "resolution_needed",
          "The owner has an unresolved or conflicting durable claim. Explicit recovery is required.",
          claim,
          owner.threadId,
        );
      const association = store.tasks.getTaskThreadByThreadId(
        input.taskId,
        owner.threadId,
      );
      if (association?.id !== owner.associationId)
        return result(
          "resolution_needed",
          "The designated association was detached or changed. No replacement is created.",
          claim,
          owner.threadId,
        );
      return result(
        "reused",
        "Reuse the explicit primary owner without sending or interrupting it.",
        claim,
        owner.threadId,
      );
    }
    if (claim)
      return result(
        "unresolved",
        claim.reason ??
          "The durable claim is still unresolved. No second creation is permitted.",
        claim,
      );
    const candidates = store.tasks
      .listTaskThreads(input.taskId)
      .map(({ id, threadId }) => ({ associationId: id, threadId }));
    if (candidates.length > 100)
      refuse(
        "ownership_size_limit",
        "More than 100 legacy attachments require a bounded ownership decision. No partial candidate list or spawn.",
      );
    if (candidates.length)
      return result(
        "resolution_needed",
        "Legacy attachments require explicit association adoption. Multiple candidates require a selection.",
        null,
        null,
        candidates,
      );
    const task = store.tasks.getTask(input.taskId)!;
    if (
      (task.status === "in_progress" || claims.priorWork(input.taskId)) &&
      !releasedDispatchGrant(claims.latest(input.taskId, input.role), input)
    )
      return result(
        "resolution_needed",
        "Prior work or in-progress status without an owner requires resolution.",
      );
    return null;
  }
  async function existing(
    input: Input,
    selected: DispatchResult,
  ): Promise<DispatchResult> {
    if (selected.outcome !== "reused" || !selected.threadId) return selected;
    const run = runs.requireActive(input.runId, input.coordinatorThreadId);
    const reason = await workerUsable(bb, selected.threadId, run.bbProjectId);
    return store.transaction(() => {
      eligible.local(
        input.runId,
        input.coordinatorThreadId,
        input.taskId,
        input.role,
      );
      const current = selection(input);
      if (
        !current ||
        current.threadId !== selected.threadId ||
        current.outcome !== "reused"
      )
        return (
          current ??
          result("resolution_needed", "Ownership changed during validation.")
        );
      return reason
        ? { ...current, outcome: "resolution_needed", reason }
        : current;
    });
  }
  async function adopt(
    input: Input & { associationId: string },
  ): Promise<DispatchResult> {
    const { run } = await eligible.check(
      input.runId,
      input.coordinatorThreadId,
      input.taskId,
      input.role,
    );
    const candidates = store.tasks.listTaskThreads(input.taskId);
    const chosen = candidates.find((row) => row.id === input.associationId);
    if (!chosen)
      refuse("adoption_invalid", "Choose a currently attached association.");
    const reason = await workerUsable(bb, chosen.threadId, run.bbProjectId);
    if (reason)
      return result("resolution_needed", reason, null, chosen.threadId);
    const metadata = await bb.sdk.threads.getPluginMetadata({
      threadId: chosen.threadId, signal: AbortSignal.timeout(1500),
    });
    if (metadata && Object.hasOwn(metadata, "orchestration"))
      refuse(
        "adoption_conflict",
        "A correlated worker must be recovered in its original claim, not adopted into another attempt.",
      );
    return store.transaction(() => {
      eligible.local(
        input.runId,
        input.coordinatorThreadId,
        input.taskId,
        input.role,
      );
      if (
        claims.live(input.taskId, input.role) ||
        claims.owners(input.taskId).length
      )
        refuse(
          "adoption_conflict",
          "An owner or durable claim already exists. Resolve it rather than replacing it.",
        );
      const current = store.tasks.getTaskThreadByThreadId(
        input.taskId,
        chosen.threadId,
      );
      if (current?.id !== input.associationId)
        refuse("adoption_invalid", "The selected association changed.");
      if (claims.hasHistoryForThread(chosen.threadId))
        refuse(
          "adoption_conflict",
          "The thread has a live orchestration claim or historical attempt. Recover its original ownership; manual attachments are unchanged.",
        );
      const claim = claims.reserve(input);
      claims.designate({
        taskId: input.taskId,
        role: input.role,
        associationId: chosen.id,
        threadId: chosen.threadId,
        runId: run.id,
      });
      const completed = claims.update(claim.id, {
        phase: "attached",
        threadId: chosen.threadId,
        associationId: chosen.id,
      });
      publishThreadsChanged(bb, input.taskId);
      return result(
        "adopted",
        "Explicitly adopted the selected existing association. No spawn, seed, interruption or status change.",
        completed,
      );
    });
  }
  return { selection, existing, adopt };
}
