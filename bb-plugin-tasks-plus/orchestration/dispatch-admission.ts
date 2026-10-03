import { PluginCliError, type BbPluginApi } from "@get-bb/plugin-sdk";
import type { TasksApiStore } from "../api";
import type { RunController } from "./run";
import type { DispatchStore } from "./dispatch-store";
import { correlationSchema, type DispatchClaim } from "./dispatch-contract";
import {
  createEligibility,
  currentCoordinator,
  workerUsable,
  type HandoffReader,
} from "./dispatch-eligibility";

export function registerDispatchAdmission(
  bb: BbPluginApi,
  store: TasksApiStore,
  runs: RunController,
  claims: DispatchStore,
  handoffs?: HandoffReader,
) {
  const eligible = createEligibility(bb, store, runs, handoffs);
  bb.experimental_hooks.on("message.dispatch", async (context) => {
    let claim: DispatchClaim | null = null;
    const first =
      (context.origin === "plugin" && context.originPluginId === bb.pluginId) ||
      context.queuedMessages.some(
        (row) => row.origin === "plugin" && row.originPluginId === bb.pluginId,
      );
    const hasSender = (threadId: string) =>
      context.senderThreadId === threadId ||
      context.queuedMessages.some((row) => row.senderThreadId === threadId);
    function uniqueClaim(): DispatchClaim | null {
      const candidates = claims.forThread(context.thread.id);
      if (candidates.length > 1)
        throw new Error(
          "Ambiguous orchestration ownership. Resolve the original live claims; no replacement is permitted.",
        );
      return candidates[0] ?? null;
    }
    function originalClaim(): DispatchClaim {
      const current = uniqueClaim();
      if (
        !current ||
        current.id !== claim!.id ||
        current.runId !== claim!.runId ||
        current.taskId !== claim!.taskId ||
        current.role !== claim!.role ||
        current.coordinatorThreadId !== claim!.coordinatorThreadId
      )
        throw new Error("The original live claim changed during admission.");
      if (
        current.phase === "admission_rejected" ||
        current.phase === "reserved"
      )
        throw new Error(
          "The original admission is not authorized; explicit recovery is required.",
        );
      return current;
    }
    function foreignCoordinator(current: DispatchClaim): boolean {
      // Historical coordinators can still have delayed queue rows. Classification
      // uses the original run's epic, not an editable current task parent or latest run.
      const senders = new Set([
        context.senderThreadId,
        ...context.queuedMessages.map((row) => row.senderThreadId),
      ]);
      return [...senders].some(
        (sender) =>
          sender !== null &&
          sender !== current.coordinatorThreadId &&
          runs.isCoordinatorForRunEpic(current.runId, sender),
      );
    }
    function managed(current: DispatchClaim): boolean {
      return (
        first ||
        hasSender(current.coordinatorThreadId) ||
        foreignCoordinator(current) ||
        current.phase !== "attached"
      );
    }
    try {
      claim = uniqueClaim();
      // Creation is unhooked. Metadata is an untrusted lookup key, not authority.
      if (!claim) {
        const metadata = await bb.sdk.threads.getPluginMetadata({
          threadId: context.thread.id,
          signal: AbortSignal.timeout(1500),
        });
        claim = store.transaction(() => {
          // Adoption or another hook can commit while the metadata read is pending.
          const known = uniqueClaim();
          if (known) return known;
          if (!Object.hasOwn(metadata, "orchestration")) return null;
          const parsed = correlationSchema.safeParse(metadata.orchestration);
          if (!parsed.success)
            throw new Error(
              "Invalid orchestration correlation. No authority from editable metadata.",
            );
          const key = parsed.data;
          const candidate = claims.get(key.attemptId);
          if (
            !candidate ||
            candidate.releasedAt ||
            candidate.taskId !== key.taskId ||
            candidate.role !== key.role ||
            candidate.runId !== key.runId ||
            candidate.coordinatorThreadId !== key.coordinatorThreadId ||
            (candidate.threadId && candidate.threadId !== context.thread.id) ||
            context.thread.parentThreadId !== key.coordinatorThreadId ||
            context.thread.projectId !== key.bbProjectId ||
            context.origin !== "plugin" ||
            context.thread.originPluginId !== bb.pluginId
          )
            throw new Error(
              "Correlation does not match a live Tasks claim and native child identity.",
            );
          return claims.update(candidate.id, { threadId: context.thread.id });
        });
        if (!claim) return { action: "proceed" };
      }
      // Accepted independent work does not gain another run's authority.
      const independent = store.transaction(() => !managed(originalClaim()));
      if (independent) return { action: "proceed" };

      // Collect bounded native observations before the final local decision.
      const observedRun = runs.requireActive(
        claim.runId,
        claim.coordinatorThreadId,
      );
      await currentCoordinator(bb, observedRun);
      const reason = await workerUsable(
        bb,
        context.thread.id,
        observedRun.bbProjectId,
      );
      if (reason) throw new Error(reason);

      return store.transaction(() => {
        const current = originalClaim();
        if (foreignCoordinator(current))
          throw new Error(
            "Another coordinator cannot continue an owner bound to its original run. Explicit ownership recovery is required.",
          );
        const { run } = eligible.local(
          current.runId,
          current.coordinatorThreadId,
          current.taskId,
          current.role,
        );
        if (
          context.thread.projectId !== run.bbProjectId ||
          context.thread.deletedAt != null ||
          context.thread.archivedAt != null ||
          context.thread.status === "error" ||
          context.thread.status === "stopping"
        )
          throw new Error(
            "The native owner is unavailable or in another project.",
          );
        if (
          first &&
          (context.thread.parentThreadId !== current.coordinatorThreadId ||
            context.parentThreadId !== current.coordinatorThreadId)
        )
          throw new Error("The queued child parent changed.");
        if (
          !first ||
          current.associationId !== null ||
          current.phase === "attached"
        ) {
          const owner = claims
            .owners(current.taskId)
            .find((owner) => owner.role === current.role);
          const association = store.tasks.getTaskThreadByThreadId(
            current.taskId,
            context.thread.id,
          );
          if (
            !owner ||
            !association ||
            owner.threadId !== context.thread.id ||
            owner.associationId !== association.id ||
            current.associationId !== association.id ||
            owner.runId !== current.runId
          )
            throw new Error(
              "Continuation requires the current explicit owner association.",
            );
        }
        const execution = run.execution.snapshot;
        if (
          context.requestedExecution.providerId !== execution.providerId ||
          context.requestedExecution.model !== execution.modelId ||
          context.requestedExecution.reasoningLevel !==
            execution.reasoningLevel ||
          context.requestedExecution.permissionMode !==
            execution.permissionMode ||
          (context.requestedExecution.serviceTier ?? "default") !==
            (execution.serviceTier ?? "default")
        )
          throw new Error(
            "Queued execution no longer matches the approved preset.",
          );
        // There are no SDK awaits between this Tasks snapshot and proceed.
        return { action: "proceed" as const };
      });
    } catch (error) {
      const message =
        error instanceof PluginCliError || error instanceof Error
          ? error.message
          : "Orchestration admission could not be verified.";
      // Ambiguity cannot select an owner to mutate. Known rejection preserves identity.
      if (claim && claims.get(claim.id)?.releasedAt === null)
        claims.update(claim.id, {
          phase: "admission_rejected",
          reason: message,
        });
      return { action: "reject", message };
    }
  });
}
