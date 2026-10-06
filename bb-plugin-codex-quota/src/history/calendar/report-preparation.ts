import { useEffect, useRef, useState } from "react";
import type { HistoryRequest } from "../history-contract.js";
import { preparationSchema, type PreparationRequest } from "../report-preparation-contract.js";

// One visible page owns one sequential loop. Quota, dates and metrics do not drive it.
const DELAY = 250;
const REFRESH = 60_000;
const MAX_BATCHES = 2048;
const MAX_FAILURES = 3;
type State = "pending" | "settled" | "stopped";
export function useReportPreparation(
  selection: HistoryRequest | { hostId: null; generation: number },
  selectionPending: boolean,
  selectionRevision: number,
  prepare?: (input: PreparationRequest) => Promise<unknown>,
) {
  const key = `${selection.hostId}:${selection.generation}:${selectionRevision}:${selectionPending}`;
  const latest = useRef(key);
  latest.current = key;
  const api = useRef(prepare);
  api.current = prepare;
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; state: State; revision: number } | null>(
    null,
  );
  const enabled = !!prepare && !!selection.hostId && !selectionPending;
  useEffect(() => {
    if (!enabled || !selection.hostId) return;
    let disposed = false;
    let visibilityEpoch = 0;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let phase: State = "pending";
    let refreshAt = 0;
    let batches = 0,
      failures = 0,
      stalls = 0;
    let previous = "";
    const frozen = { hostId: selection.hostId, generation: selection.generation };
    const valid = () =>
      !disposed && latest.current === key && document.visibilityState === "visible";
    const publish = (state: State) => {
      phase = state;
      setResult((old) => ({
        key,
        state,
        revision: (old?.key === key ? old.revision : 0) + (state === "settled" ? 1 : 0),
      }));
    };
    const schedule = (delay: number) => {
      clearTimeout(timer);
      if (valid() && phase !== "stopped")
        timer = setTimeout(() => {
          void run();
        }, delay);
    };
    const run = async () => {
      if (!valid() || inFlight || phase === "stopped") return;
      if (phase === "settled") {
        const remaining = refreshAt - Date.now();
        if (remaining > 0) {
          schedule(remaining);
          return;
        }
        batches = failures = stalls = 0;
        previous = "";
        publish("pending");
      }
      if (batches >= MAX_BATCHES) {
        publish("stopped");
        return;
      }
      const epoch = visibilityEpoch;
      inFlight = true;
      try {
        const value = await api.current!({ ...frozen, refresh: batches++ === 0 });
        if (!valid() || epoch !== visibilityEpoch) return;
        const parsed = preparationSchema.safeParse(value);
        if (!parsed.success || parsed.data.state === "unavailable") {
          publish("stopped");
          return;
        }
        failures = 0;
        if (parsed.data.state === "settled") {
          refreshAt = Date.now() + REFRESH;
          publish("settled");
          schedule(REFRESH);
          return;
        }
        stalls = previous === parsed.data.progress ? stalls + 1 : 0;
        previous = parsed.data.progress;
        if (stalls >= MAX_FAILURES || batches >= MAX_BATCHES) {
          publish("stopped");
          return;
        }
        schedule(DELAY);
      } catch {
        if (!valid() || epoch !== visibilityEpoch) return;
        if (++failures >= MAX_FAILURES || batches >= MAX_BATCHES) {
          publish("stopped");
          return;
        }
        schedule(DELAY * 2 ** failures);
      } finally {
        inFlight = false;
        // A resumed page waits for its retired request before continuing through durable cursors.
        if (epoch !== visibilityEpoch) schedule(0);
      }
    };
    const visibility = () => {
      visibilityEpoch++;
      clearTimeout(timer);
      if (valid()) schedule(0);
    };
    document.addEventListener("visibilitychange", visibility);
    publish("pending");
    // Recheck selection and visibility immediately before the initial dispatch.
    void Promise.resolve().then(run);
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [key, enabled, retry]);
  return {
    state: enabled && result?.key === key ? result.state : null,
    revision: result?.key === key ? result.revision : 0,
    retry: () => setRetry((n) => n + 1),
  };
}
