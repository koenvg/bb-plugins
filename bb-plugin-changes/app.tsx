import {
  definePluginApp,
  experimental_THREAD_CONTEXT_SEGMENT_GROUPS,
} from "@get-bb/plugin-sdk/app";
import { ChangesTab } from "./ui/changes-tab";
import {
  WorkspaceFiles,
  WorkspaceSummary,
  useWorkspaceSummaryVisible,
} from "./ui/workspace-summary";

export default definePluginApp((app) => {
  app.slots.experimental_threadContextSegment({
    id: "workspace-changes",
    title: "Workspace changes",
    group: experimental_THREAD_CONTEXT_SEGMENT_GROUPS.git,
    summary: WorkspaceSummary,
    details: WorkspaceFiles,
    useVisible: useWorkspaceSummaryVisible,
  });
  app.slots.experimental_tab({
    context: { kind: "thread" },
    availability: "action",
    icon: "GitCompare",
    id: "changes",
    title: "Changes",
    layout: "flush",
    component: ChangesTab,
  });
});
