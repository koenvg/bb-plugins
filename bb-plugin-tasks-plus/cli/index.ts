import { defineCli, type BbPluginApi } from "@get-bb/plugin-sdk";

import { registerHandlers, type TasksApiStore } from "../api";
import { attachmentCommands } from "./attachments";
import type { PluginStatus } from "./common";
import { delegationCommands } from "./delegation";
import { labelCommands } from "./labels";
import { presetCommands } from "./presets";
import { projectCommands } from "./projects";
import { taskCommands } from "./tasks";
import { workspaceCommands } from "./workspace";
import type { Webhooks } from "../webhooks";
import { webhookCommands } from "./webhooks";

export function registerTasksCli(
  bb: BbPluginApi,
  store: TasksApiStore,
  status: PluginStatus,
  webhooks?: Webhooks,
): void {
  const domain = registerHandlers(bb, store, webhooks);
  const workspace = workspaceCommands(domain, status);
  bb.cli.register(
    defineCli({
      name: "tasks",
      summary: "Create and manage task-tracker projects, tasks, labels",
      description:
        "Tasks are addressed by key (ABC-12) or ULID. --project takes a tracker project prefix or id, never a bb project id (proj_...).",
      commands: {
        status: workspace.status,
        ...projectCommands(bb, store, domain),
        ...taskCommands(bb, store, domain),
        ...labelCommands(domain),
        ...attachmentCommands(bb, store, domain),
        ...presetCommands(domain),
        ...delegationCommands(bb, store, domain),
        ...(webhooks ? webhookCommands(bb, domain, webhooks) : {}),
        "seed-demo": workspace["seed-demo"],
      },
    }),
  );
}
