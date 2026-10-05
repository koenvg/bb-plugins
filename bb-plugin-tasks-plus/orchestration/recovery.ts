import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { publishCommentsChanged, publishTasksChanged, type TasksApiStore } from "../api";
import { createSystemComment, publishThreadsChanged } from "../delegate";
import type { DispatchStore } from "./dispatch-store";
import type { RunController } from "./run";
import { currentCoordinator, workerUsable } from "./dispatch-eligibility";
import { refuse } from "./run-provenance";
import { fingerprint } from "./run-scope";
import { relinquishableWorker } from "./recovery-worker";
import { observeRecovery, type RecoveryObservation } from "./recovery-observation";
import { readRecoveryDecision } from "./recovery-decision";
import {
  RECOVERY_WARNING,
  recoveryInputSchema,
  recoveryRpcContract,
  resolutionDecisionSchema,
  resolutionRecordSchema,
  readResolution,
  type RecoveryInput,
  type RecoveryResult,
} from "./recovery-contract";

export function createRecovery(
  bb: BbPluginApi,
  store: TasksApiStore,
  runs: RunController,
  claims: DispatchStore,
) {
  function context(input: RecoveryInput) {
    const run = runs.requireContext(input.runId, input.coordinatorThreadId);
    const task = store.tasks.getTask(input.taskId);
    const claim = claims.get(input.claimId);
    if (
      !task ||
      task.projectId !== run.projectId ||
      !run.approvedTaskIds.includes(task.id) ||
      input.role !== "implementation" ||
      !claim ||
      claim.taskId !== task.id ||
      claim.role !== input.role ||
      claim.runId !== run.id ||
      claim.coordinatorThreadId !== run.coordinatorThreadId
    )
      refuse(
        "recovery_context_invalid",
        "Recover the exact original task/role/claim in its original approved run and coordinator project.",
      );
    const snapshot = fingerprint({
      run,
      claim,
      owners: claims.owners(task.id),
      associations: store.tasks.listTaskThreads(task.id),
    });
    return { run, task, claim, snapshot };
  }
  function fresh(input: RecoveryInput, snapshot: string) {
    const current = context(input);
    if (current.snapshot !== snapshot)
      refuse(
        "recovery_state_changed",
        "Local ownership or effective run changed during native reads. Reconcile again.",
      );
    return current;
  }
  function output(
    claim: ReturnType<DispatchStore["reserve"]>,
    observation: RecoveryObservation,
    outcome: RecoveryResult["outcome"] = "unresolved",
    reason = observation.reason,
  ): RecoveryResult {
    return {
      outcome,
      reason,
      warning: RECOVERY_WARNING,
      claim,
      threadId: claim.threadId,
      complete: observation.complete,
      reconciliationId: observation.reconciliationId,
      observedAt: observation.observedAt,
      candidates: observation.candidates.map((thread) => thread.id),
    };
  }
  function publish(input: RecoveryInput) {
    publishThreadsChanged(bb, input.taskId);
    publishTasksChanged(bb, input.taskId, store.tasks.getTask(input.taskId)!.projectId);
    publishCommentsChanged(bb, input.taskId);
  }
  function attach(
    input: RecoveryInput,
    snapshot: string,
    observation: RecoveryObservation,
  ): RecoveryResult {
    return store.transaction(() => {
      const { run, task, claim } = fresh(input, snapshot);
      if (claim.releasedAt)
        return output(
          claim,
          observation,
          "unresolved",
          "The original claim is released. Its history cannot be retagged.",
        );
      if (!observation.complete || observation.candidates.length !== 1)
        return output(claim, observation);
      const thread = observation.candidates[0]!;
      if (thread.deletedAt != null || thread.archivedAt != null)
        return output(
          claim,
          observation,
          "unresolved",
          "Original worker is deleted or archived. Preserve it for explicit resolution.",
        );
      if (claim.threadId && claim.threadId !== thread.id)
        return output(
          claim,
          observation,
          "unresolved",
          "The discovered identity conflicts with the original claim.",
        );
      const threadClaims = claims.forThread(thread.id);
      if (threadClaims.some((row) => row.id !== claim.id))
        return output(
          claim,
          observation,
          "unresolved",
          "The worker has another live claim. Do not steal its ownership.",
        );
      const owners = claims.owners(task.id);
      const owner = owners.find((row) => row.role === input.role);
      if (
        owner &&
        (owner.threadId !== thread.id ||
          owner.runId !== run.id ||
          owner.associationId !== claim.associationId)
      )
        return output(
          claim,
          observation,
          "unresolved",
          "Another designation conflicts with the original attempt.",
        );
      const association = store.tasks.getTaskThreadByThreadId(task.id, thread.id);
      if (owner && association?.id === owner.associationId) {
        // A verified unchanged owner is stronger evidence than interrupted bookkeeping.
        // Admission rejection remains execution state; recovery does not clear it.
        const completed =
          claim.threadId === thread.id && ["attached", "admission_rejected"].includes(claim.phase)
            ? claim
            : claims.update(claim.id, {
                threadId: thread.id,
                phase: claim.phase === "admission_rejected" ? claim.phase : "attached",
                reason: claim.phase === "admission_rejected" ? claim.reason : null,
              });
        return output(
          completed,
          observation,
          "reused",
          "Return the original owning worker. No execution is requested.",
        );
      }
      if (owner)
        return output(
          claim,
          observation,
          "unresolved",
          "The original designation was detached. Explicit owner resolution is required.",
        );
      const preset = store.tasks.getPreset(run.execution.presetId)!;
      const attached = store.tasks.upsertTaskThread({
        taskId: task.id,
        threadId: thread.id,
        presetName: preset.name,
        title: thread.title ?? `${task.key} · ${task.title}`,
        liveStatus: thread.status === "active" ? "working" : "starting",
      });
      claims.designate({
        taskId: task.id,
        role: input.role,
        associationId: attached.id,
        threadId: thread.id,
        runId: claim.runId,
      });
      if (task.status === "todo" || task.status === "backlog")
        store.tasks.updateTask(task.id, { status: "in_progress" });
      createSystemComment(store.tasks, {
        taskId: task.id,
        threadId: thread.id,
        presetName: preset.name,
        body: `Recovered original ${input.role} worker. Attempt ${claim.id}. No spawn, seed, resume or deletion.`,
      });
      const completed = claims.update(claim.id, {
        threadId: thread.id,
        associationId: attached.id,
        phase: claim.phase === "admission_rejected" ? "admission_rejected" : "attached",
        reason: claim.phase === "admission_rejected" ? claim.reason : null,
      });
      return output(
        completed,
        observation,
        "recovered",
        "Attached the verified original, including an already active worker. Run phase is unchanged.",
      );
    });
  }
  async function inspect(input: RecoveryInput, knownThreadId?: string) {
    const initial = context(input);
    await currentCoordinator(bb, initial.run);
    const observation = await observeRecovery(
      bb,
      store,
      claims,
      initial.claim,
      initial.run,
      knownThreadId,
    );
    fresh(input, initial.snapshot);
    return { ...initial, observation };
  }
  async function reconcile(input: RecoveryInput): Promise<RecoveryResult> {
    const checked = recoveryInputSchema.parse(input);
    const { snapshot, observation } = await inspect(checked);
    const result = attach(checked, snapshot, observation);
    if (result.outcome === "recovered") publish(checked);
    return result;
  }
  async function link(input: RecoveryInput & { threadId: string }): Promise<RecoveryResult> {
    const { threadId, ...request } = input;
    const { claim, snapshot, observation } = await inspect(
      recoveryInputSchema.parse(request),
      threadId,
    );
    if (observation.candidates.length !== 1 || observation.candidates[0]?.id !== threadId)
      return output(
        claim,
        observation,
        "unresolved",
        "Known-worker linking must select the unique verified original.",
      );
    const result = attach(request, snapshot, observation);
    if (result.outcome === "recovered") publish(request);
    return result;
  }
  async function resolve(
    input: Parameters<typeof recoveryRpcContract.orchestrateResolve.input.parse>[0],
  ): Promise<RecoveryResult> {
    const parsed = recoveryRpcContract.orchestrateResolve.input.parse(input);
    const { requestId, ...parameters } = parsed;
    const decision = resolutionDecisionSchema.parse(parameters);
    const request = recoveryInputSchema.parse({
      runId: decision.runId,
      coordinatorThreadId: decision.coordinatorThreadId,
      taskId: decision.taskId,
      role: decision.role,
      claimId: decision.claimId,
    });
    const { run, claim, snapshot, observation } = await inspect(request);
    const decisionReference = await readRecoveryDecision(bb, decision, requestId);
    const previous = readResolution(claim.reason);
    if (claim.releasedAt) {
      if (
        previous &&
        previous.decisionReference === decisionReference &&
        fingerprint(previous.decision) === fingerprint(decision)
      ) {
        if (previous.decision.action === "release")
          return output(
            claim,
            observation,
            "released",
            "Return the recorded release. No operation is replayed.",
          );
        const replacement = claims.get(previous.replacementClaimId ?? "");
        const nativeReason = replacement?.threadId
          ? await workerUsable(bb, replacement.threadId, run.bbProjectId)
          : "Recorded replacement identity is missing.";
        if ((await readRecoveryDecision(bb, decision, requestId)) !== decisionReference)
          refuse(
            "recovery_decision_stale",
            "The recorded decision changed during retry validation.",
          );
        return store.transaction(() => {
          fresh(request, snapshot);
          const current = claims.get(replacement?.id ?? "");
          const owner = claims.owners(claim.taskId).find((row) => row.role === claim.role);
          if (
            !observation.complete ||
            nativeReason ||
            !replacement ||
            !current ||
            fingerprint(current) !== fingerprint(replacement) ||
            current.releasedAt ||
            current.phase !== "attached" ||
            current.taskId !== claim.taskId ||
            current.role !== claim.role ||
            current.runId !== claim.runId ||
            current.coordinatorThreadId !== claim.coordinatorThreadId ||
            !current.threadId ||
            current.associationId !== decision.associationId ||
            claims.live(claim.taskId, claim.role)?.id !== current.id ||
            claims.forThread(current.threadId).length !== 1 ||
            owner?.threadId !== current.threadId ||
            owner?.runId !== current.runId ||
            owner?.associationId !== current.associationId ||
            store.tasks.getTaskThreadByThreadId(claim.taskId, current.threadId)?.id !==
              current.associationId
          )
            return output(
              claim,
              observation,
              "unresolved",
              "The recorded replacement claim and worker could not be verified. No resolution is replayed.",
            );
          return output(
            current,
            observation,
            "replaced",
            "Return the exact recorded replacement. No operation is replayed.",
          );
        });
      }
      refuse(
        "recovery_resolution_conflict",
        "This claim already has a different resolution. Its history is immutable.",
      );
    }
    if (!observation.complete || observation.candidates.length > 1)
      return output(claim, observation);
    // Creating is never made safe by elapsed time or a lease. The original may
    // still complete after a response loss or process restart.
    if (claim.phase === "creating" || claim.phase === "reserved")
      return output(
        claim,
        observation,
        "unresolved",
        "Creation is still active or has no definite outcome. Do not release or replace it.",
      );
    const original = observation.candidates[0];
    if (original && !claim.associationId) {
      const recovered = attach(request, snapshot, observation);
      if (recovered.outcome === "recovered") publish(request);
      return recovered;
    }
    if (observation.reconciliationId !== decision.reconciliationId)
      refuse(
        "recovery_reconciliation_changed",
        "Fresh reconciliation differs from the exact recorded decision. Reconcile and obtain a new decision.",
      );
    const relinquishable = original
      ? await relinquishableWorker(bb, original.id, run.bbProjectId)
      : "confirmed";
    if (relinquishable !== "confirmed")
      return output(
        claim,
        observation,
        "unresolved",
        relinquishable === "unknown"
          ? "Original worker or interruption history is unavailable. Uncertainty cannot authorize replacement."
          : "The active or usable original worker takes precedence. It cannot be replaced.",
      );
    const chosen = decision.associationId
      ? store.tasks.listTaskThreads(request.taskId).find((row) => row.id === decision.associationId)
      : null;
    if (decision.action === "replace") {
      if (!chosen || chosen.threadId === claim.threadId)
        refuse("replacement_invalid", "Select another current task association.");
      if (await workerUsable(bb, chosen.threadId, run.bbProjectId))
        refuse("replacement_invalid", "Replacement worker/project/history could not be verified.");
      const metadata = await bb.sdk.threads.getPluginMetadata({
        threadId: chosen.threadId,
        signal: AbortSignal.timeout(1500),
      });
      if (metadata && Object.hasOwn(metadata, "orchestration"))
        refuse(
          "replacement_invalid",
          "A correlated worker must be recovered in its original claim, not adopted as a replacement.",
        );
    }
    const finalObservation = await observeRecovery(bb, store, claims, claim, run);
    if (!finalObservation.complete || finalObservation.candidates.length > 1)
      return output(claim, finalObservation);
    if (finalObservation.candidates.length === 1 && !claim.associationId) {
      const recovered = attach(request, snapshot, finalObservation);
      if (recovered.outcome === "recovered") publish(request);
      return recovered;
    }
    if (finalObservation.reconciliationId !== decision.reconciliationId)
      refuse(
        "recovery_reconciliation_changed",
        "Final native reconciliation changed. Preserve the original claim and obtain a fresh decision.",
      );
    // Re-read provenance after native worker observations, then commit with no
    // SDK await after the final local state and claim checks.
    if ((await readRecoveryDecision(bb, decision, requestId)) !== decisionReference)
      refuse("recovery_decision_stale", "The recorded decision changed during reconciliation.");
    const resolved = store.transaction(() => {
      fresh(request, snapshot);
      if (claims.live(request.taskId, request.role)?.id !== claim.id)
        refuse("recovery_state_changed", "The live claim changed.");
      if (
        chosen &&
        (store.tasks.getTaskThreadByThreadId(request.taskId, chosen.threadId)?.id !== chosen.id ||
          claims.hasHistoryForThread(chosen.threadId))
      )
        refuse(
          "replacement_invalid",
          "Replacement association changed or already has live orchestration ownership.",
        );
      // Release and replacement are one local transaction. No BB operation occurs.
      const record = {
        version: 1 as const,
        kind: "operator_resolution" as const,
        decisionReference,
        decision,
        observedAt: observation.observedAt,
        previousReason: claim.reason,
        replacementClaimId: null as string | null,
      };
      claims.release(claim.id, JSON.stringify(resolutionRecordSchema.parse(record)));
      let next = claims.get(claim.id)!;
      if (chosen) {
        const newClaim = claims.reserve(request);
        claims.designate({
          taskId: request.taskId,
          role: request.role,
          associationId: chosen.id,
          threadId: chosen.threadId,
          runId: request.runId,
        });
        next = claims.update(newClaim.id, {
          phase: "attached",
          threadId: chosen.threadId,
          associationId: chosen.id,
        });
        record.replacementClaimId = next.id;
        claims.update(claim.id, {
          reason: JSON.stringify(resolutionRecordSchema.parse(record)),
        });
      }
      createSystemComment(store.tasks, {
        taskId: request.taskId,
        threadId: request.coordinatorThreadId,
        presetName: "Orchestration recovery",
        body: `Explicit recorded operator ${decision.action}. Original attempt ${claim.id}; decision ${decisionReference}; reconciliation ${decision.reconciliationId}. ${RECOVERY_WARNING}`,
      });
      return output(
        next,
        observation,
        chosen ? "replaced" : "released",
        "Recorded explicit resolution. All original history is preserved; no BB execution or deletion occurred.",
      );
    });
    publish(request);
    return resolved;
  }
  return {
    reconcile,
    link,
    resolve,
    register() {
      bb.rpc.register(recoveryRpcContract, {
        orchestrateReconcile: reconcile,
        orchestrateLink: link,
        orchestrateResolve: resolve,
      });
    },
  };
}
