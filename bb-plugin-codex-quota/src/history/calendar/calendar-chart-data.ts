import type { CalendarSnapshot } from "./calendar-contract.js";
import { compactEstimate } from "./calendar-money-view.js";

export type TokenMetric = import("./calendar-comparison.js").ComparisonMetric;
export type CalendarDay = CalendarSnapshot["days"][number];
export function coverageLabel(day: { coverage: CalendarDay["coverage"] }) {
  const c = day.coverage;
  return c.zero
    ? "Observed inactivity"
    : c.state === "unavailable"
      ? "Unavailable"
      : c.state === "uncovered"
        ? "Unknown, uncovered gap"
        : c.state === "imported"
          ? "Partial, imported records"
          : c.state === "incomplete"
            ? "Partial, coverage gaps"
            : "Partial, recorded usage";
}
export function recordedValue(day: CalendarDay, metric: TokenMetric): number | null {
  if (metric === "cost") return day.money.capturedCost;
  if (metric === "cost-per-entity") {
    const ratio =
      day.money.capturedCost !== null && day.money.pricedEntities
        ? day.money.capturedCost / day.money.pricedEntities
        : null;
    return ratio !== null && ratio > 0 ? ratio : null;
  }
  if (metric === "entities" && day.activeEntities > 0) return day.activeEntities;
  if (day.totalTokens === 0 && !day.coverage.zero) return null;
  if (day.coverage.zero) return metric === "per-entity" ? null : 0;
  return metric === "tokens"
    ? day.totalTokens
    : metric === "entities"
      ? day.activeEntities
      : day.activeEntities
        ? day.totalTokens / day.activeEntities
        : null;
}
export function chartData(days: CalendarDay[], metric: TokenMetric) {
  const values = days.map((day) => recordedValue(day, metric));
  const maximum = Math.max(0, ...values.map((value) => value ?? 0));
  // Scale only the drawing coordinates. Facts and tooltip values stay unchanged.
  // A unit domain also avoids unsafe tick arithmetic for subnormal captured prices.
  return {
    maximum,
    rows: days.map((day, index) => ({
      date: day.date,
      day,
      value: values[index],
      height: values[index] === null ? null : maximum ? values[index]! / maximum : 0,
    })),
  };
}
export const dateTick = (date: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
export function axisValue(value: number, metric: TokenMetric) {
  return metric === "cost" || metric === "cost-per-entity"
    ? compactEstimate(value)
    : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
        value,
      );
}
export const metricName = (metric: TokenMetric) =>
  metric === "cost" || metric === "cost-per-entity"
    ? "USD estimate"
    : metric === "entities"
      ? "Active entities"
      : metric === "per-entity"
        ? "Tokens per entity"
        : "Tokens";
