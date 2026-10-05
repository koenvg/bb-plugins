import { useEffect, useState, type RefObject } from "react";
import type { DocumentModel } from "./document";

/** Observe the reader slot, never the desktop viewport. */
export function useWidePanel(root: RefObject<HTMLElement | null>, enabled = true) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const panel = root.current;
    if (!enabled || !panel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((entry) => entry.target === panel);
      if (entry) setWide(entry.contentRect.width > 1080);
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [root, enabled]);
  return wide;
}

export function Outline({
  model,
  wide,
  navigate,
}: {
  model: DocumentModel;
  wide: boolean;
  navigate: (id: string) => void;
}) {
  const entries = (
    <nav aria-label="Document sections">
      {model.headings.map((heading) => (
        <button
          type="button"
          key={heading.id}
          style={{ paddingInlineStart: 12 + (heading.level - 1) * 8 }}
          aria-label={heading.text || "Empty heading"}
          onClick={() => navigate(heading.id)}
        >
          {heading.text}
        </button>
      ))}
    </nav>
  );
  return wide ? (
    <aside className="mr-outline-aside" aria-label="On this page">
      <p>On this page</p>
      {entries}
    </aside>
  ) : (
    <details className="mr-outline-inline">
      <summary>On this page</summary>
      {entries}
    </details>
  );
}
