import { randomUUID } from "node:crypto";
import { PluginCliError, type BbPluginApi } from "@get-bb/plugin-sdk";
import type { TasksApiStore } from "../api";
import {
  RUN_LIMITS,
  approvalSchema,
  runConfigSchema,
  runRpcContract,
  type ApprovedRun,
  type RunConfig,
  type Invocation,
  type RunResult,
} from "./run-contract";
import { readInvocation, refuse } from "./run-provenance";
import {
  assertCurrentScope,
  configFromRun,
  fingerprint,
  previewRun,
} from "./run-scope";
import { createRunStore, type RunRequest } from "./run-store";

export function createRunController(bb: BbPluginApi, store: TasksApiStore) {
  const runs = createRunStore(bb.storage.database());
  const generation = randomUUID();
  const completions = new Map<string, Promise<void>>();
  const submitted = new Set<string>();
  const view = (run: ApprovedRun): ApprovedRun =>
    run.phase === "active" && run.generation !== generation
      ? { ...run, phase: "interrupted" }
      : run;
  const requireRun = (id: string, coordinator: string) => {
    const run = runs.getRun(id);
    if (!run || run.coordinatorThreadId !== coordinator)
      refuse(
        "run_context_invalid",
        "The run belongs to another coordinator or does not exist.",
      );
    return run;
  };
  const existingResult = (request: RunRequest): RunResult => {
    if (request.phase === "run" && request.runId)
      return {
        outcome: "run",
        run: view(requireRun(request.runId, request.coordinator)),
      };
    return {
      outcome:
        request.phase === "cancelled"
          ? "cancelled"
          : request.generation === generation
            ? "pending"
            : "interrupted",
      invocationReference: request.key,
      ...(request.error ? { error: request.error } : {}),
    };
  };

  // A native form belongs to the plugin, not to the short-lived CLI process.
  // Return pending immediately. The durable request is also the completion lookup.
  async function settleDecision(
    request: RunRequest,
    source: Awaited<ReturnType<typeof readInvocation>>,
    config: Partial<RunConfig>,
    initial: ReturnType<typeof previewRun> | null,
    prior: ApprovedRun | null,
  ) {
    const coordinator = request.coordinator;
    try {
      const payload = {
        invocationReference: source.key,
        decisionId: request.decisionId,
        action: request.action,
        config,
        initial,
      };
      if (
        Buffer.byteLength(JSON.stringify(payload), "utf8") > RUN_LIMITS.approvalBytes
      )
        refuse(
          "approval_size_limit",
          "The complete native form exceeds 48 KiB. Reduce selected scope; no partial approval is permitted.",
        );
      const result = await bb.ui.requestInput({
        threadId: coordinator,
        rendererId: "orchestrator-run",
        title:
          request.action === "begin"
            ? "Approve orchestration run"
            : "Resume orchestration run",
        payload,
        describeSubmission(value) {
          return {
            title: "Recorded orchestration decision",
            payload: {
              invocationReference: source.key,
              decisionId: request.decisionId,
              approval: value,
            },
          };
        },
      });
      if (result.outcome !== "submitted") {
        runs.finish({ ...request, phase: "cancelled" });
        return;
      }
      submitted.add(request.key);
      const approval = approvalSchema.parse(result.value);
      const events = await bb.sdk.threads.events.list({
        threadId: coordinator,
        types: ["system/interaction/lifecycle"],
        order: "desc",
        limit: "100",
      });
      const decision = events.find((event) => {
        if (
          event.type !== "system/interaction/lifecycle" ||
          event.threadId !== coordinator
        )
          return false;
        const interaction = event.data.interaction;
        if (
          interaction.status !== "resolved" ||
          interaction.origin.kind !== "plugin" ||
          interaction.origin.pluginId !== bb.pluginId ||
          interaction.origin.rendererId !== "orchestrator-run" ||
          !interaction.resolution ||
          !("kind" in interaction.resolution) ||
          interaction.resolution.kind !== "plugin_submitted"
        )
          return false;
        return (
          fingerprint(interaction.resolution.description?.payload) ===
          fingerprint({
            invocationReference: source.key,
            decisionId: request.decisionId,
            approval: result.value,
          })
        );
      });
      if (!decision)
        refuse(
          "decision_unverified",
          "The explicit native decision could not be found in persisted BB history.",
        );
      const fresh = await readInvocation(bb, coordinator, source.requestId);
      if (fresh.key !== source.key)
        refuse(
          "stale_invocation",
          "A newer invocation replaced the pending run decision.",
        );
      if (fresh.bbProjectId !== source.bbProjectId)
        refuse(
          "project_mismatch",
          "The coordinator changed BB project while approval was pending.",
        );
      runs.transaction(() => {
        const approved = approval.proposal;
        if (
          approved.coordinatorThreadId !== coordinator ||
          approved.bbProjectId !== source.bbProjectId
        )
          refuse(
            "decision_mismatch",
            "Approval belongs to a different coordinator/project.",
          );
        const current = previewRun(
          store.tasks,
          coordinator,
          {
            epic: approved.epicId,
            tasks: approved.approvedTaskIds,
            preset: approved.execution.presetId,
            baselineReferences: approved.baselineReferences,
          },
          source.bbProjectId,
        ).proposal;
        if (fingerprint(current) !== fingerprint(approved))
          refuse(
            "scope_changed",
            "Scope or execution changed while approval was pending. Invoke again for a new decision.",
          );
        if (initial && fingerprint(initial.proposal) !== fingerprint(approved))
          refuse(
            "decision_mismatch",
            "The decision changed the proposed scope or selection. Invoke again with the intended parameters.",
          );
        if (
          prior &&
          (approved.epicId !== prior.epicId ||
            fingerprint(approved.approvedTaskIds) !==
              fingerprint(prior.approvedTaskIds) ||
            fingerprint(approved.baselineReferences) !==
              fingerprint(prior.baselineReferences) ||
            approved.execution.presetId !== prior.execution.presetId)
        )
          refuse(
            "scope_expansion",
            "Resume cannot add tasks or change execution/baseline selection. Separate scope approval is required.",
          );
        const now = new Date().toISOString();
        const run = runs.save({
          ...approved,
          id: prior?.id ?? runs.newId(),
          invocationReference: prior?.invocationReference ?? source.key,
          approvalReference: `${coordinator}:${decision.id}:${decision.seq}`,
          phase: "active",
          generation,
          createdAt: prior?.createdAt ?? now,
          updatedAt: now,
        });
        runs.finish({ ...request, phase: "run", runId: run.id });
      });
    } catch (error) {
      const failure =
        error instanceof PluginCliError
          ? { code: error.code, message: error.message }
          : {
              code: "decision_invalid",
              message:
                "The native decision could not be verified. Use a new explicit invocation.",
            };
      runs.finish({ ...request, phase: "cancelled", error: failure });
    } finally {
      submitted.delete(request.key);
    }
  }

  async function control(
    action: Invocation["action"],
    input: { coordinatorThreadId: string; requestId: string },
  ): Promise<RunResult> {
    const coordinator = input.coordinatorThreadId;
    const source = await readInvocation(
      bb,
      coordinator,
      input.requestId,
      (key) => runs.getRequest(key) !== null,
    );
    if (source.invocation.action !== action)
      refuse(
        "decision_mismatch",
        "The persisted invocation names a different run-control action.",
      );
    const existing = runs.getRequest(source.key);
    if (existing) {
      if (existing.phase === "pending" && submitted.has(source.key)) {
        await completions.get(source.key);
      }
      return existingResult(runs.getRequest(source.key) ?? existing);
    }
    const invocation = source.invocation;
    const prior =
      invocation.action === "begin"
        ? null
        : requireRun(invocation.runId, coordinator);
    if (prior && prior.bbProjectId !== source.bbProjectId)
      refuse(
        "project_mismatch",
        "The run and coordinator project no longer match.",
      );
    const config =
      invocation.action === "begin"
        ? (invocation.config ?? {})
        : configFromRun(prior!);
    const complete = runConfigSchema.safeParse(config);
    const initial =
      action === "pause" || !complete.success
        ? null
        : previewRun(
            store.tasks,
            coordinator,
            complete.data,
            source.bbProjectId,
          );
    const request: RunRequest = {
      key: source.key,
      coordinator,
      action,
      decisionId: randomUUID(),
      generation,
      phase: "pending",
      runId: prior?.id ?? null,
    };
    if (!runs.reserve(request))
      return existingResult(runs.getRequest(source.key)!);
    if (action === "pause" && prior) {
      return runs.transaction(() => {
        const run = runs.save({
          ...prior,
          phase: "paused",
          updatedAt: new Date().toISOString(),
        });
        runs.finish({ ...request, phase: "run", runId: run.id });
        return { outcome: "run", run };
      });
    }
    const completion = settleDecision(
      request,
      source,
      config,
      initial,
      prior,
    ).catch(() =>
      bb.log.error(
        "Could not record the orchestration decision. The request remains non-authoritative.",
      ),
    );
    completions.set(request.key, completion);
    void completion.then(() => completions.delete(request.key));
    return { outcome: "pending", invocationReference: request.key };
  }
  return {
    control,
    isCoordinatorForRunEpic: runs.isCoordinatorForRunEpic,
    readRun(epicId: string) {
      const run = runs.latestForEpic(epicId);
      return run ? view(run) : null;
    },
    requireActive(runId: string, coordinator: string): ApprovedRun {
      const run = view(requireRun(runId, coordinator));
      if (run.phase !== "active")
        refuse(
          "run_inactive",
          "Pause or interruption prevents dispatch/continuation. Explicit resume is required.",
        );
      assertCurrentScope(store.tasks, run);
      return run;
    },
    register() {
      bb.rpc.register(runRpcContract, {
        orchestrateBegin: (input) => control("begin", input),
        orchestratePause: (input) => control("pause", input),
        orchestrateResume: (input) => control("resume", input),
        async orchestratePreview(input) {
          const thread = await bb.sdk.threads.get({
            threadId: input.coordinatorThreadId,
          });
          return previewRun(
            store.tasks,
            input.coordinatorThreadId,
            input.config,
            thread.projectId,
          );
        },
      });
    },
  };
}
export type RunController = ReturnType<typeof createRunController>;
