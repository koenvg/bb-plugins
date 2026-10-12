import type {
  ActionResult,
  AddCommentRequest,
  AddPrCommentRequest,
  TimelineResult,
} from "../contract";
import { parseTimelinePage } from "../core/timeline";
import { GhFailureError, ghFailureText } from "../github/gh-failure";
import { write } from "../github/gh-write";
import type { PrResolution, PrTarget } from "../pr-lookup";

interface TimelineServiceDeps {
  resolvePr(threadId: string): Promise<PrResolution>;
  fetchTimelinePage(target: PrTarget, before: string | null): Promise<unknown>;
  addComment(target: PrTarget, request: AddCommentRequest): Promise<unknown>;
}

export function createTimelineService(deps: TimelineServiceDeps) {
  async function getTimeline(threadId: string, before: string | null): Promise<TimelineResult> {
    const resolution = await deps.resolvePr(threadId);
    if (resolution.kind !== "pr") return resolution;
    try {
      const page = parseTimelinePage(await deps.fetchTimelinePage(resolution.target, before));
      return { kind: "ok", ...page };
    } catch (error) {
      if (error instanceof GhFailureError) {
        return { kind: "error", message: ghFailureText(error.failure) };
      }
      throw error;
    }
  }

  async function addPrComment({
    threadId,
    prNodeId,
    body,
  }: AddPrCommentRequest): Promise<ActionResult> {
    const resolution = await deps.resolvePr(threadId);
    if (resolution.kind === "no_pr")
      return { kind: "error", message: "No pull request for this thread" };
    if (resolution.kind === "error") return resolution;
    const posted = await write(() =>
      deps.addComment(resolution.target, { subjectId: prNodeId, body }),
    );
    return posted.ok ? { kind: "ok" } : { kind: "error", message: posted.message };
  }

  return { getTimeline, addPrComment };
}
