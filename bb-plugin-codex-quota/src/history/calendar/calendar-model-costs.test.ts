import { expect, it } from "vitest";
import { calendarDaySchema, type CalendarQuery } from "./calendar-contract.js";
import { calendarSnapshot } from "./calendar-test-support.js";
import { chartData } from "./calendar-chart-data.js";
import type { CapturedSubtotal } from "./calendar-model-costs.js";

const query: CalendarQuery = {
  startDate: "2026-09-01",
  timezone: "UTC",
  group: "workspace",
  scope: { kind: "host" },
};
const empty: CapturedSubtotal = {
  state: "unavailable",
  capturedCost: null,
  records: 0,
  pricedRecords: 0,
  reason: "missing-prices",
};
function day(cost = 4, model = "A") {
  const value = calendarSnapshot(query).days[14];
  value.activeEntities = 1;
  value.money = {
    state: "available",
    capturedCost: cost,
    records: 1,
    pricedRecords: 1,
    pricedEntities: 1,
    reason: "ok",
  };
  value.modelCosts = {
    named: [
      {
        model,
        money: {
          state: "available",
          capturedCost: cost,
          records: 1,
          pricedRecords: 1,
          reason: "ok",
        },
      },
    ],
    other: empty,
    unknown: empty,
  };
  return value;
}
it("puts old money entirely in Unknown even when retained token models have names", () => {
  const value = day(3);
  delete value.modelCosts;
  value.models = { named: [{ model: "A", totalTokens: 600 }], otherTokens: 0 };
  const result = chartData([value], "cost");
  expect(result.models.map((series) => series.label)).toEqual(["Unknown model"]);
  expect(result.rows[0].modelFacts).toEqual({ unknown: 3 });
  expect(result.rows[0].modelHeights).toEqual({ unknown: 1 });
  expect(result.rows[0].costFacts.unknown).toEqual({
    state: "available",
    capturedCost: 3,
    records: 1,
    pricedRecords: 1,
    reason: "ok",
  });
});
it("caps displayed-window money independently and folds displaced dollars directly into Other", () => {
  const days = Array.from({ length: 10 }, (_, n) => day(n + 1, `model-${n}`));
  const result = chartData(days, "cost");
  expect(result.models.map((series) => series.label)).toEqual([
    "model-2",
    "model-3",
    "model-4",
    "model-5",
    "model-6",
    "model-7",
    "model-8",
    "model-9",
    "Other models",
  ]);
  expect(result.rows[0].costFacts.other).toEqual({
    state: "available",
    capturedCost: 1,
    records: 1,
    pricedRecords: 1,
    reason: "ok",
  });
  expect(result.rows[1].costFacts.other.capturedCost).toBe(2);
  expect(result.rows[9].modelFacts.c7).toBe(10);
  expect(result.maximum).toBe(10);
});
it.each([Number.MIN_VALUE, 1e-200, Number.MAX_SAFE_INTEGER])(
  "preserves exact captured facts and safe coordinates for %s",
  (price) => {
    const value = day(price);
    expect(calendarDaySchema.parse(value).modelCosts?.named[0].money.capturedCost).toBe(price);
    const result = chartData([value], "cost");
    expect(result.rows[0].modelFacts).toEqual({ c0: price });
    expect(result.rows[0].modelHeights).toEqual({ c0: 1 });
  },
);
it("suppresses every monetary stack on unsafe daily totals while preserving token drawings", () => {
  const value = day(Number.MAX_SAFE_INTEGER);
  value.money = {
    ...value.money,
    records: 2,
    pricedRecords: 2,
    capturedCost: null,
    state: "unavailable",
    reason: "unsafe-sum",
  };
  value.modelCosts!.named.push({ model: "B", money: { ...value.modelCosts!.named[0].money } });
  const parsed = calendarDaySchema.parse(value);
  const cost = chartData([parsed], "cost");
  expect(cost.rows[0].value).toBe(null);
  expect(cost.rows[0].modelHeights).toEqual({ c0: null, c1: null });
  expect(cost.rows[0].modelFacts).toEqual({
    c0: Number.MAX_SAFE_INTEGER,
    c1: Number.MAX_SAFE_INTEGER,
  });
  const tokens = chartData([parsed], "tokens");
  expect(tokens.rows[0].value).toBe(600);
  expect(tokens.rows[0].modelHeights).toEqual({ unknown: 1 });
});
it("accepts regrouping roundoff but does not force equality or accept a changed subtotal", () => {
  const value = day(0.1 + 0.2);
  value.money.records = value.money.pricedRecords = 2;
  value.modelCosts!.named = [
    { model: "A", money: { ...value.modelCosts!.named[0].money, capturedCost: 0.1 } },
    { model: "B", money: { ...value.modelCosts!.named[0].money, capturedCost: 0.2 } },
  ];
  value.money.capturedCost = 0.3;
  const parsed = calendarDaySchema.parse(value);
  expect(parsed.money.capturedCost).toBe(0.3);
  expect(chartData([parsed], "cost").rows[0].modelFacts).toEqual({ c0: 0.1, c1: 0.2 });
  value.modelCosts!.named[1].money.capturedCost = 0.21;
  expect(calendarDaySchema.safeParse(value).success).toBe(false);
});
it.each([
  [
    "record counts",
    (value: ReturnType<typeof day>) => {
      value.modelCosts!.named[0].money.records = 2;
    },
  ],
  [
    "priced counts",
    (value: ReturnType<typeof day>) => {
      value.money.records = value.money.pricedRecords = 2;
    },
  ],
  [
    "dollar sum",
    (value: ReturnType<typeof day>) => {
      value.modelCosts!.named[0].money.capturedCost = 5;
    },
  ],
  [
    "duplicate names",
    (value: ReturnType<typeof day>) => {
      value.modelCosts!.named.push(value.modelCosts!.named[0]);
    },
  ],
  [
    "nonfinite price",
    (value: ReturnType<typeof day>) => {
      value.modelCosts!.named[0].money.capturedCost = Infinity;
    },
  ],
  [
    "unsafe price",
    (value: ReturnType<typeof day>) => {
      value.modelCosts!.named[0].money.capturedCost = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
  [
    "invalid model",
    (value: ReturnType<typeof day>) => {
      value.modelCosts!.named[0].model = "\n";
    },
  ],
  [
    "entity denominator",
    (value: ReturnType<typeof day>) => {
      Object.assign(value.modelCosts!.named[0].money, { pricedEntities: 1 });
    },
  ],
  [
    "subnormal mismatch",
    (value: ReturnType<typeof day>) => {
      value.money.capturedCost = Number.MIN_VALUE;
      value.modelCosts!.named[0].money.capturedCost = Number.MIN_VALUE * 2;
    },
  ],
] as const)("rejects malformed partitions at the report boundary: %s", (_name, mutate) => {
  const value = day();
  mutate(value);
  expect(calendarDaySchema.safeParse(value).success).toBe(false);
  expect(calendarDaySchema.parse(day()).modelCosts?.named[0].money.capturedCost).toBe(4);
});
