import { useEffect, useRef } from "react";
import type { LineRequest, SourceLines } from "./source-lines.js";

export function RawDocument({
  sourceLines,
  request,
  annotations,
  reveal,
}: {
  sourceLines: SourceLines;
  request: LineRequest;
  annotations: boolean;
  reveal: (target: HTMLElement) => void;
}) {
  const raw = useRef<HTMLPreElement>(null);
  const range = sourceLines.target(request);
  useEffect(() => {
    const range = sourceLines.target(request);
    const target =
      range && raw.current?.querySelector<HTMLElement>(`[data-source-line="${range.start}"]`);
    if (target) reveal(target);
  }, [sourceLines, request, reveal]);
  return (
    <pre ref={raw} className="mr-raw" aria-label="Raw Markdown" tabIndex={0}>
      {annotations || range
        ? sourceLines.lines.map((text, index) => (
            <span
              key={index}
              className="mr-source-line"
              data-source-line={index + 1}
              data-highlighted={!!range && index + 1 >= range.start && index + 1 <= range.end}
              tabIndex={-1}
            >
              {text}
            </span>
          ))
        : sourceLines.lines.join("")}
    </pre>
  );
}
