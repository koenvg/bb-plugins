import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Markdown } from "@get-bb/plugin-sdk/app";

const VIDEO_TAG = /<video\b[^>]*?(?<![\w-])src="([^"]+)"[^>]*>\s*<\/video>/g;
const SLOT_ID = "pr-video-";
const RENDERED_SLOT_ID = `user-content-${SLOT_ID}`;

interface VideoSlots {
  markdown: string;
  sources: readonly string[];
}

function withVideoSlots(content: string): VideoSlots {
  const sources: string[] = [];
  const markdown = content.replace(VIDEO_TAG, (_tag, src: string) => {
    sources.push(src.replaceAll("&amp;", "&"));
    return `<span id="${SLOT_ID}${sources.length - 1}"></span>`;
  });
  return { markdown, sources };
}

function sameSlots(a: readonly HTMLElement[], b: readonly HTMLElement[]): boolean {
  return a.length === b.length && a.every((slot, index) => slot === b[index]);
}

// BB's Markdown rebuilds its <video> component whenever a host context changes, which remounts
// the element and restarts the video. Portaling our own <video> into a plain span keeps it alive.
export function PrMarkdown({ content, className }: { content: string; className: string }) {
  const { markdown, sources } = useMemo(() => withVideoSlots(content), [content]);
  const root = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<readonly HTMLElement[]>([]);
  useLayoutEffect(() => {
    const element = root.current;
    if (element === null) return;
    const sync = () => {
      const found = Array.from(
        element.querySelectorAll<HTMLElement>(`span[id^="${RENDERED_SLOT_ID}"]`),
      );
      setSlots((current) => (sameSlots(current, found) ? current : found));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(element, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={root} className={className}>
      <Markdown content={markdown} />
      {slots.map((slot) => {
        const src = sources[Number(slot.id.slice(RENDERED_SLOT_ID.length))];
        return src === undefined
          ? null
          : createPortal(
              <video
                src={src}
                controls
                playsInline
                preload="metadata"
                className="my-2 max-h-[max(384px,50vh)] max-w-full"
              />,
              slot,
              slot.id,
            );
      })}
    </div>
  );
}
