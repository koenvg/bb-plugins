import { metadataColumns } from "../storage/usage-metadata.js";
import type { HistoryDatabase } from "../storage/history-storage.js";
import { MODEL_LIMIT, dayModelsSchema } from "./calendar-models.js";
import type { DayModels } from "./calendar-models.js";
import { calendarDays, localDate } from "./calendar-time.js";
import { checkedCount } from "./calendar-contract.js";
import type { CalendarQuery } from "./calendar-contract.js";
import { canonicalInterval } from "../collection/history-coverage.js";
import { safeCapturedSum, eligiblePrice } from "./calendar-money.js";
import { capturedSubtotal, dayModelCostsSchema } from "./calendar-model-costs.js";
import type { DayModelCosts } from "./calendar-model-costs.js";

export function scopeFilter(query: {
  workspace?: string;
  verifiedThread?: string;
  group?: "workspace" | "thread";
}) {
  const clauses = [];
  const values: string[] = [];
  if (query.workspace) {
    clauses.push("c.workspace=?");
    values.push(query.workspace);
  }
  if (query.verifiedThread) {
    clauses.push("c.verified_thread=?");
    values.push(query.verifiedThread);
  }
  if (query.group === "thread") {
    clauses.push("c.verified_thread IS NOT NULL");
  }
  return { sql: clauses.length ? clauses.join(" AND ") : "1=1", values };
}
export function queryScope(query: CalendarQuery) {
  return query.scope.kind === "workspace"
    ? { workspace: query.scope.workspace }
    : query.scope.kind === "thread"
      ? { verifiedThread: query.scope.threadId }
      : {};
}
export interface CalendarAggregate {
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
}
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
  const interval = canonicalInterval(query.start, query.end, 32);
  const filter = scopeFilter(query);
  const first = localDate(Date.parse(interval.start), query.timezone);
  const last = localDate(Date.parse(interval.end) - 1, query.timezone);
  const count =
    Math.round((Date.parse(last + "T00:00:00Z") - Date.parse(first + "T00:00:00Z")) / 86400000) + 1;
  const entity = query.group === "thread" ? "c.verified_thread" : "c.workspace";
  const metadata = metadataColumns(db);
  // Materialize only the columns used by the chart, one local day at a time. All
  // three aggregates then share one indexed pass through the retained event detail.
  const statement = db.prepare(`WITH records AS MATERIALIZED (
    SELECT c.total,${entity} AS entity,CASE WHEN ${eligiblePrice} THEN c.captured_cost END AS price,CASE WHEN ${metadata.missing} THEN 1 ELSE 0 END AS missing,
      CASE WHEN ${metadata.native} AND json_extract(e.payload,'$.model')='unavailable' THEN NULL ELSE json_extract(e.payload,'$.model') END AS model,
      json_extract(e.payload,'$.inputTokens') AS input,json_extract(e.payload,'$.outputTokens') AS output,
      json_extract(e.payload,'$.reasoningTokens') AS reasoning,json_extract(e.payload,'$.cacheReadTokens') AS cacheRead,
      json_extract(e.payload,'$.cacheWriteTokens') AS cacheWrite
    FROM usage_compact c ${metadata.join} LEFT JOIN usage_events e ON e.event_id=c.event_id AND c.detail_available=1 AND c.occurred_at>=?
    WHERE c.accepted=1 AND ${filter.sql} AND c.occurred_at>=? AND c.occurred_at<?
  ), totals AS (
    SELECT coalesce(sum(total),0) AS totalTokens,sum(coalesce(price,0.0)) AS capturedCost,count(price) AS pricedEvents,count(*) AS events,
      count(DISTINCT CASE WHEN price IS NOT NULL THEN entity END) AS pricedEntities,count(DISTINCT entity) AS activeEntities,
      coalesce(sum(missing),0) AS detailMissing,coalesce(sum(input),0) AS input,coalesce(sum(output),0) AS output,
      coalesce(sum(reasoning),0) AS reasoning,coalesce(sum(cacheRead),0) AS cacheRead,coalesce(sum(cacheWrite),0) AS cacheWrite FROM records
  ), perModel AS MATERIALIZED (
    SELECT model,sum(total) AS tokens,count(*) AS records,count(price) AS priced,sum(coalesce(price,0.0)) AS price FROM records GROUP BY model
  ), tokens AS (
    SELECT model,tokens,sum(tokens) OVER () AS knownTokens FROM perModel WHERE model IS NOT NULL AND tokens>0
    ORDER BY tokens DESC,model COLLATE BINARY LIMIT ${MODEL_LIMIT}
  ), ranked AS (
    SELECT *,row_number() OVER (ORDER BY model IS NULL,CASE WHEN priced>0 AND price<=${Number.MAX_SAFE_INTEGER} THEN price END DESC,model COLLATE BINARY) AS rank FROM perModel
  ), costs AS (
    SELECT CASE WHEN model IS NULL THEN 'unknown' WHEN rank<=${MODEL_LIMIT} THEN 'named' ELSE 'other' END AS bucket,
      CASE WHEN rank<=${MODEL_LIMIT} THEN model END AS costModel,sum(price) AS price,sum(records) AS records,sum(priced) AS priced FROM ranked GROUP BY bucket,costModel
  ), breakdown AS (
    SELECT 'tokens' AS bucket,model,tokens,knownTokens,NULL AS price,NULL AS records,NULL AS priced FROM tokens
    UNION ALL SELECT bucket,costModel,NULL,NULL,price,records,priced FROM costs
  ) SELECT totals.*,breakdown.* FROM totals LEFT JOIN breakdown ON 1=1
    ORDER BY bucket,tokens DESC,CASE WHEN priced>0 AND price<=${Number.MAX_SAFE_INTEGER} THEN price END DESC,model COLLATE BINARY`);
  return calendarDays(first, query.timezone, count).map((day) => {
    const rows = statement.all(
      detailCutoff,
      ...filter.values,
      day.start < interval.start ? interval.start : day.start,
      day.end > interval.end ? interval.end : day.end,
    ) as (Omit<CalendarAggregate, "date" | "models" | "modelCosts"> &
      (
        | { bucket: null }
        | { bucket: "tokens"; model: string; tokens: number; knownTokens: number }
        | { bucket: "named"; model: string; price: number; records: number; priced: number }
        | { bucket: "other" | "unknown"; price: number; records: number; priced: number }
      ))[];
    const row = rows[0];
    let knownTokens = 0;
    const named: DayModels["named"] = [];
    const modelCosts: DayModelCosts = {
      named: [],
      other: capturedSubtotal(null, 0, 0),
      unknown: capturedSubtotal(null, 0, 0),
    };
    for (const cost of rows) {
      if (cost.bucket === null) {
        continue;
      }
      if (cost.bucket === "tokens") {
        knownTokens = checkedCount(cost.knownTokens);
        named.push({ model: cost.model, totalTokens: cost.tokens });
        continue;
      }
      const money = capturedSubtotal(cost.price, cost.records, cost.priced);
      if (cost.bucket === "named") {
        modelCosts.named.push({ model: cost.model, money });
      } else {
        modelCosts[cost.bucket] = money;
      }
    }
    dayModelCostsSchema.parse(modelCosts);
    const models = dayModelsSchema.parse({
      named,
      otherTokens:
        knownTokens - named.reduce((total, row) => checkedCount(total + row.totalTokens), 0),
    });
    for (const key of [
      "totalTokens",
      "pricedEvents",
      "events",
      "pricedEntities",
      "activeEntities",
      "detailMissing",
    ] as const) {
      checkedCount(row[key]);
    }
    if (!row.detailMissing) {
      for (const key of ["input", "output", "reasoning", "cacheRead", "cacheWrite"] as const) {
        checkedCount(row[key]);
      }
    }
    row.capturedCost = safeCapturedSum(row.capturedCost);
    return {
      date: day.date,
      totalTokens: row.totalTokens,
      capturedCost: row.capturedCost,
      pricedEvents: row.pricedEvents,
      events: row.events,
      pricedEntities: row.pricedEntities,
      activeEntities: row.activeEntities,
      detailMissing: row.detailMissing,
      input: row.input,
      output: row.output,
      reasoning: row.reasoning,
      cacheRead: row.cacheRead,
      cacheWrite: row.cacheWrite,
      models,
      modelCosts,
    };
  });
}
