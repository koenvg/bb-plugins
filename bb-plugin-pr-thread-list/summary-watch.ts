import type { Summaries } from "./contract";
import { summariesFingerprint } from "./summaries";

export const SUMMARIES_CHANGED_CHANNEL = "summaries.changed";
export const WATCH_INTERVAL_MS = 5_000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    try {
      const timer = setTimeout(done, ms);
      signal.addEventListener("abort", done, { once: true });
      function done() {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        resolve();
      }
    } catch (setupError) {
      reject(setupError);
    }
    return promise;
  }
}

export async function watchSummaries({
  read,
  onChange,
  signal,
}: {
  read: () => Promise<Summaries>;
  onChange: () => void;
  signal: AbortSignal;
}): Promise<void> {
  const aborted = (() => {
    const { promise, resolve, reject } = Promise.withResolvers<null>();
    try {
      signal.addEventListener("abort", () => resolve(null), { once: true });
    } catch (setupError) {
      reject(setupError);
    }
    return promise;
  })();
  let last: string | null = null;
  {
    const runStep = async () => {
      const summaries = await Promise.race([read().catch(() => null), aborted]);
      if (signal.aborted) return { kind: "return", value: undefined } as const;
      if (summaries !== null) {
        const next = summariesFingerprint(summaries);
        if (last !== null && next !== last) onChange();
        last = next;
      }
      await sleep(WATCH_INTERVAL_MS, signal);
    };
    for await (const stepResult of (async function* () {
      while (!signal.aborted) yield runStep();
    })()) {
      if (stepResult?.kind === "return") return stepResult.value;
    }
  }
}
