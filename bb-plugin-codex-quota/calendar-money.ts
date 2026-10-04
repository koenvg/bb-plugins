import type { CalendarMoney } from "./calendar-contract.js";

export type MoneyAggregate = { capturedCost: number | null; pricedEvents: number; events: number; pricedEntities: number };
// Matches the original canonical capture/import price contract. Never consult model prices.
const eligiblePrice = "typeof(c.captured_cost) IN ('integer','real') AND c.captured_cost>0 AND c.captured_cost<=1e9";
export function moneyColumns(entity: string): string {
  return `sum(CASE WHEN ${eligiblePrice} THEN c.captured_cost ELSE 0.0 END) AS capturedCost,
    count(CASE WHEN ${eligiblePrice} THEN 1 END) AS pricedEvents,count(*) AS events,
    count(DISTINCT CASE WHEN ${eligiblePrice} THEN ${entity} END) AS pricedEntities`;
}
export function safeCapturedSum(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
}
export function calendarMoney(row: MoneyAggregate): CalendarMoney {
  const counts = { pricedRecords: row.pricedEvents, records: row.events, pricedEntities: row.pricedEntities };
  if (!row.pricedEvents) return { ...counts, state: "unavailable", capturedCost: null, reason: "missing-prices" };
  const capturedCost = safeCapturedSum(row.capturedCost);
  if (capturedCost === null || capturedCost === 0) return { ...counts, state: "unavailable", capturedCost: null, reason: "unsafe-sum" };
  return { ...counts, state: row.pricedEvents === row.events ? "available" : "partial", capturedCost,
    reason: row.pricedEvents === row.events ? "ok" : "missing-prices" };
}
