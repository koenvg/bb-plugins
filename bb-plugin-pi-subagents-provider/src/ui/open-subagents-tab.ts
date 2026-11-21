import type { ExperimentalTabReference } from "@get-bb/plugin-sdk/app";

export type SubagentsTabRequest = {
  tab: ExperimentalTabReference & {
    id: "subagents";
    context: { kind: "thread" };
    availability: "action";
  };
  params: { rowId: string } | { overview: true };
};

type SubagentsPanel = { openTab(options: SubagentsTabRequest): boolean };

export function openSubagentsTab(panel: SubagentsPanel, request: SubagentsTabRequest): boolean {
  return panel.openTab(request);
}
