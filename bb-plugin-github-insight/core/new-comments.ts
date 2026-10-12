export interface PostedComment {
  id: string;
  postedAt: string;
}

export function postedAt(comment: { createdAt: string; publishedAt?: string | null }): string {
  return comment.publishedAt ?? comment.createdAt;
}

export function newCommentIds(
  comments: readonly PostedComment[],
  markedAt: number | null,
  seen: ReadonlySet<string>,
): string[] {
  if (markedAt === null) return [];
  return comments
    .filter((comment) => Date.parse(comment.postedAt) > markedAt && !seen.has(comment.id))
    .map((comment) => comment.id);
}
