import { ActivityCache } from "./activity-cache.js";
import { emptyActivity, type ActivityRead } from "./activity-contract.js";
import { abortable } from "./activity-cancellation.js";
import type { QuotaReason } from "./quota-cache.js";

type Auth =
  | { status: "ok"; token: string; identity: string }
  | { status: Exclude<QuotaReason, "ok"> };
export function createActivityHostReader(deps: {
  auth(signal: AbortSignal): Promise<Auth>;
  read(token: string, signal: AbortSignal): Promise<ActivityRead>;
  now?: () => number;
}) {
  const cache = new ActivityCache(deps.now);
  const lifecycle = new AbortController();
  return {
    dispose() {
      lifecycle.abort();
      cache.dispose();
    },
    async read(refresh: boolean, requestSignal: AbortSignal) {
      const signal = AbortSignal.any([
        requestSignal,
        lifecycle.signal,
        AbortSignal.timeout(12_000),
      ]);
      if (signal.aborted) return emptyActivity("selection-changed");
      const auth = await abortable(
        Promise.resolve().then(() => deps.auth(signal)),
        signal,
        null,
      );
      if (signal.aborted) return emptyActivity("selection-changed");
      if (!auth || auth.status !== "ok") {
        cache.invalidate();
        return emptyActivity(auth?.status ?? "auth-check-failed");
      }
      return cache.read(
        auth.identity,
        (loadSignal) => deps.read(auth.token, loadSignal),
        async () => {
          const latest = await deps.auth(signal);
          return latest.status === "ok" ? latest.identity : null;
        },
        refresh,
        signal,
      );
    },
  };
}
