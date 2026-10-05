import { useEffect, useRef, type RefObject } from "react";
import type { LineRequest, SourceLines } from "./source-lines";
import { revealInReader } from "./navigation";

export function RawDocument({
  sourceLines,
  request,
  panel,
}: {
  sourceLines: SourceLines;
  request: LineRequest;
  panel: RefObject<HTMLElement | null>;
}) {
  const raw = useRef<HTMLPreElement>(null);
  const range = sourceLines.target(request);
  useEffect(() => {
    const range = sourceLines.target(request);
    const target =
      range && raw.current?.querySelector<HTMLElement>(`[data-source-line="${range.start}"]`);
    if (target && panel.current) revealInReader(panel.current, target);
  }, [sourceLines, request, panel]);
  return (
    <pre ref={raw} className="mr-raw" aria-label="Raw Markdown" tabIndex={0}>
      {sourceLines.lines.map((text, index) => (
        <span
          key={index}
          className="mr-source-line"
          data-source-line={index + 1}
          data-highlighted={!!range && index + 1 >= range.start && index + 1 <= range.end}
          tabIndex={-1}
        >
          {text}
        </span>
      ))}
    </pre>
  );
}
