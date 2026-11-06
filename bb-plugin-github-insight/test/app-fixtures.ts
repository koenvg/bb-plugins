import { experimental_makePanelController } from "@get-bb/plugin-sdk/testing";
import type { PluginCommandContext } from "@get-bb/plugin-sdk/app";
import { loadPluginApp } from "@get-bb/plugin-sdk/testing/app";

export function prTabOf(app: Awaited<ReturnType<typeof loadPluginApp>>) {
  return app.tabs.find(
    (tab): tab is Extract<typeof tab, { context: { kind: "thread" }; availability: "action" }> =>
      tab.id === "pr" && tab.context.kind === "thread" && tab.availability === "action",
  )!;
}

export function commandContext(
  threadId: string | null,
  openTab: PluginCommandContext["experimental_panel"]["openTab"] = () => false,
): PluginCommandContext {
  return {
    threadId,
    projectId: null,
    experimental_panel: experimental_makePanelController({ openTab }),
  };
}
