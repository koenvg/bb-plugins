import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { pinToTop } from "../../review-ui/pin-to-top";

export interface FileNavigation {
  current: string | null;
  jumpTo: (path: string) => void;
}

export function useFileNavigation(
  scrollArea: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
  paths: readonly string[],
): FileNavigation {
  const [current, setCurrent] = useState<string | null>(null);
  const stopPin = useRef<(() => void) | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const area = scrollArea.current;
    if (area === null) {
      return;
    }
    const measure = () => {
      if (frame.current !== null) {
        return;
      }
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        setCurrent(topSectionPath(area) ?? paths[0] ?? null);
      });
    };
    const onScroll = () => {
      if (stopPin.current === null) {
        measure();
      }
    };
    measure();
    area.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      area.removeEventListener("scroll", onScroll);
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [scrollArea, paths]);

  useEffect(() => () => stopPin.current?.(), []);

  function jumpTo(path: string) {
    stopPin.current?.();
    const area = scrollArea.current;
    const section = area?.querySelector<HTMLElement>(`section[data-path="${CSS.escape(path)}"]`);
    if (area == null || section == null) {
      return;
    }
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    setCurrent(path);
    stopPin.current = pinToTop(
      area,
      content.current,
      () => ({ element: section, inset: 0 }),
      () => {
        stopPin.current = null;
      },
    );
  }

  return {
    current: current !== null && paths.includes(current) ? current : (paths[0] ?? null),
    jumpTo,
  };
}

function topSectionPath(area: HTMLElement): string | null {
  const areaTop = area.getBoundingClientRect().top;
  for (const section of Array.from(area.querySelectorAll<HTMLElement>("section[data-path]"))) {
    if (section.getBoundingClientRect().bottom > areaTop + 1) {
      return section.dataset.path ?? null;
    }
  }
  return null;
}
