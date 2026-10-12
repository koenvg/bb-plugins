import { accountsSchema, type MachineAccounts } from "./machines-contract.js";
import { visibleView } from "../account/freshness.js";
import type { QuotaStatus } from "../quota/contract.js";

export type AccountsApi = (input: {
  refresh: boolean;
  includeActivity: boolean;
}) => Promise<unknown>;
type State = {
  data: MachineAccounts | null;
  loading: boolean;
  failed: boolean;
  now: number;
  owners: number;
};
/** One app-window owner for account refresh; footer and icon subscribers are passive. */
export class MachineAccountsStore {
  private state: State = { data: null, loading: false, failed: false, now: Date.now(), owners: 0 };
  private listeners = new Set<() => void>();
  private api: AccountsApi | null = null;
  private apis = new Set<{ api: AccountsApi }>();
  private generation = 0;
  private nextReadAt = 0;
  private failures = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private clock?: ReturnType<typeof setInterval>;
  private inFlight: Promise<void> | null = null;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  start(api: AccountsApi) {
    this.api = api;
    const owner = { api };
    this.apis.add(owner);
    this.set({ owners: this.state.owners + 1 });
    if (this.state.owners === 1) {
      this.nextReadAt = 0;
      this.failures = 0;
      this.clock = setInterval(() => {
        this.set({ now: Date.now() });
      }, 1000);
      void this.refresh(false);
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.apis.delete(owner);
      this.api = [...this.apis].at(-1)?.api ?? null;
      this.set({ owners: this.state.owners - 1 });
      if (!this.state.owners) {
        this.generation++;
        clearTimeout(this.timer);
        clearInterval(this.clock);
        this.api = null;
        this.inFlight = null;
        this.set({ loading: false, data: null, failed: false });
      }
    };
  }
  refresh = (force = true, includeActivity = false): Promise<void> => {
    if (this.inFlight) {
      const pending = this.inFlight;
      return includeActivity ? pending.then(() => this.refresh(force, true)) : pending;
    }
    if (!this.api || !this.state.owners) return Promise.resolve();
    if (!force && !includeActivity && Date.now() < this.nextReadAt) return Promise.resolve();
    const api = this.api,
      generation = this.generation;
    clearTimeout(this.timer);
    this.set({ loading: true, now: Date.now() });
    const valid = () => generation === this.generation && this.state.owners > 0;
    const run = Promise.resolve()
      .then(() => (valid() ? api({ refresh: force, includeActivity }) : null))
      .then((raw) => {
        if (!valid()) return;
        const parsed = accountsSchema.parse(raw);
        // An allowance-only refresh must not overwrite an independently loaded activity observation.
        const old = this.state.data;
        if (!includeActivity && old)
          for (const account of parsed.accounts) {
            const previous = old.accounts.find((value) => value.key === account.key);
            if (previous) account.activity = previous.activity;
          }
        this.set({ data: parsed, failed: false });
      })
      .catch(() => {
        if (!valid()) return;
        const data = this.state.data;
        this.set({
          failed: true,
          data: data
            ? {
                ...data,
                accounts: data.accounts.map((account) => ({
                  ...account,
                  quota: account.quota.snapshot
                    ? { ...account.quota, state: "stale", reason: "network" }
                    : account.quota,
                  activity: account.activity.snapshot
                    ? { ...account.activity, state: "stale", reason: "network" }
                    : account.activity,
                })),
              }
            : null,
        });
      })
      .finally(() => {
        if (!valid()) return;
        this.inFlight = null;
        this.set({ loading: false, now: Date.now() });
        const success =
          !this.state.failed &&
          (!this.state.data?.accounts.length ||
            this.state.data.accounts.some(
              (account) => visibleView(account.quota, Date.now()).state === "fresh",
            ));
        this.failures = success ? 0 : this.failures + 1;
        const delay = success
          ? 60_000
          : Math.min(60_000 * 2 ** Math.min(this.failures - 1, 3), 300_000);
        this.nextReadAt = Date.now() + delay;
        this.timer = setTimeout(() => {
          void this.refresh(false);
        }, delay);
      });
    this.inFlight = run;
    return run;
  };
}
export function footerAllowance(data: MachineAccounts | null, now: number, active = true) {
  const empty: QuotaStatus = { state: "unavailable", reason: "unavailable", snapshot: null };
  if (!active || !data) return { view: empty, known: false, label: "—" };
  const views = data.accounts.map((account) => visibleView(account.quota, now));
  const fresh = views.filter(
    (view) =>
      view.state === "fresh" &&
      view.snapshot?.bindingRemainingPercent !== null &&
      view.snapshot !== null,
  );
  const lowest = fresh.sort(
    (a, b) => a.snapshot!.bindingRemainingPercent! - b.snapshot!.bindingRemainingPercent!,
  )[0];
  if (!lowest) return { view: empty, known: false, label: "—" };
  const known =
    data.truncated ||
    data.machines.some((machine) => machine.status !== "connected") ||
    fresh.length !== views.length ||
    data.accounts.some((account) => account.identity === "unknown");
  return { view: lowest, known, label: `${lowest.snapshot!.bindingRemainingPercent}%` };
}
