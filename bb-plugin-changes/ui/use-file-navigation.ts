import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const PIN_SETTLE_MS = 1000;
const POINTER_SCROLL_EVENTS = ["wheel", "touchstart", "pointerdown"] as const;

export interface FileNavigation {
  current: string | null;
  jumpTo(path: string): void;
}

export function useFileNavigation(
  scrollArea: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
  paths: readonly string[],
): FileNavigation {
  const [current, setCurrent] = useState<string | null>(null);
  const stopPin = useRef<(() => void) | null>(null);

  const updateCurrent = useCallback(() => {
    const area = scrollArea.current;
    if (area === null) return;
    setCurrent(topSectionPath(area) ?? paths[0] ?? null);
  }, [scrollArea, paths]);

  useEffect(() => {
    const area = scrollArea.current;
    if (area === null) return;
    updateCurrent();
    let frame: number | null = null;
    const onScroll = () => {
      if (stopPin.current !== null || frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        updateCurrent();
      });
    };
    area.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      area.removeEventListener("scroll", onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [scrollArea, updateCurrent]);

  useEffect(() => () => stopPin.current?.(), []);

  const jumpTo = useCallback(
    (path: string) => {
      stopPin.current?.();
      const area = scrollArea.current;
      const section = area?.querySelector<HTMLElement>(`section[data-path="${CSS.escape(path)}"]`);
      if (area == null || section == null) return;
      const align = () => {
        if (!section.isConnected) return stop();
        area.scrollTop += section.getBoundingClientRect().top - area.getBoundingClientRect().top;
      };
      align();
      setCurrent(path);

      let timer = setTimeout(stop, PIN_SETTLE_MS);
      const observer = new ResizeObserver(() => {
        align();
        clearTimeout(timer);
        timer = setTimeout(stop, PIN_SETTLE_MS);
      });
      if (content.current !== null) observer.observe(content.current);
      for (const event of POINTER_SCROLL_EVENTS)
        area.addEventListener(event, stop, { passive: true });
      document.addEventListener("keydown", stop);

      function stop() {
        clearTimeout(timer);
        observer.disconnect();
        for (const event of POINTER_SCROLL_EVENTS) area!.removeEventListener(event, stop);
        document.removeEventListener("keydown", stop);
        stopPin.current = null;
      }
      stopPin.current = stop;
    },
    [scrollArea, content],
  );

  return { current, jumpTo };
}

function topSectionPath(area: HTMLElement): string | null {
  const areaTop = area.getBoundingClientRect().top;
  for (const section of Array.from(area.querySelectorAll<HTMLElement>("section[data-path]"))) {
    if (section.getBoundingClientRect().bottom > areaTop + 1) return section.dataset.path ?? null;
  }
  return null;
}
