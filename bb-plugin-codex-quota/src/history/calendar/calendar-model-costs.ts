import { z } from "zod";
import type { CalendarMoney } from "./calendar-contract.js";
import { calendarMoney, safeCapturedSum } from "./calendar-money.js";
import { compareId, MODEL_LIMIT, modelColor, modelIdSchema } from "./calendar-models.js";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const checkedCount = (value: number) => count.parse(value);
export const capturedSubtotalSchema = z
  .object({
    state: z.enum(["available", "partial", "unavailable"]),
    capturedCost: z.number().finite().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
    records: count,
    pricedRecords: count,
    reason: z.enum(["ok", "missing-prices", "unsafe-sum"]),
  })
  .strict()
  .refine((value) => {
    if (value.pricedRecords > value.records) return false;
    if (value.state === "unavailable")
      return (
        value.capturedCost === null &&
        (value.reason === "missing-prices"
          ? value.pricedRecords === 0
          : value.reason === "unsafe-sum" && value.pricedRecords > 0)
      );
    return (
      value.capturedCost !== null &&
      value.pricedRecords > 0 &&
      (value.state === "available"
        ? value.pricedRecords === value.records && value.reason === "ok"
        : value.pricedRecords < value.records && value.reason === "missing-prices")
    );
  }, "Model pricing mismatch");
export type CapturedSubtotal = z.infer<typeof capturedSubtotalSchema>;
export const dayModelCostsSchema = z
  .object({
    named: z
      .array(z.object({ model: modelIdSchema, money: capturedSubtotalSchema }).strict())
      .max(MODEL_LIMIT),
    other: capturedSubtotalSchema,
    unknown: capturedSubtotalSchema,
  })
  .strict()
  .refine(
    (value) => new Set(value.named.map((row) => row.model)).size === value.named.length,
    "Duplicate cost model",
  );
export type DayModelCosts = z.infer<typeof dayModelCostsSchema>;
type CostDay = { money: CalendarMoney; modelCosts?: DayModelCosts };
export function capturedSubtotal(
  capturedCost: number | null,
  records: number,
  pricedRecords: number,
): CapturedSubtotal {
  const { pricedEntities: _, ...money } = calendarMoney({
    capturedCost,
    events: checkedCount(records),
    pricedEvents: checkedCount(pricedRecords),
    pricedEntities: 0,
  });
  return money;
}
const empty = () => capturedSubtotal(null, 0, 0);
function partition(day: CostDay): DayModelCosts {
  if (day.modelCosts) return day.modelCosts;
  const { pricedEntities: _, ...unknown } = day.money;
  return { named: [], other: empty(), unknown };
}
function sum(values: readonly CapturedSubtotal[]): CapturedSubtotal {
  const records = values.reduce((n, value) => checkedCount(n + value.records), 0);
  const priced = values.reduce((n, value) => checkedCount(n + value.pricedRecords), 0);
  const cost = values.some((value) => value.reason === "unsafe-sum")
    ? null
    : safeCapturedSum(values.reduce((n, value) => n + (value.capturedCost ?? 0), 0));
  return capturedSubtotal(cost, records, priced);
}
function ranked(rows: DayModelCosts["named"]) {
  return rows.sort((a, b) => {
    const left = a.money.capturedCost,
      right = b.money.capturedCost;
    return (
      (left === null ? (right === null ? 0 : 1) : right === null ? -1 : right - left) ||
      compareId(a.model, b.model)
    );
  });
}
export function validModelCosts(day: CostDay): boolean {
  if (!day.modelCosts) return true;
  const parts = [
    ...day.modelCosts.named.map((row) => row.money),
    day.modelCosts.other,
    day.modelCosts.unknown,
  ];
  if (
    parts.reduce((n, part) => n + BigInt(part.records), 0n) !== BigInt(day.money.records) ||
    parts.reduce((n, part) => n + BigInt(part.pricedRecords), 0n) !==
      BigInt(day.money.pricedRecords)
  )
    return false;
  if (day.money.capturedCost === null) {
    if (day.money.reason === "missing-prices")
      return parts.every((part) => part.capturedCost === null);
    if (parts.some((part) => part.reason === "unsafe-sum")) return true;
    const total = parts.reduce((n, part) => n + (part.capturedCost ?? 0), 0);
    return (
      total >=
      Number.MAX_SAFE_INTEGER * (1 - Math.min(1e-8, Number.EPSILON * day.money.pricedRecords * 4))
    );
  }
  if (parts.some((part) => part.reason === "unsafe-sum")) return false;
  const total = parts.reduce((n, part) => n + (part.capturedCost ?? 0), 0);
  // Regrouping nonnegative prices changes rounding, not captured facts. Cap relative tolerance at 1e-8.
  const tolerance =
    Math.max(total, day.money.capturedCost) *
    Math.min(1e-8, Number.EPSILON * Math.max(1, day.money.pricedRecords) * 4);
  return Number.isFinite(total) && Math.abs(total - day.money.capturedCost) <= tolerance;
}
export function mergeModelCosts(days: readonly CostDay[]): DayModelCosts {
  const partitions = days.map(partition);
  const names = new Map<string, CapturedSubtotal[]>();
  for (const value of partitions)
    for (const row of value.named) {
      const values = names.get(row.model) ?? [];
      values.push(row.money);
      names.set(row.model, values);
    }
  const rows = ranked([...names].map(([model, values]) => ({ model, money: sum(values) })));
  return {
    named: rows.slice(0, MODEL_LIMIT),
    other: sum([
      ...partitions.map((value) => value.other),
      ...rows.slice(MODEL_LIMIT).map((row) => row.money),
    ]),
    unknown: sum(partitions.map((value) => value.unknown)),
  };
}
export type CostSeries = {
  key: string;
  selectionId: string;
  label: string;
  color: string;
  model?: string;
  bucket: { kind: "named"; model: string } | { kind: "other" | "unknown" };
};
export function projectCostModels(days: readonly CostDay[]) {
  const partitions = days.map(partition);
  const selected = mergeModelCosts(days)
    .named.map((row) => row.model)
    .sort(compareId);
  const series: CostSeries[] = selected.map((model, index) => ({
    key: `c${index}`,
    selectionId: JSON.stringify(["cost", "model", model]),
    label: model,
    model,
    bucket: { kind: "named", model },
    color: modelColor(model),
  }));
  const facts = partitions.map((value) => {
    const result: Record<string, CapturedSubtotal> = {};
    for (const item of series)
      result[item.key] = value.named.find((row) => row.model === item.model)?.money ?? empty();
    result.other = sum([
      value.other,
      ...value.named.filter((row) => !selected.includes(row.model)).map((row) => row.money),
    ]);
    result.unknown = value.unknown;
    return result;
  });
  for (const kind of ["other", "unknown"] as const)
    if (facts.some((day) => day[kind].records > 0))
      series.push({
        key: kind,
        selectionId: JSON.stringify(["cost", kind]),
        label: kind === "other" ? "Other models" : "Unknown model",
        bucket: { kind },
        color: modelColor(kind),
      });
  return { series, facts };
}
