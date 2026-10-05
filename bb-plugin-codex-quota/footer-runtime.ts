import { mountFooterAdapter, type FooterTarget } from "./footer-adapter.js";

/** Connects content-script lifetime to the app-wide React owner, within one window. */
export class QuotaFooterRuntime {
  private targets: readonly FooterTarget[] = [];
  private listeners = new Set<() => void>();
  private adapter: ReturnType<typeof mountFooterAdapter> | null = null;
  private navigate: (() => void) | null = null;
  private pending = false;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.targets;
  private publish = () => {
    this.targets = this.adapter?.getSnapshot() ?? [];
    for (const listener of this.listeners) listener();
  };

  mount(pluginId: string, signal: AbortSignal): () => void {
    if (signal.aborted) return () => {};
    const adapter = mountFooterAdapter(document, pluginId);
    this.adapter = adapter;
    const unsubscribe = adapter.subscribe(this.publish);
    adapter.setNavigationReady(this.navigate !== null);
    this.publish();
    let stopped = false;
    const dispose = () => {
      if (stopped) return;
      stopped = true;
      signal.removeEventListener("abort", dispose);
      unsubscribe();
      adapter.dispose();
      if (this.adapter !== adapter) return;
      this.adapter = null;
      this.navigate = null;
      this.pending = false;
      this.publish();
    };
    signal.addEventListener("abort", dispose, { once: true });
    return dispose;
  }

  activate = () => {
    if (!this.adapter) return;
    if (this.navigate) this.navigate();
    else this.pending = true;
  };

  bindNavigation(navigate: () => void): () => void {
    this.navigate = navigate;
    this.adapter?.setNavigationReady(true);
    if (this.pending && this.adapter) {
      this.pending = false;
      navigate();
    }
    return () => {
      if (this.navigate !== navigate) return;
      this.navigate = null;
      this.pending = false;
      this.adapter?.setNavigationReady(false);
    };
  }
}
