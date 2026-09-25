import type { QuotaStatus } from "./contract.js";
import type { QuotaWindow } from "./quota.js";
import { visibleView } from "./freshness.js";

const USAGE_URL = "https://chatgpt.com/codex/settings/usage";
const percentText = (value: number): string => `${value}%`;
const dateText = (value: string): string => new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
}).format(new Date(value));
const observedText = (value: string): string => new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short",
}).format(new Date(value));
function WindowRow({ window }: { window: QuotaWindow }) {
  return (
    <li className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{window.name}</div>
        <div className="text-xs text-muted-foreground">{window.resetAt ? `Resets ${dateText(window.resetAt)}` : "Reset unknown"}</div>
      </div>
      <div className="tabular-nums text-sm font-semibold" aria-label={`${percentText(window.remainingPercent)} remaining`}>{percentText(window.remainingPercent)}</div>
    </li>
  );
}

function statusText(view: QuotaStatus, selectedHostId: string | null): string {
  if (!selectedHostId) return "Select a host to view Codex quota.";
  if (["auth-required", "auth-no-token", "auth-expired", "oauth-refresh-failed", "auth-unavailable", "credential-store-failed"].includes(view.reason)) {
    return "Pi Codex sign-in required or unavailable on this host.";
  }
  if (view.reason === "host-offline") return "Selected host is offline. Quota unavailable.";
  if (view.reason === "expired") return "Observation expired. Quota unavailable.";
  return "Quota unavailable. Try refreshing or check Codex Usage.";
}

type Props = {
  view: QuotaStatus;
  selectedHostId: string | null;
  hosts: { id: string; name: string; status: "connected" | "disconnected" | "unknown" }[];
  loading?: boolean;
  ready?: boolean;
  now: number;
  onHostChange(hostId: string | null): void;
  onRefresh(): void;
};

/** Pure page body: the host owns the navigation row, panel chrome, and keyboard activation. */
export function QuotaDashboard({ view, selectedHostId, hosts, loading, ready = true, now, onHostChange, onRefresh }: Props) {
  const visible = visibleView(view, now);
  const snapshot = ready ? visible.snapshot : null;
  const binding = snapshot?.general.find((window) => window.id === snapshot.bindingWindowId);
  const status = !ready ? "" : snapshot
    ? `${snapshot.bindingRemainingPercent == null ? "Allowance unavailable · " : ""}${loading ? `Updating · last checked ${observedText(snapshot.observedAt)}`
      : `${visible.state === "stale" ? "Stale · updated" : "Updated"} ${observedText(snapshot.observedAt)}`}`
    : statusText(visible, selectedHostId);
  return (
    <main className="h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl px-5 py-8 md:px-8 md:py-10">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">Allowance</h1>
          <div className="flex items-center gap-2">
            <select aria-label="Codex host" className="h-9 w-44 max-w-[50vw] rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              value={selectedHostId ?? ""} onChange={(event) => onHostChange(event.target.value || null)}>
              <option value="">Select host</option>
              {hosts.map((host) => <option key={host.id} value={host.id}>{host.name}{host.status === "disconnected" ? " (offline)" : ""}</option>)}
            </select>
            <button type="button" className="h-9 rounded-md border border-border px-3 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
              disabled={!selectedHostId || !!loading} onClick={onRefresh}>Refresh</button>
          </div>
        </header>

        <section className="min-h-48 pb-8 pt-10" aria-label="Codex allowance summary" aria-busy={!ready}>
          <h2 className="text-4xl font-semibold tracking-tight tabular-nums" aria-label={snapshot?.bindingRemainingPercent == null
            ? !ready ? "Allowance pending" : selectedHostId ? "Allowance unavailable" : "No host selected" : undefined}>
            {snapshot?.bindingRemainingPercent != null ? `${percentText(snapshot.bindingRemainingPercent)} remaining` : "—"}
          </h2>
          <p className="mt-2 min-h-5 text-sm text-muted-foreground">{binding ? `${binding.name} window` : "\u00a0"}</p>
          <p className={`mt-1 min-h-5 text-sm ${visible.state === "stale" && ready && !loading ? "text-destructive" : "text-muted-foreground"}`} role="status">
            {status || "\u00a0"}
          </p>
        </section>

        <section className="min-h-36 border-t border-border py-4" aria-label="General allowance windows">
          <h2 className="text-sm font-semibold">Windows</h2>
          {snapshot?.general.length ? <ul className="mt-2">{snapshot.general.map((window) => <WindowRow key={window.id} window={window} />)}</ul>
            : <div className="flex min-h-16 items-center text-sm text-muted-foreground">
              {ready && selectedHostId && visible.state === "unavailable" ? "No window data available." : "\u00a0"}
            </div>}
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-border pt-4 text-sm">
          <p>Banked resets <span className="ml-2 tabular-nums text-muted-foreground">{!ready ? "—" : snapshot?.bankedResets == null
            ? "Unknown" : `${snapshot.bankedResets} available`}</span></p>
          <a className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            href={USAGE_URL} target="_blank" rel="noopener noreferrer">Open Codex Usage ↗</a>
        </footer>
        <p className="mt-3 text-xs text-muted-foreground">Browser account may differ from this host.</p>

        {!!snapshot?.additional.length && <details className="mt-8 border-t border-border pt-4">
          <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">Other limits</summary>
          {snapshot.additional.map((group, index) => (
            <section key={`${group.name}-${index}`} className="pt-4" aria-label={`${group.name} allowance`}>
              <h3 className="text-sm font-medium">{group.name}</h3>
              <ul>{group.windows.map((window) => <WindowRow key={window.id} window={window} />)}</ul>
            </section>
          ))}
        </details>}
      </div>
    </main>
  );
}

export function QuotaBadge({ view, hostName, now, loading = false, ready = true }: { view: QuotaStatus; hostName: string | null; now: number; loading?: boolean; ready?: boolean }) {
  const visible = visibleView(view, now);
  const snapshot = ready ? visible.snapshot : null;
  const binding = snapshot?.general.find((window) => window.id === snapshot.bindingWindowId);
  const remaining = ready && !loading && visible.state === "fresh" ? snapshot?.bindingRemainingPercent ?? null : null;
  const label = [
    hostName ?? "No selected host",
    binding?.name ?? "general window unknown",
    !ready || loading ? "updating" : visible.state,
    remaining === null ? null : `${percentText(remaining)} remaining`,
    snapshot ? `observed ${dateText(snapshot.observedAt)}` : "no observation",
  ].filter(Boolean).join("; ");
  const text = remaining !== null ? percentText(remaining) : ready && !loading && visible.state === "stale" ? "Stale" : "—";
  return <span className="inline-block w-10 truncate text-right text-xs font-semibold tabular-nums text-foreground" aria-label={label} title={label}>{text}</span>;
}
