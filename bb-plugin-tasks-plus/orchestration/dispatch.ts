import { PluginCliError, type BbPluginApi } from "@get-bb/plugin-sdk";
import type { z } from "zod";
import type { TasksApiStore } from "../api";
import { prepareTaskWorker } from "../delegate";
import type { RunController } from "./run";
import { createWorkerOwnership, result } from "./dispatch-workers";
import { createDispatchStore } from "./dispatch-store";
import {
  correlationSchema,
  dispatchRpcContract,
  type DispatchResult,
  type dispatchInputSchema,
} from "./dispatch-contract";
import { createEligibility, type HandoffReader } from "./dispatch-eligibility";
import { coordinationReader } from "./dispatch-coordination";
import { registerDispatchAdmission } from "./dispatch-admission";

type Input = z.infer<typeof dispatchInputSchema>;
export function createDispatcher(
  bb: BbPluginApi,
  store: TasksApiStore,
  runs: RunController,
  options: { readHandoffs?: HandoffReader } = {},
) {
  const claims = createDispatchStore(bb.storage.database());
  const eligible = createEligibility(bb, store, runs, options.readHandoffs);
  const { selection, existing, attach, adopt } = createWorkerOwnership(
    bb,
    store,
    runs,
    claims,
    eligible,
  );
  async function dispatch(input: Input): Promise<DispatchResult> {
    const initial = await eligible.check(
      input.runId,
      input.coordinatorThreadId,
      input.taskId,
      input.role,
    );
    const selected = store.transaction(() => selection(input));
    if (selected) {
      if (
        selected.claim &&
        ["created", "attachment_failed"].includes(selected.claim.phase) &&
        selected.outcome === "unresolved"
      )
        return attach(input, selected.claim);
      return existing(input, selected);
    }
    const { args: seed } = await prepareTaskWorker(
      bb,
      store.tasks,
      input.taskId,
      initial.run.execution.presetId,
      `Follow the ticket, linked specifications, acceptance criteria and project instructions.\nIntended baseline references: ${JSON.stringify(initial.run.baselineReferences)}.\nPrerequisite handoff references: ${JSON.stringify(initial.handoff.references ?? [])}.\nRun authority does not approve publication, merge, production or scope expansion.`,
      "pending",
    );
    const reserved = store.transaction(() => {
      eligible.local(
        input.runId,
        input.coordinatorThreadId,
        input.taskId,
        input.role,
      );
      const current = selection(input);
      return current ?? claims.reserve(input);
    });
    if ("outcome" in reserved) return existing(input, reserved);
    // Persist creating before the native request. Neither a transport timeout nor
    // a hook rejection proves that BB did not create its cheap pending row.
    claims.update(reserved.id, { phase: "creating" });
    let thread: Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["spawn"]>>;
    try {
      thread = await bb.sdk.threads.spawn({
        ...seed,
        parentThreadId: initial.run.coordinatorThreadId,
        pluginMetadata: {
          orchestration: correlationSchema.parse({
            version: 1,
            attemptId: reserved.id,
            taskId: input.taskId,
            role: input.role,
            runId: initial.run.id,
            coordinatorThreadId: initial.run.coordinatorThreadId,
            bbProjectId: initial.run.bbProjectId,
          }),
        },
        prompt: `${seed.prompt}\nTask/attempt correlation: ${input.taskId} / ${reserved.id}. Parent: ${initial.run.coordinatorThreadId}. Local attachment may still be pending.\n`,
      });
      if (
        thread.projectId !== initial.run.bbProjectId ||
        thread.parentThreadId !== initial.run.coordinatorThreadId
      )
        throw new Error("Returned child context mismatch");
      const current = claims.get(reserved.id)!;
      if (current.threadId && current.threadId !== thread.id)
        throw new Error("More than one child identity observed");
      claims.update(reserved.id, {
        threadId: thread.id,
        ...(current.phase === "admission_rejected"
          ? {}
          : { phase: "created" as const }),
      });
    } catch (error) {
      bb.log.warn(
        `Creation remains unresolved for ${reserved.id}: ${error instanceof Error ? error.message : "unknown native error"}`,
      );
      const current = claims.get(reserved.id)!;
      const failed =
        current.phase === "admission_rejected"
          ? current
          : claims.update(reserved.id, {
              phase: "creation_unknown",
              reason:
                "BB creation is unknown. Keep the claim even if no child is currently observed. Explicit reconciliation is required.",
            });
      return result(
        "unresolved",
        failed.reason ?? "Native admission rejected the original attempt.",
        failed,
      );
    }
    try {
      return await attach(input, claims.get(reserved.id)!);
    } catch (error) {
      const current = claims.get(reserved.id)!;
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
      const failed = claims.update(reserved.id, {
        phase: "attachment_failed",
        reason:
          error instanceof PluginCliError
            ? error.message
            : "Admission changed before local attachment.",
      });
      return result("unresolved", failed.reason!, failed);
    }
  }
  return {
    dispatch,
    adopt,
    claims,
    readCoordination: coordinationReader(
      store,
      runs,
      claims,
      options.readHandoffs,
    ),
    register() {
      bb.rpc.register(dispatchRpcContract, {
        orchestrateDispatch: dispatch,
        orchestrateAdopt: adopt,
      });
      registerDispatchAdmission(bb, store, runs, claims, options.readHandoffs);
    },
  };
}
export type Dispatcher = ReturnType<typeof createDispatcher>;
