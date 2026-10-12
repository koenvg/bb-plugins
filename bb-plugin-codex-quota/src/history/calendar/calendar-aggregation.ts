import { metadataColumns } from "../storage/usage-metadata.js";
import { withSpeed, sumSpeed, type SpeedTokens } from "../usage-speed.js";
import type { HistoryDatabase } from "../storage/history-storage.js";
import { MODEL_LIMIT, dayModelsSchema, type DayModels } from "./calendar-models.js";
import { calendarDays, localDate } from "./calendar-time.js";
import { checkedCount, type CalendarQuery } from "./calendar-contract.js";
import { canonicalInterval } from "../collection/history-coverage.js";
import { moneyColumns, safeCapturedSum } from "./calendar-money.js";

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
  models: DayModels;
  totalTokens: number;
  speedTokens: SpeedTokens;
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
  const metadata = metadataColumns(db);
  const statement =
    db.prepare(`SELECT coalesce(sum(c.total),0) AS totalTokens,${metadata.sums},${moneyColumns(entity)},count(DISTINCT ${entity}) AS activeEntities,
    coalesce(sum(CASE WHEN ${metadata.missing} THEN 1 ELSE 0 END),0) AS detailMissing,
    coalesce(sum(json_extract(e.payload,'$.inputTokens')),0) AS input,coalesce(sum(json_extract(e.payload,'$.outputTokens')),0) AS output,
    coalesce(sum(json_extract(e.payload,'$.reasoningTokens')),0) AS reasoning,coalesce(sum(json_extract(e.payload,'$.cacheReadTokens')),0) AS cacheRead,
    coalesce(sum(json_extract(e.payload,'$.cacheWriteTokens')),0) AS cacheWrite
    FROM usage_compact c ${metadata.join} LEFT JOIN usage_events e ON e.event_id=c.event_id AND c.detail_available=1 AND c.occurred_at>=?
    WHERE c.accepted=1 AND ${filter.sql} AND c.occurred_at>=? AND c.occurred_at<?`);
  const modelsStatement = db.prepare(`
    SELECT model,totalTokens,normal,fast,ultrafast,sum(totalTokens) OVER () AS knownTokens,
      sum(normal) OVER () AS knownNormal,sum(fast) OVER () AS knownFast,sum(ultrafast) OVER () AS knownUltrafast FROM (
      SELECT CASE WHEN ${metadata.native} AND json_extract(e.payload,'$.model')='unavailable' THEN NULL ELSE json_extract(e.payload,'$.model') END AS model,sum(c.total) AS totalTokens,${metadata.sums}
      FROM usage_compact c ${metadata.join} JOIN usage_events e ON e.event_id=c.event_id
      WHERE c.accepted=1 AND ${filter.sql} AND c.detail_available=1
        AND c.occurred_at>=? AND c.occurred_at>=? AND c.occurred_at<?
      GROUP BY model HAVING model IS NOT NULL AND sum(c.total)>0
    ) ORDER BY totalTokens DESC,model COLLATE BINARY LIMIT ${MODEL_LIMIT}`);
  return calendarDays(first, query.timezone, count).map((day) => {
    const row = statement.get(
      detailCutoff,
      ...filter.values,
      day.start < interval.start ? interval.start : day.start,
      day.end > interval.end ? interval.end : day.end,
    ) as Omit<CalendarAggregate, "date"> & SpeedTokens;
    const modelRows = modelsStatement.all(
      ...filter.values,
      detailCutoff,
      day.start < interval.start ? interval.start : day.start,
      day.end > interval.end ? interval.end : day.end,
    ) as (SpeedTokens & {
      model: string;
      totalTokens: number;
      knownTokens: number;
      knownNormal: number;
      knownFast: number;
      knownUltrafast: number;
    })[];
    const knownTokens = checkedCount(modelRows[0]?.knownTokens ?? 0);
    const named = modelRows.map(({ model, totalTokens, normal, fast, ultrafast }) => ({
      model,
      totalTokens,
      speedTokens: { normal, fast, ultrafast },
    }));
    const shown = sumSpeed(named.map((row) => row.speedTokens));
    const models = dayModelsSchema.parse({
      named,
      otherTokens:
        knownTokens - modelRows.reduce((total, row) => checkedCount(total + row.totalTokens), 0),
      otherSpeedTokens: {
        normal: checkedCount(modelRows[0]?.knownNormal ?? 0) - shown.normal,
        fast: checkedCount(modelRows[0]?.knownFast ?? 0) - shown.fast,
        ultrafast: checkedCount(modelRows[0]?.knownUltrafast ?? 0) - shown.ultrafast,
      },
    });
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
    return withSpeed({
      date: day.date,
      ...row,
      models,
      speedTokens: { normal: row.normal, fast: row.fast, ultrafast: row.ultrafast },
    });
  });
}
