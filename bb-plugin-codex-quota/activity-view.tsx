import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { emptyActivity, type ActivityView } from "./activity-contract.js";
import { visibleActivity } from "./activity-cache.js";
import { ActivityRequestState, type ActivityApi, type ActivitySelection } from "./activity-request-state.js";

const count = (value: number | null) => value === null ? "Unknown" : value.toLocaleString("en-US", { maximumFractionDigits: 20 });
const labels = { lifetimeTokens: "Lifetime tokens", peakDailyTokens: "Peak daily tokens", longestTurnSeconds: "Longest turn, seconds",
  currentStreakDays: "Current streak, days", longestStreakDays: "Longest streak, days" };
function diagnostic(view: ActivityView): string {
  if (view.reason === "no-selection") return "Select a host to view account activity.";
  if (view.reason === "expired") return "Observation expired. Account activity unavailable.";
  if (view.reason.startsWith("auth") || view.reason.startsWith("oauth") || view.reason === "credential-store-failed") return "Pi Codex sign-in required or unavailable on this host.";
  return `Account activity ${view.state}. Status: ${view.reason}.`;
}
export function ActivityPanel({ view, now, loading = false, selectionPending = false, onRefresh }: { view: ActivityView; now: number; loading?: boolean; selectionPending?: boolean; onRefresh(): void }) {
  const visible = selectionPending ? emptyActivity("selection-changed") : visibleActivity(view, now);
  const [mode, setMode] = useState<"daily" | "weekly" | "cumulative">("daily");
  const rows = visible.snapshot?.[mode];
  return <section className="min-w-0 pt-4" aria-label="Account-wide token activity" aria-busy={loading || selectionPending}>
    <p className="text-sm text-muted-foreground">Account-wide Codex activity, not selected-host Pi usage. These values do not prove who owns old local records. They do not fill local gaps or set prices.</p>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm" role="status" aria-label="Account activity status">{selectionPending ? "Changing selected host. Account activity is pending." : `${loading ? "Updating account activity. " : ""}${diagnostic(visible)}`}</p>
      <button type="button" className="rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50" disabled={selectionPending || loading || visible.reason === "no-selection"} onClick={onRefresh}>Refresh activity</button>
    </div>
    {visible.snapshot && <>
      <p className="mt-2 break-words text-xs text-muted-foreground">{visible.state === "stale" ? "Stale. " : ""}Observed <time dateTime={visible.snapshot.observedAt}>{new Date(visible.snapshot.observedAt).toLocaleString()}</time>. Failed updates do not change this time.</p>
      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Object.entries(labels).map(([key, label]) => <div key={key} className="min-w-0 rounded-md border border-border p-3">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-words font-medium tabular-nums">{count(visible.snapshot!.summary[key as keyof typeof labels])}</dd>
        </div>)}
      </dl>
      <label className="mt-4 flex flex-wrap items-center gap-2 text-sm">Activity period
        <select aria-label="Account activity period" value={mode} onChange={event => setMode(event.target.value as typeof mode)} className="rounded-md border border-border bg-background px-2 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="cumulative">Cumulative</option>
        </select>
      </label>
      <p className="mt-2 text-xs text-muted-foreground">UTC dates from returned daily buckets only. Weeks start Monday. Cumulative values are not lifetime totals. Missing dates remain unknown.</p>
      {rows === null || rows === undefined ? <p className="mt-3 text-sm">{mode} activity unknown.</p> : rows.length === 0 ? <p className="mt-3 text-sm">No activity buckets returned. Unreported dates remain unknown.</p> :
        <div role="region" aria-label={`Account-wide ${mode} token table`} tabIndex={0} className="mt-3 max-h-64 w-full overflow-auto focus-visible:outline-2 focus-visible:outline-ring">
          <table className="w-full text-left text-sm tabular-nums"><caption className="sr-only">Account-wide {mode} tokens, UTC dates</caption>
            <thead><tr><th scope="col" className="px-3 py-2">UTC date</th><th scope="col" className="px-3 py-2 text-right">Tokens</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.date} className="border-t border-border"><th scope="row" className="whitespace-nowrap px-3 py-2 font-normal">{row.date}</th><td className="whitespace-nowrap px-3 py-2 text-right">{count(row.tokens)}</td></tr>)}</tbody>
          </table>
        </div>}
    </>}
  </section>;
}
function ActivityBody({ selection, read }: { selection: ActivitySelection; read: ActivityApi }) {
  const readRef = useRef(read); readRef.current = read;
  const [store] = useState(() => new ActivityRequestState((input, signal) => readRef.current(input, signal)));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    let visible = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const synchronize = () => {
      const next = document.visibilityState === "visible";
      if (next !== visible) {
        visible = next;
        if (next) { store.open(selection); timer = setInterval(synchronize, 1000); }
        else { if (timer !== null) clearInterval(timer); timer = null; store.close(); }
      }
      if (visible) { store.tick(); void store.refresh(); }
    };
    synchronize();
    document.addEventListener("visibilitychange", synchronize); window.addEventListener("focus", synchronize);
    return () => { if (timer !== null) clearInterval(timer); document.removeEventListener("visibilitychange", synchronize); window.removeEventListener("focus", synchronize); store.close(); };
  }, [store, selection.hostId, selection.generation]);
  return <ActivityPanel view={state.view} now={state.now} loading={state.loading} onRefresh={() => { void store.refresh(true); }} />;
}
export function AccountActivity({ selection, selectionPending = false, selectionRevision = 0, read }: { selection: ActivitySelection; selectionPending?: boolean; selectionRevision?: number; read: ActivityApi }) {
  const [open, setOpen] = useState(false);
  return <details className="mt-8 min-w-0 border-t border-border pt-4" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">Account details and activity</summary>
    {open && (selectionPending
      ? <ActivityPanel view={emptyActivity("selection-changed")} now={Date.now()} selectionPending onRefresh={() => {}} />
      : <ActivityBody key={`${selection.hostId}/${selection.generation}/${selectionRevision}`} selection={selection} read={read} />)}
  </details>;
}
