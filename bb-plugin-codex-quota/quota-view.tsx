import type { ReactNode } from "react";
import type { QuotaStatus } from "./contract.js";
import type { QuotaWindow } from "./quota.js";
import { visibleView } from "./freshness.js";
import { resetCountdown } from "./reset-countdown.js";
import { QuotaSummary, type QuotaSummaryProps } from "./quota-summary.js";

const percentText = (value: number): string => `${value}%`;
const dateText = (value: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
function WindowRow({ window, now }: { window: QuotaWindow; now: number }) {
  const hasReset = window.resetAt !== null && Number.isFinite(Date.parse(window.resetAt));
  return (
    <li className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{window.name}</div>
        <div className="text-xs text-muted-foreground">{resetCountdown(window.resetAt, now)}</div>
        {hasReset && (
          <div className="text-xs text-muted-foreground">{`Resets ${dateText(window.resetAt!)}`}</div>
        )}
      </div>
      <div
        className="tabular-nums text-sm font-semibold"
        aria-label={`${percentText(window.remainingPercent)} remaining`}
      >
        {percentText(window.remainingPercent)}
      </div>
    </li>
  );
}

type Props = QuotaSummaryProps & {
  history?: ReactNode;
  children?: ReactNode;
};

/** Pure page body: the host owns the navigation row, panel chrome, and keyboard activation. */
export function QuotaDashboard({ history, children, ...summary }: Props) {
  return (
    <main className="h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl px-5 py-5 md:px-8 md:py-6">
        <h1 className="sr-only">Usage</h1>
        <QuotaSummary {...summary} />
        {children}
        {history}
      </div>
    </main>
  );
}
export function QuotaOtherLimits({ view, now }: { view: QuotaStatus; now: number }) {
  const snapshot = visibleView(view, now).snapshot;
  return snapshot?.additional.length ? (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">
        Other limits
      </summary>
      {snapshot.additional.map((group, index) => (
        <section
          key={`${group.name}-${index}`}
          className="pt-4"
          aria-label={`${group.name} allowance`}
        >
          <h3 className="text-sm font-medium">{group.name}</h3>
          <ul>
            {group.windows.map((window) => (
              <WindowRow key={window.id} window={window} now={now} />
            ))}
          </ul>
        </section>
      ))}
    </details>
  ) : null;
}

function freshRemaining(visible: QuotaStatus, ready: boolean): number | null {
  return ready && visible.state === "fresh"
    ? (visible.snapshot?.bindingRemainingPercent ?? null)
    : null;
}

export function QuotaBattery({
  view,
  now,
  ready = true,
  className,
}: {
  view: QuotaStatus;
  now: number;
  ready?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const remaining = freshRemaining(visibleView(view, now), ready);
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
      focusable="false"
      data-quota-battery=""
    >
      <rect x="2" y="6" width="18" height="12" rx="2" />
      <path d="M22 10v4" strokeLinecap="round" />
      {remaining !== null && (
        <rect
          data-battery-fill={remaining}
          x="4.5"
          y="8.5"
          width={(13 * remaining) / 100}
          height="7"
          rx=".75"
          fill="currentColor"
          stroke="none"
        />
      )}
    </svg>
  );
}

export function QuotaBadge({
  view,
  hostName,
  now,
  loading = false,
  ready = true,
  descriptionId,
}: {
  view: QuotaStatus;
  hostName: string | null;
  now: number;
  loading?: boolean;
  ready?: boolean;
  descriptionId?: string;
}) {
  const visible = visibleView(view, now);
  const snapshot = ready ? visible.snapshot : null;
  const binding = snapshot?.general.find((window) => window.id === snapshot.bindingWindowId);
  const remaining = freshRemaining(visible, ready);
  const label = [
    hostName ?? "No selected host",
    binding?.name ?? "general window unknown",
    !ready ? "updating" : loading ? `${visible.state}, updating` : visible.state,
    remaining === null ? null : `${percentText(remaining)} remaining`,
    snapshot ? `observed ${dateText(snapshot.observedAt)}` : "no observation",
  ]
    .filter(Boolean)
    .join("; ");
  const text =
    remaining !== null
      ? percentText(remaining)
      : ready && visible.state === "stale"
        ? "Stale"
        : "—";
  return (
    <>
      <span
        className="inline-block w-10 truncate text-right text-xs font-semibold tabular-nums text-foreground"
        aria-label={label}
        title={label}
      >
        {text}
      </span>
      {descriptionId && (
        <span id={descriptionId} className="sr-only">
          {label}
        </span>
      )}
    </>
  );
}
