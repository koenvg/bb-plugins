import { useEffect, useRef, useState } from "react";
import type { HistoryRequest } from "../history-contract.js";
import { preparationSchema, type PreparationRequest } from "../report-preparation-contract.js";

// One visible page owns one sequential continuation. No background owner or management reads.
const DELAY = 250;
const MAX_BATCHES = 2048;
const MAX_FAILURES = 3;
export function useReportPreparation(
  selection: HistoryRequest | { hostId: null; generation: number },
  selectionPending: boolean,
  selectionRevision: number,
  now: number,
  prepare?: (input: PreparationRequest) => Promise<unknown>,
) {
  const key = `${selection.hostId}:${selection.generation}:${selectionRevision}:${selectionPending}`;
  const latest = useRef(key);
  latest.current = key;
  const api = useRef(prepare);
  api.current = prepare;
  const clock = useRef(now);
  clock.current = now;
  const [epoch, setEpoch] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    state: "pending" | "settled" | "stopped";
    revision: number;
  } | null>(null);
  const refreshAt = useRef(Infinity);
  const cancel = useRef<(() => void) | null>(null);
  const enabled = !!prepare && !!selection.hostId && !selectionPending;
  useEffect(() => {
    const visibility = () => {
      cancel.current?.();
      setEpoch((n) => n + 1);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useEffect(() => {
    if (enabled && document.visibilityState === "visible" && now >= refreshAt.current) {
      refreshAt.current = Infinity;
      setRetry((n) => n + 1);
    }
  }, [now, enabled]);
  useEffect(() => {
    if (!enabled || document.visibilityState !== "visible" || !selection.hostId) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let batches = 0,
      failures = 0,
      stalls = 0;
    let previous = "";
    const frozen = { hostId: selection.hostId, generation: selection.generation };
    const valid = () =>
      !canceled && latest.current === key && document.visibilityState === "visible";
    const stop = () => {
      canceled = true;
      clearTimeout(timer);
    };
    cancel.current = stop;
    refreshAt.current = Infinity;
    setResult((old) => ({ key, state: "pending", revision: old?.key === key ? old.revision : 0 }));
    const stopped = () =>
      setResult((old) => ({
        key,
        state: "stopped",
        revision: old?.key === key ? old.revision : 0,
      }));
    const schedule = (delay: number) => {
      if (valid())
        timer = setTimeout(() => {
          void run();
        }, delay);
    };
    const run = async () => {
      if (!valid()) return;
      try {
        const value = await api.current!({ ...frozen, refresh: batches++ === 0 });
        if (!valid()) return;
        const parsed = preparationSchema.safeParse(value);
        if (!parsed.success || parsed.data.state === "unavailable") {
          stopped();
          return;
        }
        failures = 0;
        if (parsed.data.state === "settled") {
          refreshAt.current = clock.current + 60_000;
          setResult((old) => ({
            key,
            state: "settled",
            revision: (old?.key === key ? old.revision : 0) + 1,
          }));
          return;
        }
        stalls = previous === parsed.data.progress ? stalls + 1 : 0;
        previous = parsed.data.progress;
        if (stalls >= 3 || batches >= MAX_BATCHES) {
          stopped();
          return;
        }
        schedule(DELAY);
      } catch {
        if (!valid()) return;
        if (++failures >= MAX_FAILURES || batches >= MAX_BATCHES) {
          stopped();
          return;
        }
        schedule(DELAY * 2 ** failures);
      }
    };
    // Cancel before dispatch if selection changes in the same commit.
    void Promise.resolve().then(run);
    return stop;
  }, [key, enabled, epoch, retry]);
  return {
    state: enabled && result?.key === key ? result.state : null,
    revision: result?.key === key ? result.revision : 0,
    retry: () => setRetry((n) => n + 1),
  };
}
