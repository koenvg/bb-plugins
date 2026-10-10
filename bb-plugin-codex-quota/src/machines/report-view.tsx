import { useMemo, useState } from "react";
import { CalendarValues, reportButton } from "../history/calendar/calendar-view.js";
import { useReportPreparation } from "../history/calendar/report-preparation.js";
import { latestStart, shiftDate, validTimezone } from "../history/calendar/calendar-time.js";
import { compactEstimate } from "../history/calendar/calendar-money-view.js";
import type { CalendarQuery } from "../history/calendar/calendar-contract.js";
import type { PreparationRequest } from "../history/report-preparation-contract.js";
import { useMachineReport } from "./use-report.js";

const allMachines = { hostId: "all-machines", generation: 0 };
const count = (value: number) =>
  value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });
type Props = {
  now: number;
  read(input: { query: CalendarQuery; prepare: boolean; refresh: boolean }): Promise<unknown>;
  prepare(input: PreparationRequest): Promise<unknown>;
};
/** Existing visible-page preparation owns ingestion. Date and metric changes remain read-only. */
export function MachineReportPanel({ now, read, prepare }: Props) {
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
  const [group, setGroup] = useState<"workspace" | "thread">("thread");
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
  const threads = useMemo<CalendarQuery | null>(
    () =>
      group === "thread" && timezone
        ? { ...query, group: "thread", includeUncertain: false }
        : null,
    [query, group, timezone],
  );
  const { current, view, loading, failed, retry } = useMachineReport(
    timezone ? query : null,
    preparation.revision,
    read,
  );
  const threadReport = useMachineReport(threads, preparation.revision, read);
  const rankingView = group === "thread" ? threadReport.view : view;
  const cached = current?.machines.filter((row) => row.cached).map((row) => row.machine.name) ?? [];
  const missing =
    current?.machines
      .filter((row) => row.report.state === "unavailable")
      .map((row) => row.machine.name) ?? [];
  const stale = failed || (!!view && now - Date.parse(view.observedAt) > 5 * 60_000);
  const rankings = rankingView?.ranking
    .slice()
    .sort((a, b) =>
      metric === "tokens"
        ? b.totalTokens - a.totalTokens
        : (b.money.capturedCost ?? -1) - (a.money.capturedCost ?? -1),
    )
    .slice(0, 10);
  if (!timezone)
    return (
      <section
        aria-label="All-machine recorded usage"
        className="min-h-[400px] text-sm text-muted-foreground"
      >
        Viewer time zone unavailable. Reopen the dashboard after you set a valid time zone.
      </section>
    );
  return (
    <section
      className="@container min-w-0 text-sm"
      aria-label="All-machine recorded usage"
      aria-busy={loading}
    >
      <div className="flex flex-col items-start gap-3 @sm:flex-row @sm:flex-wrap @sm:items-center @sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="basis-full text-xs tabular-nums text-muted-foreground @sm:mr-2 @sm:basis-auto">
            {start} – {shiftDate(start, 29)}
          </span>
          <button
            className={reportButton}
            aria-label="Previous 30 days"
            disabled={loading || !view?.previous}
            onClick={() => setStart(shiftDate(start, -30))}
          >
            Previous
          </button>
          <button
            className={reportButton}
            aria-label="Next 30 days"
            disabled={loading || !view?.next}
            onClick={() => setStart(shiftDate(start, 30))}
          >
            Next
          </button>
          <button
            className={reportButton}
            onClick={() => setStart(latestStart(Date.now(), timezone))}
          >
            Latest
          </button>
        </div>
        <div className="inline-flex rounded-md bg-muted p-1" role="group" aria-label="Chart metric">
          {(["tokens", "cost"] as const).map((value) => (
            <button
              key={value}
              className="min-h-8 pointer-coarse:min-h-11 rounded px-3 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-background aria-pressed:text-foreground"
              aria-pressed={metric === value}
              onClick={() => setMetric(value)}
            >
              {value === "tokens" ? "Tokens" : "Estimated cost"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Recorded tokens</p>
          <p
            className="mt-1 text-2xl font-semibold tabular-nums"
            aria-label="Recorded token subtotal"
          >
            {view
              ? view.summary.totalTokens > 0 || view.days.every((day) => day.coverage.zero)
                ? count(view.summary.totalTokens)
                : "Unknown"
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Estimated cost</p>
          <p
            className="mt-1 text-2xl font-semibold tabular-nums"
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
        <button className={`${reportButton} mt-2`} onClick={retry}>
          Retry chart
        </button>
      )}
      {stale && view && !failed && !loading && (
        <button className={`${reportButton} mt-2`} onClick={retry}>
          Refresh chart
        </button>
      )}
      {preparation.state === "stopped" && (
        <div className="mt-2 text-xs text-muted-foreground">
          <p>History preparation stopped. Known recorded values remain available.</p>
          <button className={`${reportButton} mt-2`} onClick={preparation.retry}>
            Retry preparation
          </button>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Top 10 {group === "workspace" ? "workspaces" : "threads"}
        </h2>
        <div
          className="inline-flex rounded-md bg-muted p-1"
          role="group"
          aria-label="Usage grouping"
        >
          {(["thread", "workspace"] as const).map((value) => (
            <button
              key={value}
              className="min-h-8 pointer-coarse:min-h-11 rounded px-3 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-background aria-pressed:text-foreground"
              aria-pressed={value === group}
              onClick={() => setGroup(value)}
            >
              {value === "workspace" ? "Workspaces" : "Threads"}
            </button>
          ))}
        </div>
      </div>
      {group === "thread" && (
        <div className="mt-2 min-h-5 text-xs text-muted-foreground">
          {threadReport.loading
            ? "Loading verified threads…"
            : !rankingView
              ? "No usable verified-thread breakdown for this range."
              : ""}
          {!threadReport.loading && (threadReport.failed || !rankingView) && (
            <button className={`${reportButton} ml-2`} onClick={threadReport.retry}>
              Retry threads
            </button>
          )}
        </div>
      )}
      <table
        className="mt-2 w-full table-fixed text-sm"
        aria-label="Recorded usage ranking"
        aria-busy={group === "thread" && threadReport.loading}
      >
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-2 text-left font-normal">
              {group === "workspace" ? "Workspace" : "Thread"} · machine
            </th>
            <th className="w-28 py-2 text-right font-normal">
              {metric === "tokens" ? "Tokens" : "Estimated cost"}
            </th>
          </tr>
        </thead>
        <tbody>
          {rankings?.map((row) => (
            <tr key={row.key} className="border-b border-border">
              <td className="py-2.5 pr-4 [overflow-wrap:anywhere]">
                <span className="block font-medium leading-5">{row.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {row.machineName}
                </span>
              </td>
              <td className="py-2.5 text-right font-medium tabular-nums">
                {metric === "tokens"
                  ? count(row.totalTokens)
                  : row.money.capturedCost === null
                    ? "Unknown"
                    : compactEstimate(row.money.capturedCost)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {group === "thread" && (
        <p className="mt-3 max-w-prose text-xs leading-relaxed text-muted-foreground">
          Verified threads are a subset of workspace usage, not extra tokens to add. Shared paths on
          different machines remain separate.
        </p>
      )}
      {rankingView?.adjusted && (
        <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted-foreground">
          Cached period rankings do not match this range and are omitted.
        </p>
      )}
    </section>
  );
}
