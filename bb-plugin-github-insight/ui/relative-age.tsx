import { useCallback, useLayoutEffect, useRef } from "react";
import { relativeTime } from "../core/relative-time";

export const RelativeAge = ({
  date,
  dateTime,
  title,
  className,
}: {
  date: Date;
  dateTime?: string;
  title?: string;
  className?: string;
}) => {
  const node = useRef<HTMLElement | null>(null);
  const attach = useCallback((element: HTMLElement | null) => {
    node.current = element;
  }, []);
  useLayoutEffect(() => {
    const element = node.current;
    if (element === null) return;
    const age = relativeTime(date, new Date());
    if (element.textContent !== age) element.textContent = age;
  });

  return dateTime === undefined ? (
    <span ref={attach} title={title} className={className} />
  ) : (
    <time ref={attach} dateTime={dateTime} title={title} className={className} />
  );
};
