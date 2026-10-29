import {
  TASK_PRIORITIES,
  type StatsDurationRow,
  type StatsMeasures,
  type TaskStats,
} from "./contract.js";
import type { TaskPriority, TaskStatus } from "./contract.js";
import {
  calculateTaskDuration,
  type TaskDurationResult,
  type TaskDurationTransition,
} from "./task-duration.js";

export interface StatsTaskInput {
  id: string;
  key: string;
  title: string;
  projectId: string;
  priority: TaskPriority;
  status: TaskStatus;
  transitions: readonly TaskDurationTransition[];
}

export interface StatsProject {
  id: string;
  name: string;
  color: string;
}

type EligibleDuration = Extract<TaskDurationResult, { statisticsEligible: true }>;
interface EligibleTask {
  task: StatsTaskInput;
  duration: EligibleDuration;
}

function measures(values: number[]): StatsMeasures {
  if (values.length === 0) return { count: 0, medianMs: null, averageMs: null };
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return {
    count: values.length,
    medianMs: values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2,
    averageMs: values.reduce((total, value) => total + value, 0) / values.length,
  };
}

function durationRow(task: StatsTaskInput, milliseconds: number): StatsDurationRow {
  const { id, key, title, projectId, priority } = task;
  return { id, key, title, projectId, priority, milliseconds };
}

function rank(a: StatsDurationRow, b: StatsDurationRow): number {
  return b.milliseconds - a.milliseconds || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function aggregateTaskStats(
  tasks: readonly StatsTaskInput[],
  projects: readonly StatsProject[],
  includeInterrupted = false,
): TaskStats {
  const eligible: EligibleTask[] = [];
  const interrupted: StatsDurationRow[] = [];
  let canceledCount = 0;
  let unavailableCompletedCount = 0;
  for (const task of tasks) {
    const duration = calculateTaskDuration(task);
    if (duration.statisticsEligible) eligible.push({ task, duration });
    else if (duration.kind === "completed")
      interrupted.push(durationRow(task, duration.milliseconds));
    else if (duration.kind === "excluded") canceledCount++;
    else if (duration.kind === "unavailable" && task.status === "done") unavailableCompletedCount++;
  }
  const byProject = new Map<string, number[]>();
  const byPriority = new Map<TaskPriority, number[]>();
  for (const { task, duration } of eligible) {
    const projectValues = byProject.get(task.projectId) ?? [];
    projectValues.push(duration.milliseconds);
    byProject.set(task.projectId, projectValues);
    const priorityValues = byPriority.get(task.priority) ?? [];
    priorityValues.push(duration.milliseconds);
    byPriority.set(task.priority, priorityValues);
  }
  return {
    summary: measures(eligible.map(({ duration }) => duration.milliseconds)),
    byProject: projects.map(({ id, name, color }) => ({
      id,
      name,
      color,
      ...measures(byProject.get(id) ?? []),
    })),
    byPriority: TASK_PRIORITIES.map((priority) => ({
      priority,
      ...measures(byPriority.get(priority) ?? []),
    })),
    slowest: eligible
      .map(({ task, duration }) => durationRow(task, duration.milliseconds))
      .sort(rank)
      .slice(0, 5),
    interrupted: {
      count: interrupted.length,
      ...(includeInterrupted ? { tasks: interrupted.sort(rank) } : {}),
    },
    canceledCount,
    unavailableCompletedCount,
  };
}
