import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { TaskThreadLiveStatus } from "../db";

type SdkThread = Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["get"]>>;
export type ThreadActivity = Pick<SdkThread, "status" | "activeBackgroundAgentCount">;
type ActivityExecution = Exclude<TaskThreadLiveStatus, "completed">;

export function projectThreadActivity(thread: ThreadActivity): ActivityExecution {
  switch (thread.status) {
    case "error":
      return "failed";
    case "pending":
    case "starting":
      return thread.activeBackgroundAgentCount > 0 ? "working" : "starting";
    case "active":
    case "stopping":
      return "working";
    case "idle":
      return thread.activeBackgroundAgentCount > 0 ? "working" : "idle";
  }
}
