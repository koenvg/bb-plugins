import { useId } from "react";
import type { QuotaStatus } from "./contract.js";
import { visibleView } from "./freshness.js";
import { resetCountdown } from "./reset-countdown.js";
import { QuotaSelect } from "./quota-select.js";
export type QuotaSummaryProps = {
  view: QuotaStatus;
  now: number;
  loading?: boolean;
  ready?: boolean;
  selectedHostId: string | null;
  hosts: { id: string; name: string; status: "connected" | "disconnected" | "unknown" }[];
  onHostChange(hostId: string | null): void;
  onRefresh(): void;
};
const observedText = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
function statusText(view: QuotaStatus, selectedHostId: string | null) {
  if (!selectedHostId) return "Select a host to view Codex quota.";
  if (
    [
      "auth-required",
      "auth-no-token",
      "auth-expired",
      "oauth-refresh-failed",
      "auth-unavailable",
      "credential-store-failed",
    ].includes(view.reason)
  )
    return "Pi Codex sign-in required or unavailable on this host.";
  if (view.reason === "host-offline") return "Selected host is offline. Quota unavailable.";
  if (view.reason === "expired") return "Observation expired. Quota unavailable.";
  return "Quota unavailable. Try refreshing or check Codex Usage.";
}
export function QuotaSummary({
  view,
  selectedHostId,
  hosts,
  loading,
  ready = true,
  now,
  onHostChange,
  onRefresh,
}: QuotaSummaryProps) {
  const accountNote = useId();
  const visible = visibleView(view, now),
    snapshot = ready ? visible.snapshot : null;
  const binding = snapshot?.general.find((window) => window.id === snapshot.bindingWindowId);
  const status = !ready
    ? ""
    : snapshot
      ? [
          snapshot.bindingRemainingPercent == null ? "Allowance unavailable" : "",
          loading
            ? `${visible.state === "stale" ? "Stale · updating" : "Updating"} · last checked ${observedText(snapshot.observedAt)}`
            : visible.state === "stale"
              ? `Stale · updated ${observedText(snapshot.observedAt)}`
              : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : statusText(visible, selectedHostId);
  return (
    <header className="flex items-start justify-between gap-2">
      <section
        className="min-w-0 flex-1 text-xs text-muted-foreground"
        aria-label="Codex allowance summary"
        aria-busy={!ready}
      >
        <h2
          className="text-2xl font-semibold tabular-nums text-foreground sm:text-3xl"
          aria-label={
            snapshot?.bindingRemainingPercent == null
              ? !ready
                ? "Allowance pending"
                : selectedHostId
                  ? "Allowance unavailable"
                  : "No host selected"
              : undefined
          }
        >
          {snapshot?.bindingRemainingPercent != null
            ? `${snapshot.bindingRemainingPercent}% remaining`
            : "—"}
        </h2>
        {binding && (
          <p className="mt-1">
            {resetCountdown(binding.resetAt, now)} · {binding.name} window
          </p>
        )}
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-9 items-center leading-none underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
            aria-label="Refresh allowance"
            disabled={!selectedHostId || !!loading}
            onClick={onRefresh}
          >
            Refresh
          </button>
          <a
            className="inline-flex h-9 items-center leading-none font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="Open Codex Usage"
            aria-describedby={accountNote}
            href="https://chatgpt.com/codex/settings/usage"
            target="_blank"
            rel="noopener noreferrer"
          >
            Codex Usage
          </a>
        </div>
        <p
          className={
            status
              ? `mt-2 ${visible.state === "stale" && !loading ? "text-destructive" : ""}`
              : "sr-only"
          }
          role="status"
        >
          {status}
        </p>
        <p className="sr-only" id={accountNote}>
          Browser account may differ from this host.
        </p>
      </section>
      <QuotaSelect
        aria-label="Codex host"
        containerClassName="w-44 max-w-[42vw]"
        title={hosts.find((host) => host.id === selectedHostId)?.name}
        value={selectedHostId ?? ""}
        onChange={(event) => onHostChange(event.target.value || null)}
      >
        <option value="">Select host</option>
        {hosts.map((host) => (
          <option key={host.id} value={host.id}>
            {host.name}
            {host.status === "disconnected" ? " (offline)" : ""}
          </option>
        ))}
      </QuotaSelect>
    </header>
  );
}
