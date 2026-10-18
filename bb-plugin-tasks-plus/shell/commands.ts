import type { PluginCommandRegistration } from "@get-bb/plugin-sdk/app";
import { canRunTasksCommand, openTasksPanel, sendPanelIntent } from "./command-bridge.js";
import {
  canRunTaskDetailAction,
  runTaskDetailAction,
  type TaskDetailAction,
} from "./task-detail-commands.js";

export const TASK_DETAIL_COMMANDS = [
  { id: "task-change-status", title: "Tasks: Change status", action: "status" },
  { id: "task-set-priority", title: "Tasks: Set priority", action: "priority" },
  { id: "task-set-due-date", title: "Tasks: Set due date", action: "dueDate" },
  { id: "task-edit-labels", title: "Tasks: Edit labels", action: "labels" },
  {
    id: "task-change-linked-bb-project",
    title: "Tasks: Change linked BB project",
    action: "linkedProject",
  },
  { id: "task-dispatch", title: "Tasks: Dispatch task...", action: "dispatch" },
  { id: "task-previous", title: "Tasks: Previous task", action: "previous" },
  { id: "task-next", title: "Tasks: Next task", action: "next" },
  { id: "task-back", title: "Tasks: Back", action: "back" },
] as const satisfies readonly { id: string; title: string; action: TaskDetailAction }[];

export const TASKS_COMMANDS: readonly PluginCommandRegistration[] = [
  {
    id: "new-task",
    title: "Tasks: New task",
    isAvailable: canRunTasksCommand,
    run: () => sendPanelIntent("new-task"),
  },
  {
    id: "go-all",
    title: "Tasks: Go to All tasks",
    isAvailable: canRunTasksCommand,
    run: () => openTasksPanel("all"),
  },
  {
    id: "go-active",
    title: "Tasks: Go to Active tasks",
    isAvailable: canRunTasksCommand,
    run: () => openTasksPanel("active"),
  },
  {
    id: "go-manage",
    title: "Tasks: Go to Manage",
    isAvailable: canRunTasksCommand,
    run: () => openTasksPanel("manage"),
  },
  {
    id: "show-shortcuts",
    title: "Tasks: Show keyboard shortcuts",
    isAvailable: canRunTasksCommand,
    run: () => sendPanelIntent("help"),
  },
  {
    id: "switch-project",
    title: "Tasks: Switch project",
    isAvailable: canRunTasksCommand,
    run: () => sendPanelIntent("switch-project"),
  },
  ...TASK_DETAIL_COMMANDS.map(({ id, title, action }) => ({
    id,
    title,
    isAvailable: () => canRunTaskDetailAction(action),
    run: () => runTaskDetailAction(action),
  })),
];
