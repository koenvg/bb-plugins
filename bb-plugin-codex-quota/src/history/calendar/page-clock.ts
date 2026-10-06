import { useEffect, useState } from "react";

/** Visible-page wall time for report age and date labels. It does not use quota observations. */
export function usePageClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    const visibility = () => {
      clearInterval(timer);
      tick();
      if (document.visibilityState === "visible") timer = setInterval(tick, 1000);
    };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", tick);
    };
  }, []);
  return now;
}
