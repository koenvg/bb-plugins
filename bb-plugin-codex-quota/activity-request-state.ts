import { activityViewSchema, emptyActivity, type ActivityView } from "./activity-contract.js";
import { visibleActivity } from "./activity-cache.js";
import { abortable } from "./activity-cancellation.js";
import { FRESH_MS } from "./freshness.js";

export type ActivitySelection = { hostId: string | null; generation: number };
export type ActivityApi = (
  input: { hostId: string; generation: number; refresh: boolean },
  signal: AbortSignal,
) => Promise<unknown>;
type State = { view: ActivityView; loading: boolean; now: number };
/** Per disclosure. The host cache coalesces clients; no quota or history calls exist here. */
export class ActivityRequestState {
  private selection: ActivitySelection = { hostId: null, generation: 0 };
  private active = false;
  private sequence = 0;
  private controller: AbortController | null = null;
  private pending: Promise<void> | null = null;
  private lastAttempt = -Infinity;
  private dueAt = 0;
  private listeners = new Set<() => void>();
  private state: State;
  constructor(
    private readonly read: ActivityApi,
    private readonly now: () => number = Date.now,
  ) {
    this.state = { view: emptyActivity(), loading: false, now: now() };
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private publish(state: State) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  open(selection: ActivitySelection): void {
    this.close();
    this.selection = selection;
    this.active = true;
    this.lastAttempt = -Infinity;
    this.dueAt = 0;
    this.publish({
      view: emptyActivity(selection.hostId ? "unavailable" : "no-selection"),
      loading: false,
      now: this.now(),
    });
  }
  close(): void {
    this.active = false;
    this.sequence++;
    this.controller?.abort();
    this.controller = null;
    this.pending = null;
    this.publish({ view: emptyActivity(), loading: false, now: this.now() });
  }
  tick(): void {
    this.publish({
      ...this.state,
      now: this.now(),
      view: visibleActivity(this.state.view, this.now()),
    });
  }
  refresh(force = false): Promise<void> {
    if (!this.active || !this.selection.hostId) return Promise.resolve();
    if (this.pending) return this.pending;
    const now = this.now();
    if (now - this.lastAttempt < 30_000 || (!force && now < this.dueAt)) return Promise.resolve();
    this.lastAttempt = now;
    const sequence = ++this.sequence;
    const input = {
      hostId: this.selection.hostId,
      generation: this.selection.generation,
      refresh: force,
    };
    const controller = new AbortController();
    this.controller = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
    this.publish({ ...this.state, loading: true, now });
    const task = (async () => {
      const result = await abortable(
        Promise.resolve().then(() => {
          if (!this.active || sequence !== this.sequence || signal.aborted) return null;
          return this.read(input, signal);
        }),
        signal,
        null,
      );
      if (!this.active || sequence !== this.sequence || controller.signal.aborted) return;
      const parsed = activityViewSchema.safeParse(result);
      // Only a host-confirmed stale observation can survive. A wire failure cannot confirm identity.
      const view = visibleActivity(
        parsed.success
          ? parsed.data
          : emptyActivity(result === null ? "host-offline" : "unsupported"),
        this.now(),
      );
      this.dueAt =
        view.state === "fresh" && view.snapshot
          ? Date.parse(view.snapshot.observedAt) + FRESH_MS
          : this.now() + 30_000;
      this.publish({ view, loading: false, now: this.now() });
    })();
    this.pending = task;
    void task.then(() => {
      if (this.pending === task) this.pending = null;
    });
    return task;
  }
}
