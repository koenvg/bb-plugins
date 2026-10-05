import type { BbPluginApi } from "@get-bb/plugin-sdk";

export async function relinquishableWorker(
  bb: BbPluginApi,
  threadId: string,
  projectId: string,
): Promise<"confirmed" | "refused" | "unknown"> {
  try {
    const thread = await bb.sdk.threads.get({
      threadId,
      signal: AbortSignal.timeout(1500),
    });
    if (thread.id !== threadId || thread.projectId !== projectId) return "unknown";
    if (thread.status === "active" || thread.status === "stopping") return "refused";
    if (thread.status === "error" || thread.archivedAt != null || thread.deletedAt != null)
      return "confirmed";
    const events = await bb.sdk.threads.events.list({
      threadId,
      types: ["system/thread/interrupted"],
      order: "desc",
      limit: "100",
      signal: AbortSignal.timeout(1500),
    });
    if (events.length >= 100) return "unknown";
    return events.some(
      (event) => event.type === "system/thread/interrupted" && event.data.reason === "manual-stop",
    )
      ? "confirmed"
      : "refused";
  } catch {
    return "unknown";
  }
}
