import { createHash } from "node:crypto";
import type { TasksStore, Task } from "../db";
import {
  RUN_LIMITS,
  proposalSchema,
  type ApprovedRun,
  type RunConfig,
  type RunProposal,
} from "./run-contract";
import { refuse } from "./run-provenance";

export function fingerprint(value: unknown): string {
  const canonical = (input: unknown): unknown =>
    Array.isArray(input)
      ? input.map(canonical)
      : input !== null && typeof input === "object"
        ? Object.fromEntries(
            Object.entries(input)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, child]) => [key, canonical(child)]),
          )
        : input;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
function taskFingerprint(task: Task): string {
  // Status, dependencies, comments and reported artifacts are not tracker scope.
  return fingerprint([
    task.id,
    task.projectId,
    task.parentTaskId,
    task.title,
    task.description,
  ]);
}
export function configFromRun(run: ApprovedRun): RunConfig {
  return {
    epic: run.epicId,
    tasks: run.approvedTaskIds,
    preset: run.execution.presetId,
    baselineReferences: run.baselineReferences,
  };
}
export function previewRun(
  tasks: TasksStore,
  coordinator: string,
  config: RunConfig,
  bbProjectId: string,
) {
  const getTask = (ref: string) =>
    tasks.getTask(ref) ?? tasks.getTaskByKey(ref.toUpperCase());
  const epic = getTask(config.epic);
  if (!epic || epic.parentTaskId !== null)
    refuse("epic_invalid", "Select an existing top-level epic.");
  const project = tasks.getProject(epic.projectId);
  if (!project || project.linkedBbProjectId !== bbProjectId)
    refuse(
      "project_mismatch",
      "The epic must belong to the coordinator's linked BB project.",
    );
  const selected = config.tasks
    .map((ref) => {
      const task = getTask(ref);
      if (
        !task ||
        task.projectId !== epic.projectId ||
        task.parentTaskId !== epic.id
      )
        refuse(
          "scope_invalid",
          "Approve only existing direct subtasks of this epic.",
        );
      return task;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(selected.map((task) => task.id)).size !== selected.length)
    refuse("scope_invalid", "Subtask selection contains duplicates.");
  if (
    new Set(config.baselineReferences).size !== config.baselineReferences.length
  )
    refuse("baseline_invalid", "Baseline references contain duplicates.");
  const preset =
    tasks.getPreset(config.preset) ??
    tasks
      .listPresets()
      .find((p) => p.name.toLowerCase() === config.preset.toLowerCase());
  if (!preset)
    refuse("execution_invalid", "Select an existing execution preset.");
  const snapshot = {
    providerId: preset.providerId,
    modelId: preset.modelId,
    reasoningLevel: preset.reasoningLevel,
    serviceTier: preset.serviceTier,
    permissionMode: preset.permissionMode,
    environmentKind: preset.environmentKind,
    baseBranch: preset.baseBranch,
    machineId: preset.machineId,
    instructions: preset.instructions,
  };
  const proposal = proposalSchema.parse({
    epicId: epic.id,
    projectId: project.id,
    bbProjectId,
    coordinatorThreadId: coordinator,
    approvedTaskIds: selected.map((task) => task.id),
    fingerprints: Object.fromEntries(
      [epic, ...selected].map((task) => [task.id, taskFingerprint(task)]),
    ),
    execution: {
      presetId: preset.id,
      fingerprint: fingerprint(snapshot),
      snapshot,
    },
    baselineReferences: config.baselineReferences,
  });
  const summary = [epic, ...selected]
    .map((task) => `${task.key} · ${task.title}\n${task.description}`)
    .join("\n\n");
  if (
    Buffer.byteLength(JSON.stringify({ proposal, summary }), "utf8") >
    RUN_LIMITS.approvalBytes
  )
    refuse(
      "approval_size_limit",
      "The complete approval exceeds 48 KiB. Reduce selected scope; no partial approval is permitted.",
    );
  return { proposal, summary };
}
export function assertCurrentScope(tasks: TasksStore, run: ApprovedRun): void {
  const { proposal } = previewRun(
    tasks,
    run.coordinatorThreadId,
    configFromRun(run),
    run.bbProjectId,
  );
  const expected: RunProposal = {
    epicId: run.epicId,
    projectId: run.projectId,
    bbProjectId: run.bbProjectId,
    coordinatorThreadId: run.coordinatorThreadId,
    approvedTaskIds: run.approvedTaskIds,
    fingerprints: run.fingerprints,
    execution: run.execution,
    baselineReferences: run.baselineReferences,
  };
  if (fingerprint(proposal) !== fingerprint(expected))
    refuse(
      "scope_changed",
      "Tracker scope or execution selection changed. Explicit resume approval is required before further work.",
    );
}
