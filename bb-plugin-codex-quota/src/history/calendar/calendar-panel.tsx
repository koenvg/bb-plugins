import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../../plugin/server.js";
import type { HistoryRequest } from "../history-contract.js";
import { calendarReportSchema, calendarUnavailable } from "./calendar-contract.js";
import type { CalendarQuery, CalendarReport } from "./calendar-contract.js";
import { latestStart, shiftDate, validTimezone } from "./calendar-time.js";
import { dateTick } from "./calendar-chart-data.js";
import { CalendarValues, reportButton } from "./calendar-view.js";
import type { TokenMetric } from "./calendar-view.js";
import { QuotaSelect } from "../../quota/quota-select.js";
import { useReportPreparation } from "./report-preparation.js";
import { usePageClock } from "./page-clock.js";
import type { PreparationRequest } from "../report-preparation-contract.js";

interface Props {
  selection: { hostId: string | null; generation: number };
  selectionPending?: boolean;
  selectionRevision?: number;
  now: number;
  read: (input: HistoryRequest & { query: CalendarQuery }) => Promise<unknown>;
  prepare?: (input: PreparationRequest) => Promise<unknown>;
}
function viewerTimezone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return validTimezone(zone) ? zone : null;
  } catch {
    return null;
  }
}
const reasons = {
  "no-selection": "Select a host to view recorded tokens.",
  "selection-changed": "Host selection changed. The earlier report is hidden.",
  "foreign-host": "The report does not match the selected host.",
  "host-offline": "Selected host is offline.",
  "storage-unavailable": "History storage is unavailable or unfinished. Quota still works.",
  "storage-incompatible": "History storage is incompatible or unsafe. Existing data is unchanged.",
  "not-configured": "No retained history is configured on this host.",
  "range-unavailable": "This 30-day range is outside the retained bounds. Use Latest 30 days.",
  "identity-unavailable":
    "Exact-thread identity is unknown or still being resolved. Workspace reports remain separate.",
  unsupported: "The calendar report is unavailable in this host/plugin version.",
};
const dateNavigationButton =
  "group inline-flex size-8 pointer-coarse:size-11 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";
