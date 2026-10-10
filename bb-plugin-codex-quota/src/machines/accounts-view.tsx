import { visibleView } from "../account/freshness.js";
import { resetCountdown } from "../quota/reset-countdown.js";
import { QuotaOtherLimits } from "../quota/quota-view.js";
import { ActivityPanel } from "../activity/activity-view.js";
import { footerAllowance } from "./accounts-store.js";
import type { MachineAccounts } from "./machines-contract.js";

export function accountDetails(data: MachineAccounts | null, now: number) {
  if (!data) return ["Account allowance unavailable"];
  return data.accounts.map((account, index) => {
    const view = visibleView(account.quota, now);
    const binding = view.snapshot?.general.find(
      (window) => window.id === view.snapshot?.bindingWindowId,
    );
    const machines = account.machines
      .map((id) => data.machines.find((machine) => machine.id === id)?.name ?? "Machine")
      .join(", ");
    return `${data.accounts.length === 1 && account.identity === "verified" ? "Shared account" : `Account ${index + 1}`}; ${machines}; ${view.state}; ${view.snapshot?.bindingRemainingPercent ?? "unknown"}% remaining; ${binding?.name ?? "window unknown"}; ${resetCountdown(binding?.resetAt ?? null, now)}; ${view.snapshot ? `observed ${new Date(view.snapshot.observedAt).toLocaleString()}` : "no observation"}${account.identity === "unknown" ? "; account identity unverified" : ""}`;
  });
}
export function AccountsTooltip({ data, now }: { data: MachineAccounts | null; now: number }) {
  const summary = footerAllowance(data, now);
  return (
    <div className="max-h-[60vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-border bg-popover p-4 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">
        {data?.accounts.length === 1 && !summary.known
          ? "Account allowance"
          : summary.known
            ? "Lowest known account allowance"
            : "Lowest account allowance"}
      </p>
      <p className="mt-1 text-muted-foreground">
        {summary.known
          ? "Some account allowance is unavailable or unverified."
          : "Shared accounts count once. Percentages are not added."}
      </p>
      {data?.accounts.map((account, index) => {
        const view = visibleView(account.quota, now);
        const binding = view.snapshot?.general.find(
          (window) => window.id === view.snapshot?.bindingWindowId,
        );
        return (
          <div key={account.key} className="mt-3 flex gap-3 border-t border-border pt-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {data.accounts.length === 1 && account.identity === "verified"
                  ? "Shared account"
                  : `Account ${index + 1}`}
              </p>
              <p className="mt-1 text-muted-foreground [overflow-wrap:anywhere]">
                {account.machines
                  .map(
                    (id) => data.machines.find((machine) => machine.id === id)?.name ?? "Machine",
                  )
                  .join(" · ")}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums">
                {view.snapshot?.bindingRemainingPercent == null
                  ? "Unavailable"
                  : `${view.snapshot.bindingRemainingPercent}%`}
              </p>
              <p className="text-muted-foreground">{view.state}</p>
              <p className="mt-1 text-muted-foreground">{binding?.name ?? "Window unknown"}</p>
              <p className="text-muted-foreground tabular-nums">
                {resetCountdown(binding?.resetAt ?? null, now)}
              </p>
            </div>
          </div>
        );
      })}
      <p className="mt-3 text-muted-foreground">Click to open all-machine usage.</p>
    </div>
  );
}
export function AccountsOverview({
  data,
  now,
  loading = false,
}: {
  data: MachineAccounts | null;
  now: number;
  loading?: boolean;
}) {
  const single =
    data?.accounts.length === 1 && data.accounts[0]!.identity === "verified" && !data.truncated;
  return (
    <section className="mt-7 min-w-0" aria-label="Account allowance">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Account allowance</h2>
        <span className="text-xs text-muted-foreground">
          Account-wide, separate from recorded usage
        </span>
      </div>
      {!data?.accounts.length ? (
        <p className="text-sm text-muted-foreground">
          Account allowance unavailable. Enroll a persistent machine with Pi Codex sign-in.
        </p>
      ) : (
        <div className={single ? "" : "grid grid-cols-1 gap-3 sm:grid-cols-2"}>
          {data.accounts.map((account, index) => {
            const view = visibleView(account.quota, now),
              snapshot = view.snapshot;
            const binding = snapshot?.general.find(
              (window) => window.id === snapshot.bindingWindowId,
            );
            return (
              <section
                key={account.key}
                aria-label={single ? "Shared account allowance" : `Account ${index + 1} allowance`}
                className={
                  single
                    ? "flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-border py-3"
                    : "min-w-0 rounded-md border border-border p-4"
                }
              >
                {!single && (
                  <>
                    <h3 className="text-sm font-medium">
                      {account.identity === "unknown"
                        ? "Account identity unavailable"
                        : `Account ${index + 1}`}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {account.machines
                        .map(
                          (id) =>
                            data.machines.find((machine) => machine.id === id)?.name ?? "Machine",
                        )
                        .join(" · ")}
                    </p>
                  </>
                )}
                <p className={`${single ? "text-2xl" : "mt-3 text-xl"} font-semibold tabular-nums`}>
                  {snapshot?.bindingRemainingPercent == null
                    ? "Unavailable"
                    : `${snapshot.bindingRemainingPercent}%`}{" "}
                  {snapshot?.bindingRemainingPercent != null && (
                    <span className="text-xs font-normal text-muted-foreground">remaining</span>
                  )}
                </p>
                <div className={single ? "text-xs" : "mt-2 text-xs"}>
                  {binding && (
                    <p className="tabular-nums">
                      {binding.name} window · {resetCountdown(binding.resetAt, now)}
                    </p>
                  )}
                  {snapshot?.general
                    .filter((window) => window.id !== binding?.id)
                    .map((window) => (
                      <p key={window.id} className="mt-1 text-muted-foreground tabular-nums">
                        {window.name}: {window.remainingPercent}% remaining ·{" "}
                        {resetCountdown(window.resetAt, now)}
                      </p>
                    ))}
                  <p
                    role="status"
                    className="mt-1 text-muted-foreground"
                    title={
                      snapshot
                        ? `Observed ${new Date(snapshot.observedAt).toLocaleString()}`
                        : view.reason
                    }
                  >
                    {view.state === "fresh"
                      ? "Fresh"
                      : view.state === "stale"
                        ? "Stale"
                        : "Unavailable"}
                    {loading ? " · updating" : ""}
                    {!single && snapshot
                      ? ` · observed ${new Date(snapshot.observedAt).toLocaleString()}`
                      : ""}
                  </p>
                  {!single && snapshot && (
                    <p className="mt-1 text-muted-foreground">
                      Banked resets: {snapshot.bankedResets ?? "Unknown"}
                    </p>
                  )}
                </div>
                {!!snapshot?.additional.length && (
                  <div className="w-full">
                    <QuotaOtherLimits view={view} now={now} />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      <a
        className="mt-3 inline-block rounded-sm text-xs text-muted-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
        href="https://chatgpt.com/codex/settings/usage"
        target="_blank"
        rel="noreferrer"
      >
        Open Codex Usage
      </a>
      <p className="mt-1 text-xs text-muted-foreground">
        Your browser sign-in can differ from the machines’ Pi accounts.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Account activity is counted once per account and is not added to the recorded usage chart.
      </p>
      {!!data?.machines.some((machine) => machine.status !== "connected") && (
        <p className="mt-1 text-xs text-muted-foreground">
          Account bindings for offline machines are last-known. Their current sign-in cannot be
          verified.
        </p>
      )}
    </section>
  );
}
export function AccountsActivity({
  data,
  now,
  loading,
  refresh,
}: {
  data: MachineAccounts | null;
  now: number;
  loading: boolean;
  refresh(): void;
}) {
  return (
    <section className="mt-5 text-sm" aria-label="Account-wide activity">
      <h2 className="font-medium">Account-wide activity</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Each verified account appears once. Activity does not fill gaps in recorded machine usage.
      </p>
      <button
        className="mt-3 min-h-9 rounded-md border border-border px-3 text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
        onClick={refresh}
        disabled={loading}
      >
        Refresh account activity
      </button>
      {data?.accounts.map((account, index) => (
        <div key={account.key} className="mt-4">
          <h3 className="text-xs font-medium">
            {data.accounts.length === 1 ? "Shared account" : `Account ${index + 1}`}
          </h3>
          <ActivityPanel view={account.activity} now={now} loading={loading} onRefresh={refresh} />
        </div>
      ))}
    </section>
  );
}
