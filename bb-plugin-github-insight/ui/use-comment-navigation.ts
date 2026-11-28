import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore, type RefObject } from "react";
import { offsetFromTop, pinToTop, type PinTarget } from "../../review-ui/pin-to-top";
import { stickyHeaderHeight } from "../../review-ui/review-file-diff";
import type { CommentStop } from "../core/comment-stops";
import type { JumpMark } from "./jump-highlight";

const TOP_TOLERANCE_PX = 1;
const CARD_GAP_PX = 8;

export type StepDirection = 1 | -1;

export interface CommentNavigation {
  position: number | null;
  total: number;
  jumpMark: JumpMark | null;
  step: (direction: StepDirection) => void;
  jumpToFirstThread: (threadIds: ReadonlySet<string>) => void;
}

interface Pin {
  stop: CommentStop;
  release: () => void;
}

export function useCommentNavigation(
  scrollArea: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
  stops: readonly CommentStop[],
): CommentNavigation {
  const session = useMemo(() => createNavigationSession(), []);
  const { current, jumpMark } = useSyncExternalStore(session.subscribe, session.read);

  useLayoutEffect(() => {
    if (stops.length === 0) session.releasePin();
  }, [session, stops.length]);

  useEffect(() => {
    const area = scrollArea.current;
    if (area === null) return;
    const updateCurrent = () => {
      const currentArea = scrollArea.current;
      if (currentArea === null || stops.length === 0) return;
      session.measure(session.pinnedIndex(stops) ?? currentIndex(currentArea, stops));
    };
    updateCurrent();
    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        updateCurrent();
      });
    };
    area.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    if (content.current !== null) observer.observe(content.current);
    return () => {
      area.removeEventListener("scroll", schedule);
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [scrollArea, content, stops, session]);

  useEffect(() => session.releasePin, [session]);

  const { step, jumpToFirstThread } = useMemo(
    () => createJumpControls(scrollArea, content, stops, session),
    [scrollArea, content, stops, session],
  );

  return {
    position: stops.length === 0 ? null : Math.min(current, stops.length - 1),
    total: stops.length,
    jumpMark,
    step,
    jumpToFirstThread,
  };
}

function createNavigationSession() {
  let snapshot: { current: number; jumpMark: JumpMark | null } = { current: 0, jumpMark: null };
  let pin: Pin | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: typeof snapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    read: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    measure(current: number) {
      if (current !== snapshot.current) publish({ ...snapshot, current });
    },
    pinnedIndex(stops: readonly CommentStop[]): number | null {
      if (pin === null) return null;
      const index = indexOf(stops, pin.stop);
      if (index === -1) pin.release();
      return index === -1 ? null : index;
    },
    releasePin() {
      pin?.release();
    },
    jump(area: HTMLElement, content: HTMLElement | null, current: number, stop: CommentStop) {
      pin?.release();
      const entry: Pin = { stop, release: () => {} };
      pin = entry;
      publish({ current, jumpMark: { stop, token: (snapshot.jumpMark?.token ?? 0) + 1 } });
      entry.release = pinToTop(
        area,
        content,
        () => locate(area, stop),
        () => {
          if (pin === entry) pin = null;
        },
      );
    },
  };
}

function createJumpControls(
  scrollArea: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
  stops: readonly CommentStop[],
  session: ReturnType<typeof createNavigationSession>,
): Pick<CommentNavigation, "step" | "jumpToFirstThread"> {
  return {
    step(direction) {
      const area = scrollArea.current;
      if (area === null || stops.length === 0) return;
      const index = wrap(
        targetIndex(area, stops, session.pinnedIndex(stops), direction),
        stops.length,
      );
      session.jump(area, content.current, index, stops[index]);
    },
    jumpToFirstThread(threadIds) {
      const area = scrollArea.current;
      if (area === null) return;
      const index = stops.findIndex(({ kind, id }) => kind === "thread" && threadIds.has(id));
      if (index !== -1) session.jump(area, content.current, index, stops[index]);
    },
  };
}

function targetIndex(
  area: HTMLElement,
  stops: readonly CommentStop[],
  pinnedIndex: number | null,
  direction: StepDirection,
): number {
  if (pinnedIndex !== null) return pinnedIndex + direction;
  const current = currentIndex(area, stops);
  const place = locate(area, stops[current]);
  const offset = place === null ? 0 : offsetFromTop(area, place);
  if (direction === 1) {
    const insideUnloadedFile = place?.isCard === false && offset >= -TOP_TOLERANCE_PX;
    return offset > TOP_TOLERANCE_PX || insideUnloadedFile ? current : current + 1;
  }
  return offset < -TOP_TOLERANCE_PX ? current : current - 1;
}

function currentIndex(area: HTMLElement, stops: readonly CommentStop[]): number {
  const index = stops.findIndex((stop) => {
    const place = locate(area, stop);
    return place !== null && offsetFromTop(area, place) >= -TOP_TOLERANCE_PX;
  });
  return index === -1 ? stops.length - 1 : index;
}

function locate(area: HTMLElement, stop: CommentStop): (PinTarget & { isCard: boolean }) | null {
  const card = area.querySelector<HTMLElement>(
    `[${CARD_ATTRIBUTE[stop.kind]}="${CSS.escape(stop.id)}"]`,
  );
  if (card !== null) {
    return { element: card, inset: stickyHeaderHeight(card) + CARD_GAP_PX, isCard: true };
  }
  if (stop.filePath === null) return null;
  const section = area.querySelector<HTMLElement>(
    `section[data-path="${CSS.escape(stop.filePath)}"]`,
  );
  return section === null ? null : { element: section, inset: 0, isCard: false };
}

function indexOf(stops: readonly CommentStop[], stop: CommentStop): number {
  return stops.findIndex(({ kind, id }) => kind === stop.kind && id === stop.id);
}

const CARD_ATTRIBUTE: Record<CommentStop["kind"], string> = {
  thread: "data-review-thread-id",
  draft: "data-comment-draft-id",
};

function wrap(index: number, length: number): number {
  return ((index % length) + length) % length;
}
