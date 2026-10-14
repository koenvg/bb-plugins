import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { parsePatchFiles, type DiffLineAnnotation, type FileDiffMetadata } from "@pierre/diffs";
import { useBbNavigate, experimental_useCodeTheme as useCodeTheme } from "@get-bb/plugin-sdk/app";
import { commentAnchorLine, type DiffLines } from "../../review-ui/diff-lines";
import { DiffStat } from "../../review-ui/diff-stat";
import { InlineCommentForm } from "../../review-ui/inline-comment-form";
import { PendingCommentCard } from "../../review-ui/pending-comment-card";
import { ReviewFileDiff, type DiffView } from "../../review-ui/review-file-diff";
import { CollapseButton, ViewedCheckbox } from "../../review-ui/viewed-controls";
import type { ChangedFile } from "../core/changes";
import { canMark } from "../core/viewed-files";
import { pendingReviews, type OpenForm, type PendingComment } from "../core/pending-review";
import type { PatchState } from "./use-patches";
import type { FileViewedState } from "./use-viewed";

type Annotation = { kind: "comment"; comment: PendingComment } | { kind: "form"; form: OpenForm };

interface FileSectionProps {
  threadId: string;
  environmentId: string;
  file: ChangedFile;
  patch: PatchState;
  lines: DiffLines | null;
  loadPatch: (path: string) => void;
  comments: readonly PendingComment[];
  openForms: readonly OpenForm[];
  view: DiffView;
  viewed: FileViewedState;
}

export function FileSection({
  threadId,
  environmentId,
  file,
  patch,
  lines,
  loadPatch,
  comments,
  openForms,
  view,
  viewed,
}: FileSectionProps) {
  const { visible, ref } = useNearView<HTMLElement>();
  const showsDiff = canMark(file);
  const openFileButton = <OpenFileButton environmentId={environmentId} file={file} />;
  useEffect(() => {
    if (visible && showsDiff) loadPatch(file.path);
  }, [visible, showsDiff, loadPatch, file.path]);

  return (
    <section
      ref={ref}
      aria-label={file.path}
      data-path={file.path}
      className="min-h-10 border-b border-border"
    >
      {!showsDiff ? (
        <FileNotice file={file} openFileButton={openFileButton}>
          {file.binary ? "Binary file" : "Diff too large"}
        </FileNotice>
      ) : (!visible && !viewed.collapsed) || patch.kind === "loading" ? (
        <FileNotice file={file} openFileButton={openFileButton}>
          Loading diff…
        </FileNotice>
      ) : patch.kind === "error" ? (
        <FileNotice file={file} openFileButton={openFileButton}>
          {patch.message}
        </FileNotice>
      ) : (
        <FileDiffWithComments
          threadId={threadId}
          openFileButton={openFileButton}
          file={file}
          patch={patch.patch}
          lines={lines}
          comments={comments}
          openForms={openForms}
          view={view}
          viewed={viewed}
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
  viewed,
  openFileButton,
}: Omit<FileSectionProps, "patch" | "loadPatch" | "environmentId"> & {
  patch: string;
  openFileButton: ReactNode;
}) {
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
  if (fileDiff === null)
    return (
      <FileNotice file={file} openFileButton={openFileButton}>
        Diff not available
      </FileNotice>
    );
  return (
    <ReviewFileDiff
      fileDiff={fileDiff}
      annotations={annotations}
      view={view}
      theme={theme}
      collapsed={viewed.collapsed}
      customHeader={<FileHeaderRow file={file} openFileButton={openFileButton} viewed={viewed} />}
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

const CHEVRONS = {
  collapsed: <Icon name="ChevronRight" className="size-3.5" />,
  expanded: <Icon name="ChevronDown" className="size-3.5" />,
};

function OpenFileButton({ environmentId, file }: { environmentId: string; file: ChangedFile }) {
  const navigate = useBbNavigate();
  const [error, setError] = useState<string | null>(null);
  const deleted = file.status === "deleted";
  const label = `Open ${file.path} in file viewer`;

  function open() {
    try {
      const accepted = navigate.experimental_openFilePreview({
        target: { kind: "workspace", environmentId, path: file.path },
        location: null,
      });
      setError(accepted ? null : `Could not open ${file.path} in file viewer`);
    } catch {
      setError(`Could not open ${file.path} in file viewer`);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={deleted ? "Deleted files cannot be opened in the live workspace" : label}
        disabled={deleted}
        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        onKeyDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          open();
        }}
      >
        <Icon name="ArrowUpRight" aria-hidden="true" className="size-3.5" />
      </button>
      {error !== null && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </>
  );
}

function FileNotice({
  file,
  openFileButton,
  children,
}: {
  file: ChangedFile;
  openFileButton: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col text-sm">
      <FileHeaderRow file={file} openFileButton={openFileButton} />
      <span className="px-4 pb-2 text-xs text-muted-foreground">{children}</span>
    </div>
  );
}

function FileHeaderRow({
  file,
  openFileButton,
  viewed,
}: {
  file: ChangedFile;
  openFileButton: ReactNode;
  viewed?: FileViewedState;
}) {
  const fullPath = file.previousPath === null ? file.path : `${file.previousPath} → ${file.path}`;
  const statusLabel = `${file.status.replace("_", " ")} file`;
  const Filename = viewed === undefined ? "span" : "button";
  return (
    <div className="flex min-h-11 w-full min-w-0 items-center gap-2 px-4 text-[13px]">
      {viewed !== undefined && (
        <CollapseButton
          path={file.path}
          collapsed={viewed.collapsed}
          onToggle={viewed.toggleCollapsed}
          icons={CHEVRONS}
        />
      )}
      <span
        role="img"
        aria-label={statusLabel}
        title={statusLabel}
        className="shrink-0 text-muted-foreground"
      >
        <Icon name="File" aria-hidden="true" className="size-3.5" />
      </span>
      <Filename
        type={viewed === undefined ? undefined : "button"}
        aria-label={viewed === undefined ? undefined : `Toggle diff for ${file.path}`}
        aria-expanded={viewed === undefined ? undefined : !viewed.collapsed}
        onClick={viewed?.toggleCollapsed}
        className="flex min-w-0 items-center gap-2 rounded text-left enabled:cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        title={fullPath}
      >
        {file.previousPath !== null && (
          <>
            <span dir="rtl" className="min-w-0 truncate text-muted-foreground">
              <bdi>{file.previousPath}</bdi>
            </span>
            <span aria-hidden="true" className="shrink-0">
              {" → "}
            </span>
          </>
        )}
        <span dir="rtl" className="min-w-0 truncate">
          <bdi>{file.path}</bdi>
        </span>
      </Filename>
      {openFileButton}
      <span className="ml-auto flex shrink-0 items-center whitespace-nowrap">
        <DiffStat additions={file.additions} deletions={file.deletions} />
        {viewed !== undefined && (
          <ViewedCheckbox
            path={file.path}
            checked={viewed.viewed}
            disabled={!viewed.canToggleViewed}
            onToggle={viewed.toggleViewed}
          />
        )}
      </span>
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
