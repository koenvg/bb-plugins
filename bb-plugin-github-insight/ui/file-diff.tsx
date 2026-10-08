import { useEffect, useMemo, useRef, useState } from "react";
import { parsePatchFiles, type DiffLineAnnotation, type FileDiffMetadata } from "@pierre/diffs";
import { experimental_useCodeTheme as useCodeTheme } from "@get-bb/plugin-sdk/app";
import { gitPatch, type ReviewFile } from "../core/pr-files";
import type { DiffSide } from "../core/diff-lines";
import type { DiffSide as PierreSide } from "../../review-ui/diff-lines";
import type { ListedCommentDraft } from "../core/review-drafts";
import type { ReviewThread } from "../core/review-threads";
import type { PlacedThread } from "../core/thread-placement";
import { Icon } from "@/components/ui/icon";
import { ReviewFileDiff } from "../../review-ui/review-file-diff";
import { CommentDraftCard } from "./comment-drafts";
import { ReviewThreadCard } from "./review-thread";

interface ThreadsProps {
  threads: readonly PlacedThread[];
  commentDrafts: readonly ListedCommentDraft[];
}

type AddComment = (path: string, side: DiffSide, line: number) => void;

function toPierreSide(side: DiffSide): PierreSide {
  return side === "RIGHT" ? "additions" : "deletions";
}

function fromPierreSide(side: PierreSide): DiffSide {
  return side === "additions" ? "RIGHT" : "LEFT";
}

type Annotation =
  | { kind: "thread"; thread: ReviewThread }
  | { kind: "comment-draft"; draft: ListedCommentDraft };

export function PrFileDiff({
  file,
  threads,
  commentDrafts,
  onAddComment,
}: ThreadsProps & { file: ReviewFile; onAddComment?: AddComment }) {
  const fileDiff = useMemo(() => parseFileDiff(file), [file]);
  if (fileDiff === null)
    return <UnavailableFileDiff path={file.path} threads={threads} commentDrafts={commentDrafts} />;
  return (
    <LazyFileDiff
      path={file.path}
      fileDiff={fileDiff}
      threads={threads}
      commentDrafts={commentDrafts}
      onAddComment={
        onAddComment && ((side, line) => onAddComment(file.path, fromPierreSide(side), line))
      }
    />
  );
}

function UnavailableFileDiff({ path, threads, commentDrafts }: ThreadsProps & { path: string }) {
  return (
    <section
      data-path={path}
      className="flex flex-col gap-1 border-b border-border px-3 py-2 text-sm"
    >
      <span className="font-mono text-xs">{path}</span>
      <span className="text-xs text-muted-foreground">Diff not available</span>
      {threads.map(({ thread }) => (
        <ReviewThreadCard key={thread.id} thread={thread} />
      ))}
      {commentDrafts.map((draft) => (
        <CommentDraftCard key={draft.id} draft={draft} />
      ))}
    </section>
  );
}

function LazyFileDiff({
  path,
  fileDiff,
  threads,
  commentDrafts,
  onAddComment,
}: ThreadsProps & {
  path: string;
  fileDiff: FileDiffMetadata;
  onAddComment?: (side: PierreSide, line: number) => void;
}) {
  const { visible, ref } = useVisibleOnce<HTMLElement>();
  const theme = useCodeTheme();
  const lineAnnotations = useMemo(
    (): DiffLineAnnotation<Annotation>[] => [
      ...threads.map(({ thread, side, lineNumber }) => ({
        side,
        lineNumber,
        metadata: { kind: "thread" as const, thread },
      })),
      ...commentDrafts.map((draft) => ({
        side: toPierreSide(draft.side),
        lineNumber: draft.line,
        metadata: { kind: "comment-draft" as const, draft },
      })),
    ],
    [threads, commentDrafts],
  );
  return (
    <section ref={ref} data-path={path} className="min-h-10 border-b border-border">
      {visible && (
        <ReviewFileDiff
          fileDiff={fileDiff}
          annotations={lineAnnotations}
          onAddComment={onAddComment}
          view="split"
          theme={theme}
          headerMetadata={<ThreadCount count={threads.length} />}
          renderAnnotation={({ metadata }) =>
            metadata.kind === "thread" ? (
              <ReviewThreadCard key={metadata.thread.id} thread={metadata.thread} />
            ) : (
              <CommentDraftCard key={metadata.draft.id} draft={metadata.draft} />
            )
          }
        />
      )}
    </section>
  );
}

function ThreadCount({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 font-sans text-xs text-muted-foreground tabular-nums">
      <Icon name="MessageSquare" className="size-3.5" />
      {count}
    </span>
  );
}

function parseFileDiff(file: ReviewFile): FileDiffMetadata | null {
  const patch = gitPatch(file);
  if (patch === null) return null;
  try {
    const files = parsePatchFiles(patch, undefined, true).flatMap((parsed) => parsed.files);
    return files.length === 1 ? files[0]! : null;
  } catch {
    return null;
  }
}

function useVisibleOnce<T extends Element>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (visible || element === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);
  return { visible, ref };
}
