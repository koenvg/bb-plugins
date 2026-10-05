import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { TasksApiStore } from "../api";
import {
  STATUS_LIMITS,
  epicStatusSchema,
  unknown,
  type CoordinationReader,
  type EpicStatus,
  type StatusResult,
  type TaskStatusProjection,
} from "./status-contract";
import {
  readStatusSnapshot,
  type NativeSnapshot,
  type NativeTask,
} from "./status-store";
import {
  observedWorker,
  observeWorkers,
  unobservedWorker,
} from "./status-observations";
import {
  cappedList,
  excerpt,
  references,
  removeListItems,
} from "./status-values";

function taskProjection(
  task: NativeTask,
  snapshot: NativeSnapshot,
): TaskStatusProjection {
  const data = snapshot.coordination.tasks?.get(task.id);
  const priorWork =
    task.priorWork ||
    task.status === "in_progress" ||
    task.status === "in_review" ||
    task.status === "done";
  const ownership = data?.ownership ?? {
    state:
      priorWork || task.workerTotal > 0
        ? ("resolution_needed" as const)
        : ("unknown" as const),
    reason:
      priorWork || task.workerTotal > 0
        ? "no_designated_owner"
        : "ownership_extension_unavailable",
    owners: [],
  };
  const attachedOwners = ownership.owners.filter((owner) =>
    task.ownerWorkers.some(
      (worker) =>
        worker.id === owner.associationId && worker.threadId === owner.threadId,
    ),
  );
  const missingOwner = attachedOwners.length !== ownership.owners.length;
  const ownerIds = new Set(attachedOwners.map((owner) => owner.associationId));
  const otherWorkers = task.workers.filter(
    (worker) => !ownerIds.has(worker.id),
  );
  const openBlockerCount = task.dependencies.filter(
    (ref) => ref.status !== "done" && ref.status !== "canceled",
  ).length;
  const latestOutcome = data?.latestOutcome;
  const reportedDecisions = data?.reportedDecisions;
  return {
    id: task.id,
    key: task.key,
    status: task.status,
    title: excerpt(task.title, task.titleLength),
    nativeReadiness: openBlockerCount ? "blocked" : "ready",
    dependencies: task.dependencies,
    openBlockerCount,
    priorWork,
    ownership: missingOwner
      ? {
          state: "resolution_needed",
          reason: "owner_association_missing",
          owners: attachedOwners,
        }
      : ownership,
    owners: task.ownerWorkers.map((worker) =>
      unobservedWorker(worker, "not_observed_yet"),
    ),
    workers: cappedList(
      otherWorkers.map((worker) =>
        unobservedWorker(worker, "not_observed_yet"),
      ),
      STATUS_LIMITS.workersPerTask,
      task.workerTotal - attachedOwners.length,
    ),
    attachments: cappedList(
      task.attachments.map((item) => ({
        id: item.id,
        commentId: item.commentId,
        fileName: excerpt(item.fileName, item.nameLength),
      })),
      STATUS_LIMITS.attachmentsPerTask,
      task.attachmentTotal,
    ),
    nativeDecisions: {
      state: task.workerTotal ? "unknown" : "fresh",
      observedAt: null,
      items: [],
      knownPending: 0,
      omitted: 0,
      unobservedWorkers: task.workerTotal,
    },
    dispatch: data?.dispatch ?? unknown("dispatch_extension_unavailable"),
    latestOutcome:
      latestOutcome?.state === "present"
        ? {
            state: "present",
            value: {
              id: latestOutcome.value.id,
              commentId: latestOutcome.value.commentId,
              threadId: latestOutcome.value.threadId,
              outcome: latestOutcome.value.outcome,
              createdAt: latestOutcome.value.createdAt,
              ...(latestOutcome.value.runId !== undefined
                ? { runId: latestOutcome.value.runId }
                : {}),
              ...(latestOutcome.value.claimId !== undefined
                ? { claimId: latestOutcome.value.claimId }
                : {}),
              ...(latestOutcome.value.associationId !== undefined
                ? { associationId: latestOutcome.value.associationId }
                : {}),
              summary: excerpt(latestOutcome.value.summary),
              resultReferences: references(
                latestOutcome.value.resultReferences,
              ),
              ...(latestOutcome.value.baselineReferences
                ? {
                    baselineReferences: references(
                      latestOutcome.value.baselineReferences,
                    ),
                  }
                : {}),
              ...(latestOutcome.value.delivery
                ? {
                    delivery: {
                      ...latestOutcome.value.delivery,
                      reason: excerpt(latestOutcome.value.delivery.reason),
                    },
                  }
                : {}),
            },
          }
        : (latestOutcome ?? unknown("report_extension_unavailable")),
    reportDeliveries:
      data?.reportDeliveries?.state === "present"
        ? {
            state: "present",
            value: cappedList(
              data.reportDeliveries.value.items.map((item) => ({
                ...item,
                delivery: {
                  ...item.delivery,
                  reason: excerpt(item.delivery.reason),
                },
              })),
              STATUS_LIMITS.resultsPerReport,
              data.reportDeliveries.value.total,
            ),
          }
        : (data?.reportDeliveries ??
          unknown("report_delivery_extension_unavailable")),
    handoff: openBlockerCount
      ? { state: "blocked", reason: "native_dependencies_open" }
      : (data?.handoff ??
        (task.dependencies.length
          ? {
              state: "unknown",
              reason: task.dependencies.some((ref) => ref.status === "canceled")
                ? "canceled_prerequisite_requires_handoff_decision"
                : "prerequisite_reports_unavailable",
            }
          : { state: "not_required", reason: "no_native_prerequisites" })),
    reportedDecisions:
      reportedDecisions?.state === "present"
        ? {
            state: "present",
            value: cappedList(
              reportedDecisions.value.map((item) => ({
                ...item,
                question: excerpt(item.question),
              })),
              STATUS_LIMITS.decisionsPerWorker,
              data?.reportedDecisionTotal,
            ),
          }
        : (reportedDecisions ??
          unknown("decision_report_extension_unavailable")),
  };
}
function project(snapshot: NativeSnapshot): EpicStatus {
  const subtasks = snapshot.subtasks.map((task) =>
    taskProjection(task, snapshot),
  );
  const run = snapshot.coordination.run;
  const acceptance = snapshot.coordination.acceptance;
  return {
    generatedAt: new Date().toISOString(),
    tasksObservedAt: snapshot.tasksObservedAt,
    consistency: "tasks_snapshot_external_observations",
    limits: STATUS_LIMITS,
    auxiliaryReduced: false,
    external: { observedWorkers: 0, omittedWorkers: 0 },
    epic: taskProjection(snapshot.epic, snapshot),
    subtasks,
    totals: {
      subtasks: subtasks.length,
      done: subtasks.filter((t) => t.status === "done").length,
      canceled: subtasks.filter((t) => t.status === "canceled").length,
      nativeReady: subtasks.filter((t) => t.nativeReadiness === "ready").length,
      nativeBlocked: subtasks.filter((t) => t.nativeReadiness === "blocked")
        .length,
    },
    run:
      run?.state === "present"
        ? {
            state: "present",
            value: {
              ...run.value,
              baselineReferences: references(run.value.baselineReferences),
            },
          }
        : (run ?? unknown("run_extension_unavailable")),
    acceptance:
      acceptance?.state === "present"
        ? {
            state: "present",
            value: {
              ...acceptance.value,
              baselineReferences: references(
                acceptance.value.baselineReferences,
              ),
              evidenceReferences: references(
                acceptance.value.evidenceReferences,
              ),
            },
          }
        : (acceptance ?? unknown("acceptance_extension_unavailable")),
  };
}
function reduceAuxiliary(status: EpicStatus) {
  status.auxiliaryReduced = true;
  for (const task of [status.epic, ...status.subtasks]) {
    task.title = excerpt("", task.title.totalCharacters, 0);
    task.nativeDecisions.items = [];
    task.nativeDecisions.omitted = task.nativeDecisions.knownPending;
    removeListItems(task.workers);
    removeListItems(task.attachments);
    for (const worker of task.owners) {
      worker.decisions.items = [];
      worker.decisions.omitted = worker.decisions.total;
    }
    if (task.latestOutcome.state === "present") {
      task.latestOutcome.value.summary = excerpt(
        "",
        task.latestOutcome.value.summary.totalCharacters,
        0,
      );
      removeListItems(task.latestOutcome.value.resultReferences);
      if (task.latestOutcome.value.baselineReferences)
        removeListItems(task.latestOutcome.value.baselineReferences);
      if (task.latestOutcome.value.delivery)
        task.latestOutcome.value.delivery.reason = excerpt(
          "",
          task.latestOutcome.value.delivery.reason.totalCharacters,
          0,
        );
    }
    if (task.reportDeliveries?.state === "present")
      removeListItems(task.reportDeliveries.value);
    if (task.reportedDecisions.state === "present")
      removeListItems(task.reportedDecisions.value);
  }
  if (status.run.state === "present")
    removeListItems(status.run.value.baselineReferences);
  if (status.acceptance.state === "present") {
    removeListItems(status.acceptance.value.baselineReferences);
    removeListItems(status.acceptance.value.evidenceReferences);
  }
}
function bytes(status: EpicStatus) {
  return Buffer.byteLength(JSON.stringify({ ok: true, status }), "utf8");
}
function sizeFailure(
  snapshot: NativeSnapshot,
  requiredBytes: number,
): StatusResult {
  return {
    ok: false,
    error: {
      code: "epic_status_size_limit",
      message:
        "Required epic state exceeds 128 KiB. No partial frontier is returned.",
      counts: snapshot.counts,
      requiredBytes,
    },
  };
}
function validExtension(status: EpicStatus): boolean {
  // Extensions cannot contradict native association identity or smuggle an
  // unrelated question into this worker/task. Missing associations are exposed
  // as unresolved ownership, not accepted as active primary workers.
  for (const task of [status.epic, ...status.subtasks]) {
    const roles = task.ownership.owners.map((owner) => owner.role);
    const associationIds = task.ownership.owners.map(
      (owner) => owner.associationId,
    );
    if (
      new Set(roles).size !== roles.length ||
      new Set(associationIds).size !== associationIds.length ||
      (task.ownership.state === "known" && roles.length === 0)
    )
      return false;
    if (
      task.reportedDecisions.state === "present" &&
      task.reportedDecisions.value.items.some((item) => item.taskId !== task.id)
    )
      return false;
  }
  const run = status.run;
  if (
    run.state === "present" &&
    new Set(run.value.approvedTaskIds).size !== run.value.approvedTaskIds.length
  )
    return false;
  return epicStatusSchema.safeParse(status).success;
}
export async function readEpicStatus(
  bb: BbPluginApi,
  store: TasksApiStore,
  epicId: string,
  readCoordination?: CoordinationReader,
): Promise<StatusResult> {
  const result = readStatusSnapshot(
    bb.storage.database(),
    store,
    epicId,
    readCoordination,
  );
  if (!result.ok) return result;
  const snapshot = result.snapshot;
  const status = project(snapshot);
  if (!validExtension(status))
    return {
      ok: false,
      error: {
        code: "epic_status_extension_invalid",
        message:
          "Tasks coordination extension returned invalid required state.",
      },
    };
  // Preflight the minimum required response before spending external lookups.
  const required = structuredClone(status);
  reduceAuxiliary(required);
  if (bytes(required) > STATUS_LIMITS.bytes)
    return sizeFailure(snapshot, bytes(required));
  const nativeTasks = [snapshot.epic, ...snapshot.subtasks];
  const candidates = [
    ...nativeTasks.flatMap((task) => task.ownerWorkers),
    ...nativeTasks.flatMap((task) => task.workers),
  ];
  const observations = await observeWorkers(bb, candidates);
  status.external = {
    observedWorkers: observations.size,
    omittedWorkers:
      new Set(candidates.map((worker) => worker.threadId)).size -
      observations.size,
  };
  for (const task of [status.epic, ...status.subtasks]) {
    const native = nativeTasks.find((item) => item.id === task.id)!;
    task.owners = native.ownerWorkers.map((worker) =>
      observedWorker(worker, observations),
    );
    task.workers.items = task.workers.items.map((worker) =>
      observedWorker(
        native.workers.find((item) => item.id === worker.associationId)!,
        observations,
      ),
    );
    const selected = [
      ...new Map(
        [...native.ownerWorkers, ...native.workers].map((worker) => [
          worker.id,
          worker,
        ]),
      ).values(),
    ].map((worker) => observedWorker(worker, observations));
    const known = selected.filter(
      (worker) => worker.decisions.state === "fresh",
    );
    const unobservedWorkers = native.workerTotal - known.length;
    const knownPending = known.reduce(
      (sum, worker) => sum + worker.decisions.total!,
      0,
    );
    const items = known
      .flatMap((worker) => worker.decisions.items)
      .slice(0, STATUS_LIMITS.decisionsPerWorker);
    task.nativeDecisions = {
      state: unobservedWorkers
        ? known.length
          ? "partial"
          : "unknown"
        : "fresh",
      observedAt:
        known
          .map((worker) => worker.decisions.observedAt!)
          .sort()
          .at(-1) ?? null,
      items,
      knownPending,
      omitted: knownPending - items.length,
      unobservedWorkers,
    };
  }
  status.generatedAt = new Date().toISOString();
  if (bytes(status) > STATUS_LIMITS.bytes) reduceAuxiliary(status);
  if (bytes(status) > STATUS_LIMITS.bytes)
    return sizeFailure(snapshot, bytes(status));
  return { ok: true, status };
}
