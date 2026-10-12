import {
  QuotaCache,
  type QuotaRead,
  type QuotaReason,
  type QuotaView,
} from "../quota/quota-cache.js";
import { ActivityCache } from "../activity/activity-cache.js";
import { emptyActivity, type ActivityRead } from "../activity/activity-contract.js";
import { abortable } from "../activity/activity-cancellation.js";
import type { AuthState } from "./pi-auth.js";
import { accountProof } from "./correlation.js";

export type AccountDependencies = {
  auth(signal: AbortSignal): Promise<AuthState>;
  read(token: string, signal: AbortSignal): Promise<QuotaRead>;
  activityRead?: (token: string, signal: AbortSignal) => Promise<ActivityRead>;
  now?: () => number;
};
const unavailable = (reason: QuotaReason): QuotaView => ({
  state: "unavailable",
  reason,
  snapshot: null,
});

/** Own account checks, independent feed caches, and their complete lifetime. */
export function createAccount(deps: AccountDependencies) {
  const quota = new QuotaCache(deps.now);
  const activity = new ActivityCache(deps.now);
  const lifecycle = new AbortController();
  const readSignal = (request: AbortSignal) =>
    AbortSignal.any([request, lifecycle.signal, AbortSignal.timeout(12_000)]);
  const authenticate = (signal: AbortSignal) =>
    abortable(
      Promise.resolve().then(() => {
        signal.throwIfAborted();
        return deps.auth(signal);
      }),
      signal,
      null,
    );
  const recheck = async (signal: AbortSignal) => {
    const auth = await authenticate(signal);
    return auth?.status === "ok" ? auth.identity : null;
  };
  return {
    async observation(
      challenge: string,
      refresh: boolean,
      includeActivity: boolean,
      request: AbortSignal,
    ) {
      const signal = readSignal(request);
      const auth = await authenticate(signal);
      const empty = (reason: QuotaReason) => ({
        proof: null,
        quota: unavailable(reason),
        activity: emptyActivity(reason),
      });
      if (!auth || auth.status !== "ok") {
        quota.invalidate();
        activity.invalidate();
        return empty(auth?.status ?? "auth-check-failed");
      }
      const [quotaView, activityView] = await Promise.all([
        quota.read(
          auth.identity,
          () => deps.read(auth.token, signal),
          () => recheck(signal),
          refresh,
          signal,
        ),
        includeActivity
          ? activity.read(
              auth.identity,
              (loadSignal) =>
                deps.activityRead?.(auth.token, loadSignal) ??
                Promise.resolve({ status: "unsupported", snapshot: null }),
              () => recheck(signal),
              refresh,
              signal,
            )
          : Promise.resolve(emptyActivity("unavailable")),
      ]);
      if (signal.aborted || (await recheck(signal)) !== auth.identity)
        return empty("identity-changed");
      return {
        proof: accountProof(auth.token, challenge),
        quota: quotaView,
        activity: activityView,
      };
    },
    dispose() {
      lifecycle.abort();
      quota.invalidate();
      activity.dispose();
    },
    async quota(refresh: boolean, request: AbortSignal): Promise<QuotaView> {
      const signal = readSignal(request);
      const auth = await authenticate(signal);
      if (signal.aborted) return unavailable("selection-changed");
      if (!auth || auth.status !== "ok") {
        quota.invalidate();
        return unavailable(auth?.status ?? "auth-check-failed");
      }
      return abortable(
        quota.read(
          auth.identity,
          () => deps.read(auth.token, signal),
          () => recheck(signal),
          refresh,
          signal,
        ),
        signal,
        unavailable("selection-changed"),
      );
    },
    async activity(refresh: boolean, request: AbortSignal) {
      const signal = readSignal(request);
      const auth = await authenticate(signal);
      if (signal.aborted) return emptyActivity("selection-changed");
      if (!auth || auth.status !== "ok") {
        activity.invalidate();
        return emptyActivity(auth?.status ?? "auth-check-failed");
      }
      return activity.read(
        auth.identity,
        (loadSignal) =>
          deps.activityRead
            ? deps.activityRead(auth.token, loadSignal)
            : Promise.resolve({ status: "unsupported", snapshot: null }),
        () => recheck(signal),
        refresh,
        signal,
      );
    },
  };
}
