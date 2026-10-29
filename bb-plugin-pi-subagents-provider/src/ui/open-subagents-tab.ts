import type { ExperimentalTabReference } from "@get-bb/plugin-sdk/app";

export type SubagentsTabRequest = {
  tab: ExperimentalTabReference & {
    id: "subagents";
    context: { kind: "thread" };
    availability: "action";
  };
  params: { rowId: string } | { overview: true };
};

type SubagentsPanel =
  | { openTab(options: SubagentsTabRequest): boolean }
  | {
      experimental_openTab(
        options: SubagentsTabRequest & { surface: { kind: "current" } },
      ): boolean;
    };

export function openSubagentsTab(panel: SubagentsPanel, request: SubagentsTabRequest): boolean {
  if ("openTab" in panel) return panel.openTab(request);
  return panel.experimental_openTab({ ...request, surface: { kind: "current" } });
}
