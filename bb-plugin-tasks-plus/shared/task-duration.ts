import type { TaskStatus } from "./contract.js";

export interface TaskDurationTransition {
  id: number;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  changedAt: string;
}

export interface TaskDurationInput {
  status: TaskStatus;
  transitions: readonly TaskDurationTransition[];
}

export type TaskDurationResult =
  | ({
      kind: "completed";
      startedAt: string;
      completedAt: string;
      milliseconds: number;
    } & (
      | { interrupted: false; statisticsEligible: true }
      | { interrupted: true; statisticsEligible: false }
    ))
  | {
      kind: "unfinished";
      startedAt: string;
      interrupted: boolean;
      statisticsEligible: false;
    }
  | {
      kind: "excluded";
      reason: "canceled";
      interrupted: boolean;
      statisticsEligible: false;
    }
  | {
      kind: "unavailable";
      reason: "missing-start" | "missing-completion" | "invalid-timestamp";
      interrupted: boolean;
      statisticsEligible: false;
    };

/** Uses the first recorded start, not an inferred pre-migration lifetime. */
export function calculateTaskDuration({
  status,
  transitions,
}: TaskDurationInput): TaskDurationResult {
  let start: TaskDurationTransition | undefined;
  let completion: TaskDurationTransition | undefined;
  let interrupted = false;
  for (const transition of transitions) {
    if (!start && transition.toStatus === "in_progress") start = transition;
    if (!start) continue;
    if (transition.toStatus === "todo" || transition.toStatus === "backlog") interrupted = true;
    if (transition.toStatus === "done") completion = transition;
  }

  if (status === "canceled") {
    return { kind: "excluded", reason: "canceled", interrupted, statisticsEligible: false };
  }
  const firstStatus = transitions[0]?.fromStatus;
  if (
    !start ||
    firstStatus === "in_progress" ||
    firstStatus === "in_review" ||
    firstStatus === "done"
  ) {
    return { kind: "unavailable", reason: "missing-start", interrupted, statisticsEligible: false };
  }
  const startedAt = start.changedAt;
  const startTime = Date.parse(startedAt);
  if (!Number.isFinite(startTime)) {
    return {
      kind: "unavailable",
      reason: "invalid-timestamp",
      interrupted,
      statisticsEligible: false,
    };
  }
  if (status !== "done") {
    return { kind: "unfinished", startedAt, interrupted, statisticsEligible: false };
  }
  if (!completion || transitions.at(-1)?.toStatus !== "done") {
    return {
      kind: "unavailable",
      reason: "missing-completion",
      interrupted,
      statisticsEligible: false,
    };
  }
  const completedAt = completion.changedAt;
  const milliseconds = Date.parse(completedAt) - startTime;
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return {
      kind: "unavailable",
      reason: "invalid-timestamp",
      interrupted,
      statisticsEligible: false,
    };
  }
  return {
    kind: "completed",
    startedAt,
    completedAt,
    milliseconds,
    ...(interrupted
      ? { interrupted: true, statisticsEligible: false }
      : { interrupted: false, statisticsEligible: true }),
  };
}
