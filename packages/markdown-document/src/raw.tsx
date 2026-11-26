import { useCallback, useEffect, useMemo, useRef } from "react";
import type { LineRequest, SourceLines } from "./source-lines.js";

export const RawDocument = ({
  sourceLines,
  request,
  annotations,
  reveal,
}: {
  sourceLines: SourceLines;
  request: LineRequest;
  annotations: boolean;
  reveal: (target: HTMLElement) => void;
}) => {
  const raw = useRef<HTMLPreElement>(null);
  const retainFocus = useCallback((element: HTMLSpanElement | null) => {
    if (!element) return;
    return () => {
      if (element === element.ownerDocument.activeElement)
        raw.current?.focus({ preventScroll: true });
    };
  }, []);
  const range = sourceLines.target(request);
  const rangeStart = range?.start;
  const rangeEnd = range?.end;
  const groups = useMemo(() => {
    if (!annotations && rangeStart === undefined) return null;
    const lines = sourceLines.lines;
    const size = Math.ceil(lines.length / 128);
    const boundaries = new Set([0, lines.length]);
    if (lines.at(-1) === "") boundaries.add(lines.length - 1);
    for (let index = size; index < lines.length; index += size) boundaries.add(index);
    if (rangeStart !== undefined && rangeEnd !== undefined) {
      boundaries.add(rangeStart - 1);
      boundaries.add(rangeStart);
      boundaries.add(rangeEnd);
    }
    const ordered = [...boundaries].sort((a, b) => a - b);
    return ordered.slice(1).map((end, index) => {
      const start = ordered[index];
      if (start === undefined) throw new Error("Source boundary is missing");
      return { start: start + 1, end, text: lines.slice(start, end).join("") };
    });
  }, [sourceLines, annotations, rangeStart, rangeEnd]);
  useEffect(() => {
    const range = sourceLines.target(request);
    const target =
      range && raw.current?.querySelector<HTMLElement>(`[data-source-line="${range.start}"]`);
    if (target) reveal(target);
  }, [sourceLines, request, reveal]);
  const readingTabIndex = sourceLines.text ? 0 : -1;
  return (
    <pre ref={raw} className="mr-raw" aria-label="Raw Markdown" tabIndex={readingTabIndex}>
      {groups
        ? groups.map((group) => (
            <span
              ref={retainFocus}
              key={group.start}
              className="mr-source-line"
              data-source-line={group.start}
              data-source-line-end={group.end}
              data-highlighted={!!range && group.start >= range.start && group.end <= range.end}
              tabIndex={-1}
            >
              {group.text}
            </span>
          ))
        : sourceLines.text}
    </pre>
  );
};
