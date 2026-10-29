import type { Project } from "../shared/contract.js";
import type { StatsTaskInput } from "../shared/task-stats.js";
import { makeTask } from "../test-fixtures.js";

export const statsProjects: Project[] = [
  {
    id: "01HZZZZZZZZZZZZZZZZZZZZZP1",
    name: "Developer tools",
    prefix: "DEV",
    color: "#a89bc8",
    nextTaskNumber: 9,
    folderId: null,
    linkedBbProjectId: null,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "01HZZZZZZZZZZZZZZZZZZZZZP2",
    name: "Website",
    prefix: "WEB",
    color: "#a89bc8",
    nextTaskNumber: 9,
    folderId: null,
    linkedBbProjectId: null,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "01HZZZZZZZZZZZZZZZZZZZZZP3",
    name: "Research and development experiments",
    prefix: "LAB",
    color: "#a89bc8",
    nextTaskNumber: 9,
    folderId: null,
    linkedBbProjectId: null,
    createdAt: "2026-01-01T00:00:00Z",
  },
];

export const statsInputs: StatsTaskInput[] = (
  [
    [0, "Keep keyboard focus when switching between task details", 56, "high"],
    [0, "Keep keyboard focus when switching between task details", 32, "medium"],
    [0, "Make the command palette usable with a keyboard", 16, "urgent"],
    [0, "Keep the project switcher stable while projects load", 8, "low"],
    [1, "Make the account menu usable with a keyboard", 80, "high"],
    [1, "Keep the navigation stable while account details load", 48, "low"],
    [1, "Read the project description before starting work", 24, "medium"],
    [1, "Check the empty state with no tasks", 4, "medium"],
    [2, "Show a useful message when no sample tasks exist", 36, "medium"],
    [2, "Document the startup prompt for the local development environment", 12, "low"],
  ] satisfies Array<[number, string, number, StatsTaskInput["priority"]]>
).map(([projectIndex, title, hours, priority], index) => {
  const project = statsProjects[projectIndex]!;
  return {
    id: `01HZZZZZZZZZZZZZZZZZZZ${String(index).padStart(4, "0")}`,
    key: `${project.prefix}-${index + 1}`,
    title: title,
    projectId: project.id,
    priority: priority,
    status: "done",
    transitions: [
      { id: 1, fromStatus: "todo", toStatus: "in_progress", changedAt: "2026-01-01T00:00:00.000Z" },
      {
        id: 2,
        fromStatus: "in_progress",
        toStatus: "done",
        changedAt: new Date(Date.parse("2026-01-01T00:00:00Z") + hours * 3600000).toISOString(),
      },
    ],
  };
});

export const interruptedInputs: StatsTaskInput[] = [
  {
    ...statsInputs[0]!,
    id: "01HZZZZZZZZZZZZZZZZZZZ0100",
    key: "DEV-11",
    title: "Move task attachments into the detail panel",
    transitions: [
      { id: 1, fromStatus: "todo", toStatus: "in_progress", changedAt: "2026-01-01T00:00:00.000Z" },
      {
        id: 2,
        fromStatus: "in_progress",
        toStatus: "backlog",
        changedAt: "2026-01-02T00:00:00.000Z",
      },
      { id: 3, fromStatus: "backlog", toStatus: "done", changedAt: "2026-01-08T08:00:00.000Z" },
    ],
  },
];

export const canceledInput: StatsTaskInput = {
  ...statsInputs[0]!,
  id: "01HZZZZZZZZZZZZZZZZZZZ0101",
  key: "DEV-12",
  title: "Canceled task",
  status: "canceled",
};

export function statsDetailTasks(inputs = statsInputs) {
  return inputs.map((input, index) =>
    makeTask({
      id: input.id,
      key: input.key,
      title: input.title,
      projectId: input.projectId,
      priority: input.priority,
      number: index + 1,
      description: "Synthetic Stats fixture task.",
      status: input.status,
    }),
  );
}
