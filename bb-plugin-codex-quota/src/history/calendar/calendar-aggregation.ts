import type { HistoryDatabase } from "../storage/history-storage.js";
import { calendarDays, localDate } from "./calendar-time.js";
import type { CalendarQuery } from "./calendar-contract.js";
import { canonicalInterval } from "../collection/history-coverage.js";
import { moneyColumns, safeCapturedSum } from "./calendar-money.js";

export function checkedCount(n: number): number {
  if (!Number.isSafeInteger(n) || n < 0) throw Error("Calendar total unavailable");
  return n;
}
export function scopeFilter(query: {
  workspace?: string;
  verifiedThread?: string;
  group?: "workspace" | "thread";
}) {
  const clauses = [],
    values: string[] = [];
  if (query.workspace) {
    clauses.push("c.workspace=?");
    values.push(query.workspace);
  }
  if (query.verifiedThread) {
    clauses.push("c.verified_thread=?");
    values.push(query.verifiedThread);
  }
  if (query.group === "thread") clauses.push("c.verified_thread IS NOT NULL");
  return { sql: clauses.length ? clauses.join(" AND ") : "1=1", values };
}
export function queryScope(query: CalendarQuery) {
  return query.scope.kind === "workspace"
    ? { workspace: query.scope.workspace }
    : query.scope.kind === "thread"
      ? { verifiedThread: query.scope.threadId }
      : {};
}
export type CalendarAggregate = {
  date: string;
  totalTokens: number;
  capturedCost: number | null;
  pricedEvents: number;
  events: number;
  pricedEntities: number;
  activeEntities: number;
  detailMissing: number;
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
};
/** Fixed number of indexed SQL aggregate queries. No event array or accepted-record cap. */
export function aggregateDays(
  db: HistoryDatabase,
  query: {
    start: string;
    end: string;
    timezone: string;
    workspace?: string;
    verifiedThread?: string;
    group?: "workspace" | "thread";
  },
  detailCutoff: string,
) {
  const interval = canonicalInterval(query.start, query.end, 32),
    filter = scopeFilter(query);
  const first = localDate(Date.parse(interval.start), query.timezone),
    last = localDate(Date.parse(interval.end) - 1, query.timezone);
  const count =
    Math.round((Date.parse(last + "T00:00:00Z") - Date.parse(first + "T00:00:00Z")) / 86400000) + 1;
  const entity = query.group === "thread" ? "c.verified_thread" : "c.workspace";
  const statement =
    db.prepare(`SELECT coalesce(sum(c.total),0) AS totalTokens,${moneyColumns(entity)},count(DISTINCT ${entity}) AS activeEntities,
    coalesce(sum(CASE WHEN e.event_id IS NULL THEN 1 ELSE 0 END),0) AS detailMissing,
    coalesce(sum(json_extract(e.payload,'$.inputTokens')),0) AS input,coalesce(sum(json_extract(e.payload,'$.outputTokens')),0) AS output,
    coalesce(sum(json_extract(e.payload,'$.reasoningTokens')),0) AS reasoning,coalesce(sum(json_extract(e.payload,'$.cacheReadTokens')),0) AS cacheRead,
    coalesce(sum(json_extract(e.payload,'$.cacheWriteTokens')),0) AS cacheWrite
    FROM usage_compact c LEFT JOIN usage_events e ON e.event_id=c.event_id AND c.detail_available=1 AND c.occurred_at>=?
    WHERE c.accepted=1 AND ${filter.sql} AND c.occurred_at>=? AND c.occurred_at<?`);
  return calendarDays(first, query.timezone, count).map((day) => {
    const row = statement.get(
      detailCutoff,
      ...filter.values,
      day.start < interval.start ? interval.start : day.start,
      day.end > interval.end ? interval.end : day.end,
    ) as Omit<CalendarAggregate, "date">;
    for (const key of [
      "totalTokens",
      "pricedEvents",
      "events",
      "pricedEntities",
      "activeEntities",
      "detailMissing",
    ] as const)
      checkedCount(row[key]);
    if (!row.detailMissing)
      for (const key of ["input", "output", "reasoning", "cacheRead", "cacheWrite"] as const)
        checkedCount(row[key]);
    row.capturedCost = safeCapturedSum(row.capturedCost);
    return { date: day.date, ...row };
  });
}