export const CalendarReportPanel = ({
  selection,
  selectionPending = false,
  selectionRevision = 0,
  now,
  read,
  prepare,
}: Props) => {
  const preparation = useReportPreparation(selection, selectionPending, selectionRevision, prepare);
  const [range, setRange] = useState(() => {
    const timezone = viewerTimezone();
    return { timezone, start: timezone ? latestStart(now, timezone) : null };
  });
  const { timezone, start } = range;
  const { hostId, generation } = selection;
  const [metric, setMetric] = useState<TokenMetric>("tokens");
  const [attempt, setAttempt] = useState(0);
  const query = useMemo<CalendarQuery | null>(
    () =>
      timezone && start
        ? {
            startDate: start,
            timezone,
            group: "workspace",
            scope: { kind: "host" },
            includeUncertain: true,
          }
        : null,
    [timezone, start],
  );
  const queryKey = query ? JSON.stringify(query) : "";
  const key = `${selection.hostId}:${selection.generation}:${selectionRevision}:${selectionPending}:${queryKey}`;
  const requestKey = `${key}:${attempt}:${preparation.revision}`;
  const latest = useRef(requestKey);
  const readRef = useRef(read);
  useLayoutEffect(() => {
    latest.current = requestKey;
    readRef.current = read;
  }, [requestKey, read]);
  const [observation, setObservation] = useState<{
    key: string;
    view: CalendarReport;
    stale: boolean;
    attempt: number;
  } | null>(null);
  useEffect(() => {
    if (selectionPending || !hostId || !query) {
      return;
    }
    const controller = new AbortController();
    const frozen = {
      hostId,
      generation,
      query: structuredClone(query),
    };
    const valid = () => !controller.signal.aborted && latest.current === requestKey;
    const accept = (value: unknown) => {
      if (!valid()) {
        return;
      }
      const parsed = calendarReportSchema.safeParse(value);
      const view =
        parsed.success &&
        (parsed.data.state === "unavailable" || JSON.stringify(parsed.data.query) === queryKey)
          ? parsed.data
          : calendarUnavailable("unsupported");
      setObservation((old) =>
        view.state === "unavailable" && old?.key === key && old.view.state !== "unavailable"
          ? { ...old, stale: true, attempt }
          : { key, view, stale: false, attempt },
      );
    };
    // Cancel just before dispatch. SDK frontend RPC has no request-signal parameter.
    void Promise.resolve()
      .then(() => (valid() ? readRef.current(frozen) : null))
      .then(accept)
      .catch(() => accept(calendarUnavailable("unsupported")));
    return () => controller.abort();
  }, [selectionPending, hostId, generation, query, queryKey, requestKey, key, attempt]);
  const current = !selectionPending && observation?.key === key ? observation : null;
  const view = current?.view.state !== "unavailable" ? current?.view : null;
  const loading =
    !!selection.hostId && !selectionPending && !!query && (!current || current.attempt !== attempt);
  const stale = !!view && (current?.stale || now - Date.parse(view.observedAt) > 5 * 60000);
  const navigate = (next: string) => setRange((current) => ({ ...current, start: next }));
  const handleRetry = preparation.retry;
  return (
    <section
      className="mt-6 min-w-0 text-sm"
      aria-label="Calendar token report"
      aria-busy={loading || selectionPending}
    >
      <h2 className="sr-only">Recorded usage</h2>
      <div className="flex flex-col gap-2 @[32rem]:flex-row @[32rem]:items-center @[32rem]:justify-between">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-1 @[32rem]:justify-start">
          <button
            type="button"
            className={dateNavigationButton}
            disabled={!view?.previous || loading || selectionPending}
            onClick={() => start && navigate(shiftDate(start, -30))}
            aria-label="Previous 30 days"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none inline-flex box-border size-8 items-center justify-center rounded-md border border-border group-hover:bg-accent"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                className="block shrink-0"
                aria-hidden="true"
              >
                <path d="m15 6-6 6 6 6" />
              </svg>
            </span>
          </button>
          {query && (
            <span
              className="order-first inline-flex min-h-8 min-w-0 basis-full items-center px-1 text-xs tabular-nums text-muted-foreground @[32rem]:order-none @[32rem]:basis-auto"
              aria-label={`${query.startDate} to ${shiftDate(query.startDate, 29)}, ${query.timezone}`}
            >
              {dateTick(query.startDate)} to {dateTick(shiftDate(query.startDate, 29))}
            </span>
          )}
          <button
            type="button"
            className={dateNavigationButton}
            disabled={!view?.next || loading || selectionPending}
            onClick={() => start && navigate(shiftDate(start, 30))}
            aria-label="Next 30 days"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none inline-flex box-border size-8 items-center justify-center rounded-md border border-border group-hover:bg-accent"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                className="block shrink-0"
                aria-hidden="true"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </span>
          </button>
        </div>
        {/* Keep decorative icon space fixed so enlarged labels retain room. */}
        <QuotaSelect
          aria-label="Report metric"
          containerClassName="w-full @[32rem]:w-36 [&>svg]:right-[8px] [&>svg]:size-[16px]"
          className="pl-[8px]! pr-[32px]!"
          value={metric}
          onChange={(event) => setMetric(event.target.value as TokenMetric)}
        >
          <option value="tokens">Tokens</option>
          <option value="cost">Estimated cost</option>
        </QuotaSelect>
      </div>
      <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">
        {!timezone
          ? "Viewer timezone is unavailable."
          : selectionPending
            ? "Changing host."
            : !selection.hostId
              ? reasons["no-selection"]
              : loading
                ? "Loading chart…"
                : current?.view.state === "unavailable"
                  ? reasons[current.view.reason]
                  : stale
                    ? "Chart is out of date."
                    : ""}
      </p>
      {preparation.state === "stopped" && (
        <div className="mt-2 text-xs text-muted-foreground">
          <output className="block">
            History preparation stopped. Recorded values remain available.
          </output>
          <button type="button" className={reportButton} onClick={handleRetry}>
            Retry preparation
          </button>
        </div>
      )}
      {stale && (
        <button
          type="button"
          className={`${reportButton} mt-2`}
          disabled={loading || selectionPending}
          onClick={() => setAttempt((n) => n + 1)}
        >
          Refresh chart
        </button>
      )}
      {current?.view.state === "unavailable" && (
        <button
          type="button"
          className={`${reportButton} mt-2`}
          disabled={loading || selectionPending}
          onClick={() => {
            if (
              current.view.state === "unavailable" &&
              current.view.reason === "range-unavailable" &&
              timezone
            ) {
              navigate(latestStart(now, timezone));
            }
            setAttempt((n) => n + 1);
          }}
        >
          {current.view.reason === "range-unavailable" ? "Latest 30 days" : "Retry chart"}
        </button>
      )}
      {view && (
        <>
          {view.state !== "partial" && (
            <p className="mt-2 text-xs text-muted-foreground">
              {view.state === "observed-inactivity" ? "Observed inactivity" : "No recorded history"}
            </p>
          )}
          <CalendarValues view={view} metric={metric} />
        </>
      )}
    </section>
  );
};
export const CalendarReportSection = (props: Omit<Props, "read" | "prepare" | "now">) => {
  const now = usePageClock();
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc);
  useLayoutEffect(() => {
    rpcRef.current = rpc;
  }, [rpc]);
  const callbacks = useMemo(
    () => ({
      read: (input: HistoryRequest & { query: CalendarQuery }) =>
        rpcRef.current.call("calendarReport", input),
      prepare: (input: PreparationRequest) => rpcRef.current.call("reportPreparation", input),
    }),
    [],
  );
  return (
    <CalendarReportPanel {...props} now={now} read={callbacks.read} prepare={callbacks.prepare} />
  );
};
