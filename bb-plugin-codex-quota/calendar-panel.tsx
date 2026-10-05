import { useEffect, useRef, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server.js";
import type { HistoryRequest } from "./history-contract.js";
import {
  calendarReportSchema,
  calendarUnavailable,
  type CalendarQuery,
  type CalendarReport,
} from "./calendar-contract.js";
import { latestStart, shiftDate, validTimezone } from "./calendar-time.js";
import { dateTick } from "./calendar-chart-data.js";
import { CalendarValues, reportButton, reportControl, type TokenMetric } from "./calendar-view.js";
import { QuotaSelect } from "./quota-select.js";
type Props = {
  selection: { hostId: string | null; generation: number };
  selectionPending?: boolean;
  preparationPending?: boolean;
  selectionRevision?: number;
  now: number;
  read(input: HistoryRequest & { query: CalendarQuery }): Promise<unknown>;
};
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
export function CalendarReportPanel({
  selection,
  selectionPending = false,
  preparationPending = false,
  selectionRevision = 0,
  now,
  read,
}: Props) {
  const [timezone] = useState(viewerTimezone),
    [start, setStart] = useState(() => (timezone ? latestStart(now, timezone) : null));
  const [metric, setMetric] = useState<TokenMetric>("tokens"),
    [attempt, setAttempt] = useState(0);
  const query: CalendarQuery | null =
    timezone && start
      ? { startDate: start, timezone, group: "workspace", scope: { kind: "host" } }
      : null;
  const queryKey = query ? JSON.stringify(query) : "",
    key = `${selection.hostId}:${selection.generation}:${selectionRevision}:${selectionPending}:${preparationPending}:${queryKey}`,
    requestKey = `${key}:${attempt}`;
  const latest = useRef(requestKey);
  latest.current = requestKey;
  const readRef = useRef(read);
  readRef.current = read;
  const [observation, setObservation] = useState<{
    key: string;
    view: CalendarReport;
    stale: boolean;
    attempt: number;
  } | null>(null);
  useEffect(() => {
    if (selectionPending || preparationPending || !selection.hostId || !query) return;
    const controller = new AbortController(),
      frozen = {
        hostId: selection.hostId,
        generation: selection.generation,
        query: structuredClone(query),
      };
    const valid = () => !controller.signal.aborted && latest.current === requestKey;
    const accept = (value: unknown) => {
      if (!valid()) return;
      const parsed = calendarReportSchema.safeParse(value),
        view =
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
  }, [requestKey]);
  const current =
    !selectionPending && !preparationPending && observation?.key === key ? observation : null;
  const view = current?.view.state !== "unavailable" ? current?.view : null;
  const loading =
    !!selection.hostId &&
    !selectionPending &&
    !preparationPending &&
    !!query &&
    (!current || current.attempt !== attempt);
  const stale = !!view && (current!.stale || now - Date.parse(view.observedAt) > 5 * 60000);
  const navigate = (next: string) => setStart(next);
  return (
    <section
      className="mt-6 min-w-0 text-sm"
      aria-label="Calendar token report"
      aria-busy={loading || selectionPending || preparationPending}
    >
      <h2 className="sr-only">Recorded usage</h2>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            className={`${reportControl} inline-flex w-9 shrink-0 items-center justify-center p-0`}
            disabled={!view?.previous || loading || selectionPending}
            onClick={() => start && navigate(shiftDate(start, -30))}
            aria-label="Previous 30 days"
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
          </button>
          {query && (
            <span
              className="inline-flex h-9 items-center whitespace-nowrap px-1 text-xs tabular-nums text-muted-foreground"
              aria-label={`${query.startDate} to ${shiftDate(query.startDate, 29)}, ${query.timezone}`}
            >
              {dateTick(query.startDate)} to {dateTick(shiftDate(query.startDate, 29))}
            </span>
          )}
          <button
            type="button"
            className={`${reportControl} inline-flex w-9 shrink-0 items-center justify-center p-0`}
            disabled={!view?.next || loading || selectionPending}
            onClick={() => start && navigate(shiftDate(start, 30))}
            aria-label="Next 30 days"
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
          </button>
        </div>
        <QuotaSelect
          aria-label="Report metric"
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
            : preparationPending
              ? "Loading chart."
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
          disabled={loading || selectionPending || preparationPending}
          onClick={() => {
            if (
              current.view.state === "unavailable" &&
              current.view.reason === "range-unavailable" &&
              timezone
            )
              setStart(latestStart(now, timezone));
            setAttempt((n) => n + 1);
          }}
        >
          {current.view.reason === "range-unavailable" ? "Latest 30 days" : "Retry chart"}
        </button>
      )}
      {view && (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            {view.state === "observed-inactivity"
              ? "Observed inactivity"
              : view.state === "unknown"
                ? "No recorded history"
                : "Partial history"}
            {metric === "cost"
              ? view.summary.money.state === "unavailable"
                ? " · Prices unavailable"
                : " · Captured estimates"
              : ""}
          </p>
          <CalendarValues view={view} metric={metric} />
        </>
      )}
    </section>
  );
}
export function CalendarReportSection(props: Omit<Props, "read">) {
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const read = useRef((input: HistoryRequest & { query: CalendarQuery }) =>
    rpcRef.current.call("calendarReport", input),
  );
  return <CalendarReportPanel {...props} read={read.current} />;
}
