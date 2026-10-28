import { REVIEW_QUEUE_PAGE_SIZE } from "./review-queue";
import {
  agentStateOf,
  ATTENTION_TEXT,
  attentionReasons,
  type AgentState,
  type AttentionReason,
  type LinkedQueuePr,
  type QueueSection,
  type ReviewQueueResult,
  type ReviewQueueView,
} from "./review-queue-view";

export type QueueMark = (typeof ATTENTION_TEXT)[AttentionReason];

type Section = "needs_review" | "reviewed";

export interface QueueListEntry {
  key: string;
  title: string;
  url: string;
  author: string | null;
  section: Section;
  marks: QueueMark[];
  thread: { id: string; status: AgentState } | null;
}

export interface QueueList {
  loadedAt: string;
  truncated: boolean;
  error: string | null;
  prs: QueueListEntry[];
}

export type QueueListLoad =
  | { kind: "ok"; list: QueueList }
  | { kind: "loading" }
  | { kind: "error"; message: string };

export function queueListOf(result: ReviewQueueResult): QueueListLoad {
  if (result.kind === "loading") return result;
  if (result.kind === "ok") return { kind: "ok", list: listOf(result, null) };
  if (result.lastGood === null) return { kind: "error", message: result.message };
  return { kind: "ok", list: listOf(result.lastGood, result.message) };
}

function listOf(view: ReviewQueueView, error: string | null): QueueList {
  return {
    loadedAt: new Date(view.loadedAt).toISOString(),
    truncated: view.truncated,
    error,
    prs: [...entriesOf(view.needsReview, "needs_review"), ...entriesOf(view.reviewed, "reviewed")],
  };
}

function entriesOf(groups: QueueSection, section: Section): QueueListEntry[] {
  return groups.flatMap((group) => group.prs.map((pr) => entryOf(pr, section)));
}

function entryOf(pr: LinkedQueuePr, section: Section): QueueListEntry {
  return {
    key: `${pr.repo}#${pr.number}`,
    title: pr.title,
    url: pr.url,
    author: pr.author,
    section,
    marks: attentionReasons(pr).map((reason) => ATTENTION_TEXT[reason]),
    thread: pr.thread === null ? null : { id: pr.thread.id, status: agentStateOf(pr.thread) },
  };
}

const SECTION_HEADING: Record<Section, string> = {
  needs_review: "Needs review",
  reviewed: "Reviewed",
};

export function formatQueueList(list: QueueList): string {
  const lines: string[] = [];
  if (list.error !== null) {
    lines.push(`Error: ${list.error}`, `Showing the queue loaded at ${list.loadedAt}`);
  }
  if (list.prs.length === 0) lines.push("No pull requests in the review queue");
  for (const section of ["needs_review", "reviewed"] as const) {
    const prs = list.prs.filter((pr) => pr.section === section);
    if (prs.length === 0) continue;
    lines.push(SECTION_HEADING[section], ...prs.map(formatEntry));
  }
  if (list.truncated) lines.push(`Showing the first ${REVIEW_QUEUE_PAGE_SIZE} pull requests`);
  return `${lines.join("\n")}\n`;
}

function formatEntry(entry: QueueListEntry): string {
  const parts = [`  ${entry.key}  ${entry.title}`];
  if (entry.author !== null) parts.push(`by ${entry.author}`);
  if (entry.marks.length > 0) parts.push(`[${entry.marks.join(", ")}]`);
  if (entry.thread !== null) parts.push(`thread ${entry.thread.id} ${entry.thread.status}`);
  return parts.join("  ");
}
