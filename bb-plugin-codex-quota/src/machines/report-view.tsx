import { useMemo, useState } from "react";
import { tokenCountText } from "../token-counts.js";
import { CalendarValues, reportButton } from "../history/calendar/calendar-view.js";
import { useReportPreparation } from "../history/calendar/report-preparation.js";
import { latestStart, shiftDate, validTimezone } from "../history/calendar/calendar-time.js";
import { compactEstimate } from "../history/calendar/calendar-money-view.js";
import type { CalendarQuery } from "../history/calendar/calendar-contract.js";
import type { PreparationRequest } from "../history/report-preparation-contract.js";
import { useMachineReport } from "./use-report.js";
import type { SnapshotReader } from "./use-report.js";

const allMachines = { hostId: "all-machines", generation: 0 };
interface Props {
  now: number;
  read: (input: { query: CalendarQuery; prepare: boolean; refresh: boolean }) => Promise<unknown>;
  snapshot?: SnapshotReader;
  prepare: (input: PreparationRequest) => Promise<unknown>;
}
/** Existing visible-page preparation owns ingestion. Date and metric changes remain read-only. */
export const MachineReportPanel = ({ now, read, snapshot, prepare }: Props) => {
  const [timezone] = useState(() => {
    try {
      const value = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return validTimezone(value) ? value : "";
    } catch {
      return "";
    }
  });
  const preparation = useReportPreparation(
    timezone ? allMachines : { hostId: null, generation: 0 },
    false,
    0,
    prepare,
  );
  const [start, setStart] = useState(() => (timezone ? latestStart(now, timezone) : "1970-01-01"));
  const [metric, setMetric] = useState<"tokens" | "cost">("tokens");
  const query = useMemo<CalendarQuery>(
    () => ({
      startDate: start,
      timezone: timezone || "UTC",
      group: "workspace",
      scope: { kind: "host" },
      includeUncertain: true,
    }),
    [start, timezone],
  );
  const { current, view, loading, refreshing, failed, retry } = useMachineReport(
    timezone ? query : null,
    preparation.revision,
    read,
    snapshot,
  );
  const cached = current?.machines.filter((row) => row.cached).map((row) => row.machine.name) ?? [];
  const missing =
    current?.machines
      .filter((row) => row.report.state === "unavailable")
      .map((row) => row.machine.name) ?? [];
  const stale = failed || (!!view && now - Date.parse(view.observedAt) > 5 * 60_000);
  const tokenSubtotal =
    view && (view.summary.totalTokens > 0 || view.days.every((day) => day.coverage.zero))
      ? tokenCountText(view.summary.totalTokens)
      : null;
  if (!timezone) {
    return (
      <section
        aria-label="All-machine recorded usage"
        className="min-h-[400px] text-sm text-muted-foreground"
      >
        Viewer time zone unavailable. Reopen the dashboard after you set a valid time zone.
      </section>
    );
  }
  const handleRetry = preparation.retry;
  return (
    <section
      className="@container min-w-0 text-sm"
      aria-label="All-machine recorded usage"
      aria-busy={loading || refreshing}
    >
      <div className="flex flex-col items-start gap-3 @sm:flex-row @sm:flex-wrap @sm:items-center @sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="basis-full text-xs tabular-nums text-muted-foreground @sm:mr-2 @sm:basis-auto">
            {start} – {shiftDate(start, 29)}
          </span>
          <button
            type="button"
            className={reportButton}
            aria-label="Previous 30 days"
            disabled={loading || !view?.previous}
            onClick={() => setStart(shiftDate(start, -30))}
          >
            Previous
          </button>
          <button
            type="button"
            className={reportButton}
            aria-label="Next 30 days"
            disabled={loading || !view?.next}
            onClick={() => setStart(shiftDate(start, 30))}
          >
            Next
          </button>
          <button
            type="button"
            className={reportButton}
            onClick={() => setStart(latestStart(Date.now(), timezone))}
          >
            Latest
          </button>
        </div>
        <fieldset
          className="m-0 inline-flex min-w-0 max-w-full flex-wrap rounded-md border-0 bg-muted p-1"
          aria-label="Chart metric"
        >
          {(["tokens", "cost"] as const).map((value) => (
            <button
              type="button"
              key={value}
              className="min-h-8 pointer-coarse:min-h-11 rounded px-3 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-background aria-pressed:text-foreground"
              aria-pressed={metric === value}
              onClick={() => setMetric(value)}
            >
              {value === "tokens" ? "Tokens" : "Estimated cost"}
            </button>
          ))}
        </fieldset>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Recorded tokens</p>
          <p
            className="mt-1 text-2xl font-semibold tabular-nums"
            aria-label="Recorded token subtotal"
            title={tokenSubtotal ? `${tokenSubtotal.exact} tokens` : undefined}
          >
            {view ? (tokenSubtotal?.readable ?? "Unknown") : "—"}
          </p>
        </div>
        <div className="min-w-0 max-w-full">
          <p className="text-xs text-muted-foreground">Estimated cost</p>
          <p
            className="mt-1 text-2xl font-semibold tabular-nums [overflow-wrap:anywhere]"
            aria-label="Captured cost subtotal"
          >
            {view?.summary.capturedCost == null
              ? "Unknown"
              : compactEstimate(view.summary.capturedCost)}
          </p>
        </div>
      </div>
      <div className="min-h-[280px]">{view && <CalendarValues view={view} metric={metric} />}</div>
      <div className="mt-2 min-h-5 text-xs text-muted-foreground" aria-live="polite">
        {loading && <p>Loading recorded usage…</p>}
        {refreshing && <p>Refreshing recorded usage…</p>}
        {!loading && !view && (
          <p>No usable recorded history for this range. Account allowance is independent.</p>
        )}
        {view && (cached.length > 0 || missing.length > 0) && (
          <p>
            {cached.length
              ? ` Last-known summaries retained for ${cached.join(", ")}; newer usage is unknown.`
              : ""}
            {missing.length ? ` No usable summary for ${missing.join(", ")}.` : ""}
          </p>
        )}
        {current?.cache === "unavailable" && (
          <p className="mt-1">
            Summary cache could not be saved. Offline totals may be unavailable after restart. Retry
            the chart.
          </p>
        )}
        {stale && (
          <p className="mt-1">
            Recorded values are out of date. Original observation{" "}
            {view ? new Date(view.observedAt).toLocaleString() : "unavailable"}.
          </p>
        )}
      </div>
      {(failed || !view) && !loading && (
        <button type="button" className={`${reportButton} mt-2`} onClick={retry}>
          Retry chart
        </button>
      )}
      {stale && view && !failed && !loading && (
        <button type="button" className={`${reportButton} mt-2`} onClick={retry}>
          Refresh chart
        </button>
      )}
      {preparation.state === "stopped" && (
        <div className="mt-2 text-xs text-muted-foreground">
          <p>History preparation stopped. Known recorded values remain available.</p>
          <button type="button" className={`${reportButton} mt-2`} onClick={handleRetry}>
            Retry preparation
          </button>
        </div>
      )}
    </section>
  );
};
