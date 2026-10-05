import type { QuotaStatus } from "./contract.js";
import { visibleView } from "./freshness.js";

export type Selection = { hostId: string | null; generation: number };
export type QuotaApi = {
  selection(): Promise<Selection>;
  selectHost(input: { hostId: string | null }): Promise<Selection>;
  read(input: { hostId: string; generation: number; refresh?: boolean }): Promise<QuotaStatus>;
};
type State = {
  selection: Selection;
  view: QuotaStatus;
  loading: boolean;
  ready: boolean;
  hasActiveOwner: boolean;
  now: number;
};
type RefreshOwner = {
  api: QuotaApi;
  timer: ReturnType<typeof setTimeout> | null;
  aging: ReturnType<typeof setInterval> | null;
  dueAt: number;
  failures: number;
  release: () => void;
};
const unavailable = (reason: "no-selection" | "foreign-host" | "host-offline"): QuotaStatus => ({
  state: "unavailable",
  reason,
  snapshot: null,
});

/** App-window memory only. One start/dispose owner drives refresh; views only subscribe.
 * The injected clock and platform timers are the testable time boundary.
 * Revisions invalidate every async phase on selection changes or owner disposal.
 */
export class QuotaSelectionStore {
  private state: State;
  private owners = 0;
  private listeners = new Set<() => void>();
  private revision = 0;
  private connecting: Promise<boolean> | null = null;
  private reading: { key: string; promise: Promise<void> } | null = null;
  private selecting: number | null = null;
  private owner: RefreshOwner | null = null;
  private disposed = false;

  constructor(private readonly now: () => number = () => Date.now()) {
    this.state = {
      selection: { hostId: null, generation: 0 },
      view: unavailable("no-selection"),
      loading: false,
      ready: false,
      hasActiveOwner: false,
      now: now(),
    };
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private publish(next: Partial<State>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  /** An owner supplies clock ticks and revalidation; passive icons are not owners. */
  retainOwner(): () => void {
    if (++this.owners === 1) this.publish({ hasActiveOwner: true });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--this.owners === 0) this.publish({ hasActiveOwner: false });
    };
  }

  start(api: QuotaApi): () => void {
    if (this.owner) this.stop(this.owner);
    this.disposed = false;
    this.revision++;
    this.connecting = null;
    this.reading = null;
    this.selecting = null;
    this.publish({
      selection: { hostId: null, generation: 0 },
      view: unavailable("no-selection"),
      loading: false,
      ready: false,
      now: this.now(),
    });
    const owner: RefreshOwner = {
      api,
      timer: null,
      aging: null,
      dueAt: 0,
      failures: 0,
      release: this.retainOwner(),
    };
    this.owner = owner;
    owner.aging = setInterval(() => this.tick(), 1000);
    void this.run(owner, false);
    return () => this.stop(owner);
  }

  private stop(owner: RefreshOwner): void {
    if (owner.timer !== null) clearTimeout(owner.timer);
    if (owner.aging !== null) clearInterval(owner.aging);
    owner.timer = owner.aging = null;
    owner.release();
    if (this.owner !== owner) return;
    this.owner = null;
    this.disposed = true;
    this.revision++;
    this.connecting = null;
    this.reading = null;
    this.selecting = null;
  }

  async resume(): Promise<void> {
    if (this.disposed) return;
    this.tick();
    if (this.owner) await this.run(this.owner, true, true);
  }

  private async run(owner: RefreshOwner, force: boolean, onlyIfDue = false): Promise<void> {
    if (this.selecting !== null) return;
    const revision = this.revision;
    const before = this.state.selection;
    const synced = await this.connect(owner.api);
    if (this.owner !== owner) return;
    if (onlyIfDue && this.now() < owner.dueAt) {
      if (owner.timer === null && Number.isFinite(owner.dueAt))
        this.schedule(owner, owner.dueAt - this.now());
      return;
    }
    if (!synced) {
      if (this.revision === revision) this.settled(owner);
      return;
    }
    if (!this.state.selection.hostId) {
      this.schedule(owner, 60_000);
      return;
    }
    const changed =
      before.hostId !== this.state.selection.hostId ||
      before.generation !== this.state.selection.generation;
    await this.refresh(owner.api, force && !changed);
  }

  private schedule(owner: RefreshOwner, delay: number): void {
    if (this.owner !== owner) return;
    if (owner.timer !== null) clearTimeout(owner.timer);
    owner.dueAt = this.now() + delay;
    owner.timer = setTimeout(() => {
      owner.timer = null;
      void this.run(owner, true, true);
    }, delay);
  }

  private resetSchedule(owner: RefreshOwner): void {
    if (owner.timer !== null) clearTimeout(owner.timer);
    owner.timer = null;
    owner.dueAt = 0;
    owner.failures = 0;
  }

