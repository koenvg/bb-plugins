import type { ReactNode } from "react";
import type { DiffLineAnnotation, FileDiffMetadata } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import type { DiffSide } from "./diff-lines";

export type DiffView = "unified" | "split";

export interface CodeTheme {
  name: string;
  mode: "light" | "dark";
}

export interface ReviewFileDiffProps<T> {
  fileDiff: FileDiffMetadata;
  annotations: DiffLineAnnotation<T>[];
  renderAnnotation: (annotation: DiffLineAnnotation<T>) => ReactNode;
  onAddComment: (side: DiffSide, line: number) => void;
  view: DiffView;
  theme: CodeTheme;
}

export function ReviewFileDiff<T>({
  fileDiff,
  annotations,
  renderAnnotation,
  onAddComment,
  view,
  theme,
}: ReviewFileDiffProps<T>) {
  return (
    <FileDiff
      fileDiff={fileDiff}
      options={{
        theme: theme.name,
        themeType: theme.mode,
        overflow: "wrap",
        stickyHeader: true,
        diffStyle: view,
        enableGutterUtility: true,
        onGutterUtilityClick: (range) => onAddComment(range.side ?? "additions", range.start),
      }}
      lineAnnotations={annotations}
      renderAnnotation={renderAnnotation}
    />
  );
}
