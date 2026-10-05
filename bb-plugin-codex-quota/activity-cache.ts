import {
  activitySnapshotSchema,
  emptyActivity,
  type ActivityRead,
  type ActivitySnapshot,
  type ActivityView,
} from "./activity-contract.js";
import { abortable } from "./activity-cancellation.js";
import { FRESH_MS, MAX_AGE_MS } from "./freshness.js";

export function visibleActivity(view: ActivityView, now: number): ActivityView {
  if (!view.snapshot) return view;
  const age = now - Date.parse(view.snapshot.observedAt);
  if (!Number.isFinite(age) || age < 0 || age >= MAX_AGE_MS) return emptyActivity("expired");
  return age >= FRESH_MS && view.state === "fresh"
    ? { ...view, state: "stale", reason: "aged" }
    : view;
}
/** One selected host worker. Never persist or publish identities or credentials. */
export class ActivityCache {
  private identity: string | null = null;
  private snapshot: ActivitySnapshot | null = null;
  private failure: ActivityView["reason"] | null = null;
  private pending: { promise: Promise<ActivityRead>; controller: AbortController } | null = null;
  private epoch = new AbortController();
  private generation = 0;
  private lastAttempt = -Infinity;
  private disposed = false;
  constructor(private readonly now: () => number = Date.now) {}
  invalidate(): void {
    this.generation++;
    this.epoch.abort();
    this.epoch = new AbortController();
    this.pending?.controller.abort();
    this.pending = null;
    this.identity = null;
    this.snapshot = null;
    this.failure = null;
  }
  dispose(): void {
    this.disposed = true;
    this.invalidate();
  }
  peek(identity: string): ActivityView {
    if (this.identity !== identity || !this.snapshot) return emptyActivity();
    const view = visibleActivity(
      {
        state: this.failure ? "stale" : "fresh",
        reason: this.failure ?? "ok",
        snapshot: this.snapshot,
      },
      this.now(),
    );
    if (!view.snapshot) {
      this.snapshot = null;
      this.failure = null;
    }
    return view;
  }
  async read(
    identity: string,
    load: (signal: AbortSignal) => Promise<ActivityRead>,
    recheck: () => Promise<string | null>,
    force = false,
    signal?: AbortSignal,
  ): Promise<ActivityView> {
    if (this.disposed || signal?.aborted) return emptyActivity("selection-changed");
    if (this.identity !== identity) {
      this.invalidate();
      this.identity = identity;
    }
    const generation = this.generation;
    const current = this.peek(identity);
    if (
      !this.pending &&
      (force || current.state !== "fresh") &&
      this.now() - this.lastAttempt >= 30_000
    ) {
      this.lastAttempt = this.now();
      const controller = new AbortController();
      const combined = AbortSignal.any([
        controller.signal,
        ...(signal ? [signal] : []),
        AbortSignal.timeout(12_000),
      ]);
      const promise = abortable(
        Promise.resolve().then(() => load(combined)),
        combined,
        { status: "network", snapshot: null } as ActivityRead,
      );
      const pending = { promise, controller };
      this.pending = pending;
      void promise.then(() => {
        if (this.pending === pending) this.pending = null;
      });
    }
    const waitSignal = AbortSignal.any([
      this.epoch.signal,
      ...(signal ? [signal] : []),
      AbortSignal.timeout(12_000),
    ]);
    const result = this.pending ? await abortable(this.pending.promise, waitSignal, null) : null;
    if (waitSignal.aborted || this.disposed || generation !== this.generation)
      return emptyActivity("selection-changed");
    const checked = await abortable(Promise.resolve().then(recheck), waitSignal, null);
    if (waitSignal.aborted || this.disposed || generation !== this.generation)
      return emptyActivity("selection-changed");
    if (checked !== identity) {
      this.invalidate();
      return emptyActivity(checked === null ? "identity-unavailable" : "identity-changed");
    }
    if (result) {
      const parsed =
        result.status === "ok" ? activitySnapshotSchema.safeParse(result.snapshot) : null;
      if (parsed?.success) {
        this.snapshot = parsed.data;
        this.failure = null;
      } else this.failure = result.status === "ok" ? "unsupported" : result.status;
    }
    const retained = this.peek(identity);
    return retained.snapshot ? retained : emptyActivity(this.failure ?? retained.reason);
  }
}
