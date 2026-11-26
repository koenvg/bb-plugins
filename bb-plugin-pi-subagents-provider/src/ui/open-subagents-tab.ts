import type { ExperimentalTabReference } from "@get-bb/plugin-sdk/app";

export interface SubagentsTabRequest {
  tab: ExperimentalTabReference & {
    id: "subagents";
    context: { kind: "thread" };
    availability: "action";
  };
  params: { rowId: string } | { overview: true };
}

interface SubagentsPanel {
  openTab: (options: SubagentsTabRequest) => boolean;
}

export function openSubagentsTab(panel: SubagentsPanel, request: SubagentsTabRequest): boolean {
  return panel.openTab(request);
}