  private settled(owner: RefreshOwner): void {
    // A fulfilled stale/unavailable response is still a failure, not recovery.
    const success = this.state.view.state === "fresh";
    owner.failures = success ? 0 : owner.failures + 1;
    this.schedule(
      owner,
      success ? 60_000 : Math.min(60_000 * 2 ** Math.min(owner.failures - 1, 3), 300_000),
    );
  }

  async connect(api: QuotaApi): Promise<boolean> {
    if (this.disposed || this.selecting !== null) return false;
    if (this.connecting) return this.connecting;
    const revision = this.revision;
    const task = (async () => {
      try {
        const selection = await api.selection();
        if (this.revision !== revision) return false;
        const changed =
          selection.hostId !== this.state.selection.hostId ||
          selection.generation !== this.state.selection.generation;
        if (changed) {
          this.revision++;
          this.reading = null;
          if (this.owner) this.resetSchedule(this.owner);
          this.publish({
            selection,
            view: unavailable("no-selection"),
            ready: selection.hostId === null,
            loading: false,
          });
        } else if (!this.state.ready && selection.hostId === null) {
          this.publish({ ready: true });
        }
        return true;
      } catch {
        if (this.revision !== revision) return false;
        const previous = visibleView(this.state.view, this.now());
        this.publish({
          view: previous.snapshot
            ? { state: "stale", reason: "host-offline", snapshot: previous.snapshot }
            : unavailable("host-offline"),
          loading: false,
          ready: true,
        });
        return false;
      }
    })();
    this.connecting = task;
    try {
      return await task;
    } finally {
      if (this.connecting === task) this.connecting = null;
    }
  }

  async selectHost(api: QuotaApi, hostId: string | null): Promise<void> {
    if (this.disposed) return;
    const revision = ++this.revision;
    this.selecting = revision;
    this.connecting = null;
    if (this.owner) this.resetSchedule(this.owner);
    this.reading = null;
    this.publish({ view: unavailable("no-selection"), loading: true, ready: false });
    try {
      const selection = await api.selectHost({ hostId });
      if (this.revision !== revision) return;
      this.selecting = null;
      this.publish({
        selection,
        view: unavailable(selection.hostId === hostId ? "no-selection" : "foreign-host"),
        loading: false,
        ready: selection.hostId !== hostId || hostId === null,
      });
      if (selection.hostId === hostId && hostId !== null) await this.refresh(api);
    } catch {
      if (this.revision === revision) {
        this.selecting = null;
        this.publish({ view: unavailable("host-offline"), loading: false, ready: true });
      }
    } finally {
      if (this.owner && this.revision === revision && this.owner.timer === null && !this.reading) {
        if (!this.state.selection.hostId && this.state.view.reason === "no-selection")
          this.schedule(this.owner, 60_000);
        else this.settled(this.owner);
      }
    }
  }

  async refresh(api: QuotaApi, force = false): Promise<void> {
    if (this.disposed || this.selecting !== null) return;
    const { hostId, generation } = this.state.selection;
    if (!hostId) return;
    const revision = this.revision;
    const key = `${revision}:${hostId}:${generation}`;
    if (this.reading?.key === key) return this.reading.promise;
    const owner = this.owner;
    if (owner) {
      if (owner.timer !== null) clearTimeout(owner.timer);
      owner.timer = null;
      owner.dueAt = Infinity;
    }
    this.publish({ view: visibleView(this.state.view, this.now()), loading: true });
    const task = (async () => {
      try {
        const result = await api.read({ hostId, generation, refresh: force });
        if (
          this.revision === revision &&
          this.state.selection.hostId === hostId &&
          this.state.selection.generation === generation
        ) {
          this.publish({
            view: visibleView(result, this.now()),
            loading: false,
            ready: true,
            now: this.now(),
          });
        }
      } catch {
        if (this.revision === revision) {
          const previous = visibleView(this.state.view, this.now());
          const view: QuotaStatus = previous.snapshot
            ? { state: "stale", reason: "host-offline", snapshot: previous.snapshot }
            : unavailable("host-offline");
          this.publish({ view, loading: false, ready: true });
        }
      }
    })();
    this.reading = { key, promise: task };
    try {
      await task;
    } finally {
      if (this.reading?.promise === task) this.reading = null;
      if (owner && this.owner === owner && this.revision === revision) this.settled(owner);
    }
  }

  tick(at = this.now()): void {
    const visible = visibleView(this.state.view, at);
    const minuteChanged = Math.floor(at / 60_000) !== Math.floor(this.state.now / 60_000);
    if (visible !== this.state.view || (visible.snapshot && minuteChanged)) {
      this.publish({ view: visible, now: at });
    }
  }
}
