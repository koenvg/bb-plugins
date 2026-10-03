import type { TasksApiStore } from "../api";
import type { RunController } from "./run";
import { assertCurrentScope } from "./run-scope";
import type { DispatchStore } from "./dispatch-store";
import type {
  CoordinationReader,
  TaskCoordinationData,
} from "./status-contract";
import { nativeHandoff, type HandoffReader } from "./dispatch-eligibility";

export function coordinationReader(
  store: TasksApiStore,
  runs: RunController,
  claims: DispatchStore,
  handoffs?: HandoffReader,
): CoordinationReader {
  return (epicId, taskIds) => {
    const run = runs.readRun(epicId);
    let scopeState: "current" | "changed" | "unknown" = "unknown";
    if (run) {
      try {
        assertCurrentScope(store.tasks, run);
        scopeState = "current";
      } catch {
        scopeState = "changed";
      }
    }
    const tasks = new Map<string, TaskCoordinationData>();
    for (const taskId of taskIds) {
      const owners = claims.owners(taskId);
      const attempts = claims.claims(taskId);
      const ownership = owners.length
        ? {
            state: "known" as const,
            reason:
              "Tasks-designated primary owners. Native association and activity remain separate.",
            owners,
          }
        : attempts.length
          ? {
              state: "resolution_needed" as const,
              reason:
                "A durable claim exists without an attached primary owner.",
              owners: [],
            }
          : {
              state: "unknown" as const,
              reason:
                "No designated primary owner. Legacy attachments and prior work require resolution.",
              owners: [],
            };
      const handoff = run
        ? (handoffs?.(taskId, run) ?? nativeHandoff(store, taskId))
        : {
            state: "unknown" as const,
            reason: "No run-specific handoff context.",
          };
      tasks.set(taskId, {
        ownership: {
          ...ownership,
          owners: ownership.owners.map(({ associationId, threadId, role }) => ({
            associationId,
            threadId,
            role,
          })),
        },
        dispatch: attempts.length
          ? {
              state: "present",
              value: attempts
                .filter((claim) => claim.phase !== "attached")
                .map(({ id, runId, role, phase, threadId }) => ({
                  id,
                  runId,
                  role,
                  phase,
                  threadId,
                })),
            }
          : { state: "absent" },
        handoff: { state: handoff.state, reason: handoff.reason },
        // Reports, reported decisions and epic acceptance stay unknown until their slices exist.
      });
    }
    return {
      tasks,
      run: run
        ? {
            state: "present",
            value: {
              id: run.id,
              phase: run.phase,
              coordinatorThreadId: run.coordinatorThreadId,
              approvedTaskIds: run.approvedTaskIds,
              scopeState,
              baselineReferences: run.baselineReferences,
            },
          }
        : { state: "absent" },
    };
  };
}
