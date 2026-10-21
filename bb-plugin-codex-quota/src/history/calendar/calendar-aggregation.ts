import { metadataColumns } from "../storage/usage-metadata.js";
import type { HistoryDatabase } from "../storage/history-storage.js";
import { MODEL_LIMIT, dayModelsSchema, type DayModels } from "./calendar-models.js";
import { calendarDays, localDate } from "./calendar-time.js";
import { checkedCount, type CalendarQuery } from "./calendar-contract.js";
import { canonicalInterval } from "../collection/history-coverage.js";
import { moneyColumns, safeCapturedSum, eligiblePrice } from "./calendar-money.js";
import {
  capturedSubtotal,
  dayModelCostsSchema,
  type DayModelCosts,
} from "./calendar-model-costs.js";

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
  modelCosts: DayModelCosts;
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
  const metadata = metadataColumns(db);
  const statement =
    db.prepare(`SELECT coalesce(sum(c.total),0) AS totalTokens,${moneyColumns(entity)},count(DISTINCT ${entity}) AS activeEntities,
    coalesce(sum(CASE WHEN ${metadata.missing} THEN 1 ELSE 0 END),0) AS detailMissing,
    coalesce(sum(json_extract(e.payload,'$.inputTokens')),0) AS input,coalesce(sum(json_extract(e.payload,'$.outputTokens')),0) AS output,
    coalesce(sum(json_extract(e.payload,'$.reasoningTokens')),0) AS reasoning,coalesce(sum(json_extract(e.payload,'$.cacheReadTokens')),0) AS cacheRead,
    coalesce(sum(json_extract(e.payload,'$.cacheWriteTokens')),0) AS cacheWrite
    FROM usage_compact c ${metadata.join} LEFT JOIN usage_events e ON e.event_id=c.event_id AND c.detail_available=1 AND c.occurred_at>=?
    WHERE c.accepted=1 AND ${filter.sql} AND c.occurred_at>=? AND c.occurred_at<?`);
  const modelsStatement = db.prepare(`
    SELECT model,totalTokens,sum(totalTokens) OVER () AS knownTokens FROM (
      SELECT CASE WHEN ${metadata.native} AND json_extract(e.payload,'$.model')='unavailable' THEN NULL ELSE json_extract(e.payload,'$.model') END AS model,sum(c.total) AS totalTokens
      FROM usage_compact c ${metadata.join} JOIN usage_events e ON e.event_id=c.event_id
      WHERE c.accepted=1 AND ${filter.sql} AND c.detail_available=1
        AND c.occurred_at>=? AND c.occurred_at>=? AND c.occurred_at<?
      GROUP BY model HAVING model IS NOT NULL AND sum(c.total)>0
    ) ORDER BY totalTokens DESC,model COLLATE BINARY LIMIT ${MODEL_LIMIT}`);
  const costsStatement = db.prepare(`
    WITH records AS (
      SELECT CASE WHEN ${metadata.native} AND json_extract(e.payload,'$.model')='unavailable' THEN NULL
        ELSE json_extract(e.payload,'$.model') END AS model,
        CASE WHEN ${eligiblePrice} THEN c.captured_cost ELSE 0.0 END AS price,
        CASE WHEN ${eligiblePrice} THEN 1 ELSE 0 END AS priced
      FROM usage_compact c ${metadata.join}
      LEFT JOIN usage_events e ON e.event_id=c.event_id AND c.detail_available=1 AND c.occurred_at>=?
      WHERE c.accepted=1 AND ${filter.sql} AND c.occurred_at>=? AND c.occurred_at<?
    ), ranked AS (
      SELECT model,row_number() OVER (ORDER BY CASE WHEN sum(priced)>0 AND sum(price)<=${Number.MAX_SAFE_INTEGER} THEN sum(price) END DESC,model COLLATE BINARY) AS rank
      FROM records WHERE model IS NOT NULL GROUP BY model
    )
    SELECT CASE WHEN r.model IS NULL THEN 'unknown' WHEN n.rank<=${MODEL_LIMIT} THEN 'named' ELSE 'other' END AS bucket,
      CASE WHEN n.rank<=${MODEL_LIMIT} THEN r.model END AS model,
      sum(r.price) AS capturedCost,count(*) AS records,sum(r.priced) AS pricedRecords
    FROM records r LEFT JOIN ranked n ON n.model=r.model
    GROUP BY bucket,CASE WHEN n.rank<=${MODEL_LIMIT} THEN r.model END
    ORDER BY bucket,CASE WHEN pricedRecords>0 AND capturedCost<=${Number.MAX_SAFE_INTEGER} THEN capturedCost END DESC,model COLLATE BINARY`);
  return calendarDays(first, query.timezone, count).map((day) => {
    const row = statement.get(
      detailCutoff,
      ...filter.values,
      day.start < interval.start ? interval.start : day.start,
      day.end > interval.end ? interval.end : day.end,
    ) as Omit<CalendarAggregate, "date">;
    const modelRows = modelsStatement.all(
      ...filter.values,
      detailCutoff,
      day.start < interval.start ? interval.start : day.start,
      day.end > interval.end ? interval.end : day.end,
    ) as { model: string; totalTokens: number; knownTokens: number }[];
    const costRows = costsStatement.all(
      detailCutoff,
      ...filter.values,
      day.start < interval.start ? interval.start : day.start,
      day.end > interval.end ? interval.end : day.end,
    ) as {
      bucket: "named" | "other" | "unknown";
      model: string | null;
      capturedCost: number | null;
      records: number;
      pricedRecords: number;
    }[];
    const modelCosts: DayModelCosts = {
      named: [],
      other: capturedSubtotal(null, 0, 0),
      unknown: capturedSubtotal(null, 0, 0),
    };
    for (const cost of costRows) {
      const money = capturedSubtotal(cost.capturedCost, cost.records, cost.pricedRecords);
      if (cost.bucket === "named") modelCosts.named.push({ model: cost.model!, money });
      else modelCosts[cost.bucket] = money;
    }
    dayModelCostsSchema.parse(modelCosts);
    const knownTokens = checkedCount(modelRows[0]?.knownTokens ?? 0);
    const named = modelRows.map(({ model, totalTokens }) => ({ model, totalTokens }));
    const models = dayModelsSchema.parse({
      named,
      otherTokens:
        knownTokens - modelRows.reduce((total, row) => checkedCount(total + row.totalTokens), 0),
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
    return {
      date: day.date,
      ...row,
      models,
      modelCosts,
    };
  });
}
