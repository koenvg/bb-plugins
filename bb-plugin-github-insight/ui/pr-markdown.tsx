import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Markdown, useRpc } from "@get-bb/plugin-sdk/app";
import { imageBlobResult } from "../../review-ui/image-diff";
import type { rpcContract } from "../contract";
import { repoFileFromRawUrl, type RepoFile } from "../core/repo-file";

const VIDEO_TAG = /<video\b[^>]*?(?<![\w-])src="([^"]+)"[^>]*>\s*<\/video>/g;
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const HTML_IMAGE = /<img\b[^>]*>/gi;
const SLOT_ID = "pr-media-";
const RENDERED_SLOT_ID = `user-content-${SLOT_ID}`;

const RepoImageThreadContext = createContext<string | null>(null);
export const RepoImageThreadProvider = RepoImageThreadContext.Provider;

function useRepoImageThread(): string {
  const threadId = useContext(RepoImageThreadContext);
  if (threadId === null) throw new Error("RepoImage needs a RepoImageThreadProvider");
  return threadId;
}

type Media = { kind: "video"; src: string } | { kind: "image"; file: RepoFile; alt: string };

interface MediaSlots {
  markdown: string;
  media: readonly Media[];
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`(?<![\\w-])${name}="([^"]*)"`).exec(tag)?.[1]?.replaceAll("&amp;", "&");
}

function withMediaSlots(content: string): MediaSlots {
  const media: Media[] = [];
  const slot = (item: Media) => {
    media.push(item);
    return `<span id="${SLOT_ID}${media.length - 1}"></span>`;
  };
  const repoImage = (original: string, src: string | undefined, alt: string) => {
    const file = src === undefined ? null : repoFileFromRawUrl(src);
    return file === null ? original : slot({ kind: "image", file, alt });
  };
  const markdown = content
    .replace(VIDEO_TAG, (_tag, src: string) =>
      slot({ kind: "video", src: src.replaceAll("&amp;", "&") }),
    )
    .replace(MARKDOWN_IMAGE, (image, alt: string, src: string) => repoImage(image, src, alt))
    .replace(HTML_IMAGE, (tag) =>
      repoImage(tag, attribute(tag, "src"), attribute(tag, "alt") ?? ""),
    );
  return { markdown, media };
}

type RepoImageState =
  | { kind: "loading" }
  | { kind: "ready"; url: string }
  | { kind: "error"; message: string };

function RepoImage({ file, alt }: { file: RepoFile; alt: string }) {
  const threadId = useRepoImageThread();
  const rpc = useRpc<typeof rpcContract>();
  const [state, setState] = useState<RepoImageState>({ kind: "loading" });
  const { owner, repo, sha, path } = file;
  useEffect(() => {
    let live = true;
    let url: string | null = null;
    setState({ kind: "loading" });
    rpc
      .call("getPrBodyImage", { threadId, owner, repo, sha, path })
      .then(imageBlobResult)
      .then(
        (result) => {
          if (!live) return;
          if (result.kind === "ready") {
            url = URL.createObjectURL(result.blob);
            setState({ kind: "ready", url });
          } else {
            setState({
              kind: "error",
              message: result.kind === "error" ? result.message : "Image not found",
            });
          }
        },
        (error: unknown) => {
          if (live)
            setState({
              kind: "error",
              message: error instanceof Error ? error.message : "Could not load image",
            });
        },
      );
    return () => {
      live = false;
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [rpc, threadId, owner, repo, sha, path]);
  return state.kind === "ready" ? (
    <img src={state.url} alt={alt} className="max-w-full" />
  ) : (
    <span
      className="text-muted-foreground"
      title={state.kind === "error" ? state.message : undefined}
    >
      {alt}
    </span>
  );
}

function sameSlots(a: readonly HTMLElement[], b: readonly HTMLElement[]): boolean {
  return a.length === b.length && a.every((slot, index) => slot === b[index]);
}

// BB's Markdown rebuilds its <video> component whenever a host context changes, which remounts
// the element and restarts the video. Portaling our own <video> into a plain span keeps it alive.
// Repo images take the same route because BB's sanitizer strips the blob: URLs they load into.
export function PrMarkdown({ content, className }: { content: string; className: string }) {
  const { markdown, media } = useMemo(() => withMediaSlots(content), [content]);
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
        const item = media[Number(slot.id.slice(RENDERED_SLOT_ID.length))];
        if (item === undefined) return null;
        if (item.kind === "image")
          return createPortal(<RepoImage file={item.file} alt={item.alt} />, slot, slot.id);
        return createPortal(
          <video
            src={item.src}
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
