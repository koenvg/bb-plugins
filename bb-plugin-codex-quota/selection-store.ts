import type { QuotaStatus } from "./contract.js";
import { visibleView } from "./freshness.js";

export type Selection = { hostId: string | null; generation: number };
export type QuotaApi = {
  selection(): Promise<Selection>;
  selectHost(input: { hostId: string | null }): Promise<Selection>;
  read(input: { hostId: string; generation: number; refresh?: boolean }): Promise<QuotaStatus>;
};
type State = { selection: Selection; view: QuotaStatus; loading: boolean; ready: boolean; now: number };
const unavailable = (reason: "no-selection" | "foreign-host" | "host-offline"): QuotaStatus =>
  ({ state: "unavailable", reason, snapshot: null });

/** App-window memory only. Selection and the bounded view are shared by badge and page. */
export class QuotaSelectionStore {
  private state: State;
  private listeners = new Set<() => void>();
  private revision = 0;
  private connecting: Promise<void> | null = null;
  private reading: { key: string; promise: Promise<void> } | null = null;
  constructor(private readonly now: () => number = () => Date.now()) {
    this.state = { selection: { hostId: null, generation: 0 }, view: unavailable("no-selection"), loading: false, ready: false, now: now() };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private publish(next: Partial<State>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  async connect(api: QuotaApi): Promise<void> {
    if (this.connecting) return this.connecting;
    const revision = ++this.revision;
    this.reading = null;
    const previous = visibleView(this.state.view, this.now());
    if (previous.snapshot) this.publish({
      view: previous.state === "fresh" ? { state: "stale", reason: "aged", snapshot: previous.snapshot } : previous,
      loading: true,
    });
    const task = (async () => {
      try {
        const selection = await api.selection();
        if (this.revision !== revision) return;
        const changed = selection.hostId !== this.state.selection.hostId || selection.generation !== this.state.selection.generation;
        if (changed) {
          this.revision++;
          this.publish({ selection, view: unavailable("no-selection"), ready: selection.hostId === null, loading: false });
        } else if (!this.state.ready && selection.hostId === null) {
          this.publish({ ready: true });
        }
      } catch {
        if (this.revision !== revision) return;
        const previous = visibleView(this.state.view, this.now());
        this.publish({
          view: previous.snapshot ? { state: "stale", reason: "host-offline", snapshot: previous.snapshot } : unavailable("host-offline"),
          loading: false, ready: true,
        });
      }
    })();
    this.connecting = task;
    try { await task; } finally { if (this.connecting === task) this.connecting = null; }
  }

  async selectHost(api: QuotaApi, hostId: string | null): Promise<void> {
    const revision = ++this.revision;
    this.reading = null;
    this.publish({ view: unavailable("no-selection"), loading: true, ready: false });
    try {
      const selection = await api.selectHost({ hostId });
      if (this.revision !== revision) return;
      this.publish({ selection, view: unavailable(selection.hostId === hostId ? "no-selection" : "foreign-host"),
        loading: false, ready: selection.hostId !== hostId || hostId === null });
      if (selection.hostId === hostId && hostId !== null) await this.refresh(api);
    } catch {
      if (this.revision === revision) this.publish({ view: unavailable("host-offline"), loading: false, ready: true });
    }
  }

  async refresh(api: QuotaApi, force = false): Promise<void> {
    const { hostId, generation } = this.state.selection;
    if (!hostId) return;
    const revision = this.revision;
    const key = `${revision}:${hostId}:${generation}`;
    if (this.reading?.key === key) return this.reading.promise;
    const visible = visibleView(this.state.view, this.now());
    this.publish({ view: visible, loading: true });
    const task = (async () => {
      try {
        const result = await api.read({ hostId, generation, refresh: force });
        if (this.revision === revision && this.state.selection.hostId === hostId && this.state.selection.generation === generation) {
          this.publish({ view: visibleView(result, this.now()), loading: false, ready: true, now: this.now() });
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
    try { await task; } finally { if (this.reading?.promise === task) this.reading = null; }
  }

  tick(at = this.now()): void {
    const visible = visibleView(this.state.view, at);
    if (visible !== this.state.view) this.publish({ view: visible, now: at });
  }
}
