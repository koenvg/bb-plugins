import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { TasksAppShell } from "./shell/app-shell.js";
import { TasksSidebarAccessory } from "./shell/sidebar-accessory.js";
import { ticketTab } from "./shell/ticket-panel.js";
import { TaskDirectiveCard, TaskEmbedPanel } from "./views/embed/index.js";
import { TASKS_COMMANDS } from "./shell/commands.js";
import { ThreadHeaderTask } from "./views/thread-header/index.js";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "tasks",
    title: "Tasks",
    icon: "ListTodo",
    path: "tasks",
    component: TasksAppShell,
    fixedTabs: [ticketTab],
    experimental_sidebarAccessory: TasksSidebarAccessory,
  });
  app.slots.threadPanelAction({
    id: "task",
    title: "Task",
    icon: "ListTodo",
    component: TaskEmbedPanel,
  });
  app.slots.experimental_threadHeaderAction({
    id: "task",
    title: "Task",
    component: ThreadHeaderTask,
  });
  app.slots.messageDirective({ id: "task", component: TaskDirectiveCard });
  for (const command of TASKS_COMMANDS) app.commands.register(command);
});
