import type { PluginCommandRegistration } from "@get-bb/plugin-sdk/app";
import {
  canRunTasksCommand,
  openTasksPanel,
  sendPanelIntent,
} from "./command-bridge.js";

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
];
