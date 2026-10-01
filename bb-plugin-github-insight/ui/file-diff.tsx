import { useEffect, useMemo, useRef, useState } from "react";
import { parsePatchFiles, type DiffLineAnnotation, type FileDiffMetadata } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { experimental_useCodeTheme as useCodeTheme } from "@get-bb/plugin-sdk/app";
import { gitPatch, type ReviewFile } from "../core/pr-files";
import type { ReviewThread } from "../core/review-threads";
import type { PlacedThread } from "../core/thread-placement";
import { Icon } from "@/components/ui/icon";
import { ReviewThreadCard } from "./review-thread";

interface ThreadsProps {
  threads: readonly PlacedThread[];
}

export function PrFileDiff({ file, threads }: ThreadsProps & { file: ReviewFile }) {
  const fileDiff = useMemo(() => parseFileDiff(file), [file]);
  if (fileDiff === null) return <UnavailableFileDiff path={file.path} threads={threads} />;
  return <LazyFileDiff fileDiff={fileDiff} threads={threads} />;
}

function UnavailableFileDiff({ path, threads }: ThreadsProps & { path: string }) {
  return (
    <section className="flex flex-col gap-1 border-b border-border px-3 py-2 text-sm">
      <span className="font-mono text-xs">{path}</span>
      <span className="text-xs text-muted-foreground">Diff not available</span>
      {threads.map(({ thread }) => (
        <ReviewThreadCard key={thread.id} thread={thread} />
      ))}
    </section>
  );
}

function LazyFileDiff({ fileDiff, threads }: ThreadsProps & { fileDiff: FileDiffMetadata }) {
  const { visible, ref } = useVisibleOnce<HTMLElement>();
  const theme = useCodeTheme();
  const lineAnnotations = useMemo(
    () =>
      threads.map(({ thread, side, lineNumber }): DiffLineAnnotation<ReviewThread> => ({
        side,
        lineNumber,
        metadata: thread,
      })),
    [threads],
  );
  return (
    <section ref={ref} className="min-h-10 border-b border-border">
      {visible && (
        <FileDiff
          fileDiff={fileDiff}
          options={{ theme: theme.name, themeType: theme.mode, overflow: "wrap", stickyHeader: true }}
          lineAnnotations={lineAnnotations}
          renderHeaderMetadata={() => <ThreadCount count={threads.length} />}
          renderAnnotation={({ metadata }) => (
            <ReviewThreadCard key={metadata.id} thread={metadata} />
          )}
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
