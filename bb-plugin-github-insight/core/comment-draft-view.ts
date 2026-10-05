import type { ListedCommentDraft } from "./review-drafts";

export function splitByCommit(
  drafts: readonly ListedCommentDraft[],
  headOid: string,
): { atHead: ListedCommentDraft[]; older: ListedCommentDraft[] } {
  return {
    atHead: drafts.filter((draft) => draft.commitOid === headOid),
    older: drafts.filter((draft) => draft.commitOid !== headOid),
  };
}

export function draftLineText({
  line,
  startLine,
}: Pick<ListedCommentDraft, "line" | "startLine">): string {
  return startLine === null ? `Line ${line}` : `Lines ${startLine}-${line}`;
}

export function newCommitsText(draftOid: string, headOid: string): string {
  return `PR has new commits since these drafts (${shortOid(draftOid)} -> ${shortOid(headOid)})`;
}

function shortOid(oid: string): string {
  return oid.slice(0, 7);
}
