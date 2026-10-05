import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { parsePatchFiles, type DiffLineAnnotation, type FileDiffMetadata } from "@pierre/diffs";
import { experimental_useCodeTheme as useCodeTheme } from "@get-bb/plugin-sdk/app";
import { commentAnchorLine, type DiffLines } from "../../review-ui/diff-lines";
import { DiffStat } from "../../review-ui/diff-stat";
import { InlineCommentForm } from "../../review-ui/inline-comment-form";
import { PendingCommentCard } from "../../review-ui/pending-comment-card";
import { ReviewFileDiff, type DiffView } from "../../review-ui/review-file-diff";
import type { ChangedFile } from "../core/changes";
import { pendingReviews, type OpenForm, type PendingComment } from "../core/pending-review";
import type { PatchState } from "./use-patches";

type Annotation = { kind: "comment"; comment: PendingComment } | { kind: "form"; form: OpenForm };

interface FileSectionProps {
  threadId: string;
  file: ChangedFile;
  patch: PatchState;
  lines: DiffLines | null;
  loadPatch: (path: string) => void;
  comments: readonly PendingComment[];
  openForms: readonly OpenForm[];
  view: DiffView;
}

export function FileSection({
  threadId,
  file,
  patch,
  lines,
  loadPatch,
  comments,
  openForms,
  view,
}: FileSectionProps) {
  const { visible, ref } = useNearView<HTMLElement>();
  const showsDiff = !file.binary && file.loadMode !== "too_large";
  useEffect(() => {
    if (visible && showsDiff) loadPatch(file.path);
  }, [visible, showsDiff, loadPatch, file.path]);

  return (
    <section ref={ref} aria-label={file.path} className="min-h-10 border-b border-border">
      {!showsDiff ? (
        <FileNotice file={file}>{file.binary ? "Binary file" : "Diff too large"}</FileNotice>
      ) : !visible || patch.kind === "loading" ? (
        <FileNotice file={file}>Loading diff…</FileNotice>
      ) : patch.kind === "error" ? (
        <FileNotice file={file}>{patch.message}</FileNotice>
      ) : (
        <FileDiffWithComments
          threadId={threadId}
          file={file}
          patch={patch.patch}
          lines={lines}
          comments={comments}
          openForms={openForms}
          view={view}
        />
      )}
    </section>
  );
}

function FileDiffWithComments({
  threadId,
  file,
  patch,
  lines,
  comments,
  openForms,
  view,
}: Omit<FileSectionProps, "patch" | "loadPatch"> & { patch: string }) {
  const theme = useCodeTheme();
  const fileDiff = useMemo(() => parseFileDiff(patch), [patch]);
  const annotations = useMemo(
    (): DiffLineAnnotation<Annotation>[] => [
      ...comments.map((comment) => ({
        side: comment.side,
        lineNumber: comment.line,
        metadata: { kind: "comment" as const, comment },
      })),
      ...openForms.map((form) => ({
        side: form.anchor.side,
        lineNumber: form.anchor.line,
        metadata: { kind: "form" as const, form },
      })),
    ],
    [comments, openForms],
  );
  if (fileDiff === null) return <FileNotice file={file}>Diff not available</FileNotice>;
  return (
    <ReviewFileDiff
      fileDiff={fileDiff}
      annotations={annotations}
      view={view}
      theme={theme}
      onAddComment={(side, line) =>
        pendingReviews.openForm(threadId, {
          path: file.path,
          ...(lines === null ? { side, line } : commentAnchorLine(lines, side, line)),
        })
      }
      renderAnnotation={({ metadata }) =>
        metadata.kind === "comment" ? (
          <PendingCommentCard
            body={metadata.comment.body}
            onRemove={() => pendingReviews.removeComments(threadId, [metadata.comment.id])}
          />
        ) : (
          <InlineCommentForm
            text={metadata.form.text}
            onTextChange={(text) =>
              pendingReviews.setFormText(threadId, metadata.form.anchor, text)
            }
            onSubmit={() =>
              pendingReviews.addComment(threadId, metadata.form.anchor, metadata.form.text.trim())
            }
            onCancel={() => pendingReviews.closeForm(threadId, metadata.form.anchor)}
          />
        )
      }
    />
  );
}

function FileNotice({ file, children }: { file: ChangedFile; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-mono text-xs" title={file.path}>
          {file.previousPath === null ? file.path : `${file.previousPath} → ${file.path}`}
        </span>
        <span className="ml-auto">
          <DiffStat additions={file.additions} deletions={file.deletions} />
        </span>
      </div>
      <span className="text-xs text-muted-foreground">{children}</span>
    </div>
  );
}

function parseFileDiff(patch: string): FileDiffMetadata | null {
  try {
    const files = parsePatchFiles(patch, undefined, true).flatMap((parsed) => parsed.files);
    return files.length === 1 ? files[0]! : null;
  } catch {
    return null;
  }
}

function useNearView<T extends Element>() {
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
