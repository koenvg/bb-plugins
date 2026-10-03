import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { z } from "zod";
import {
  publishTasksChanged,
  publishCommentsChanged,
  type TasksApiStore,
} from "../api";
import { publishThreadsChanged, createSystemComment } from "../delegate";
import type { RunController } from "./run";
import { refuse } from "./run-provenance";
import type { DispatchStore } from "./dispatch-store";
import type {
  DispatchClaim,
  DispatchResult,
  dispatchInputSchema,
} from "./dispatch-contract";
import { workerUsable, type createEligibility } from "./dispatch-eligibility";

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
    if (task.status === "in_progress" || claims.priorWork(input.taskId))
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
  // A known returned child may be attached on an ordinary retry. Unknown
  // creation requires BBP-37 reconciliation, never a second spawn here.
  async function attach(
    input: Input,
    claim: DispatchClaim,
  ): Promise<DispatchResult> {
    if (
      !claim.threadId ||
      !["created", "attachment_failed"].includes(claim.phase)
    )
      return result(
        "unresolved",
        claim.reason ?? "Creation is unresolved.",
        claim,
      );
    const { run } = await eligible.check(
      input.runId,
      input.coordinatorThreadId,
      input.taskId,
      input.role,
    );
    if (claim.runId !== run.id)
      return result(
        "unresolved",
        "Recover the original attempt in its run context.",
        claim,
      );
    const reason = await workerUsable(bb, claim.threadId, run.bbProjectId);
    if (reason) return result("unresolved", reason, claim);
    try {
      const completed = store.transaction(() => {
        const { task } = eligible.local(
          input.runId,
          input.coordinatorThreadId,
          input.taskId,
          input.role,
        );
        const current = claims.get(claim.id)!;
        if (current.phase === "attached") return current;
        if (!["created", "attachment_failed"].includes(current.phase))
          return current;
        if (
          claims.owners(task.id).length ||
          store.tasks
            .listTaskThreads(task.id)
            .some((row) => row.threadId !== claim.threadId)
        )
          throw new Error("Ownership or attachments changed during creation");
        const preset = store.tasks.getPreset(run.execution.presetId)!;
        const association = store.tasks.upsertTaskThread({
          taskId: task.id,
          threadId: claim.threadId!,
          presetName: preset.name,
          title: `${task.key} · ${task.title}`,
          liveStatus: "starting",
        });
        claims.designate({
          taskId: task.id,
          role: input.role,
          associationId: association.id,
          threadId: claim.threadId!,
          runId: run.id,
        });
        if (task.status === "todo" || task.status === "backlog")
          store.tasks.updateTask(task.id, { status: "in_progress" });
        createSystemComment(store.tasks, {
          taskId: task.id,
          threadId: claim.threadId!,
          presetName: preset.name,
          body: `Orchestration dispatched primary ${input.role} owner. Attempt ${claim.id}.`,
        });
        return claims.update(claim.id, {
          phase: "attached",
          associationId: association.id,
          reason: null,
        });
      });
      if (completed.phase !== "attached")
        return result(
          "unresolved",
          "Admission or creation requires resolution.",
          completed,
        );
      publishThreadsChanged(bb, input.taskId);
      publishTasksChanged(bb, input.taskId, run.projectId);
      publishCommentsChanged(bb, input.taskId);
      return result(
        "created",
        "One worker is attached as primary owner. Local ownership, association and status committed together.",
        completed,
      );
    } catch (error) {
      const current = claims.get(claim.id)!;
      if (current.phase === "attached")
        return result(
          "reused",
          "The original attachment already committed.",
          current,
        );
      if (current.phase === "admission_rejected")
        return result(
          "unresolved",
          current.reason ?? "Native admission requires explicit recovery.",
          current,
        );
      const failed = claims.update(claim.id, {
        phase: "attachment_failed",
        reason:
          "Local attachment failed. The original child and durable claim are preserved.",
      });
      bb.log.warn(
        `Dispatch attachment failed for ${claim.id}: ${error instanceof Error ? error.message : "unknown"}`,
      );
      return result("unresolved", failed.reason!, failed);
    }
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
      if (claims.forThread(chosen.threadId).length)
        refuse(
          "adoption_conflict",
          "The thread already has a live orchestration claim. Resolve its original ownership; manual attachments are unchanged.",
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
  return { selection, existing, attach, adopt };
}
