import { expect, it } from "vitest";
import { calendarDaySchema } from "./calendar-contract.js";
import { calendarSnapshot } from "./calendar-test-support.js";
import { dayModelsSchema, mergeDayModels, projectTokenModels } from "./calendar-models.js";

const day = (model: string, totalTokens = 10) => ({
  totalTokens,
  coverage: { zero: false },
  models: { named: [{ model, totalTokens }], otherTokens: 0 },
});
it("rejects duplicate, unsafe, malformed, and excessive model attribution at the report boundary", () => {
  for (const models of [
    {
      named: [
        { model: "gpt", totalTokens: 1 },
        { model: "gpt", totalTokens: 1 },
      ],
      otherTokens: 0,
    },
    { named: [{ model: "", totalTokens: 1 }], otherTokens: 0 },
    { named: [{ model: "bad\nmodel", totalTokens: 1 }], otherTokens: 0 },
    { named: [{ model: "gpt", totalTokens: Number.MAX_SAFE_INTEGER }], otherTokens: 1 },
    {
      named: Array.from({ length: 9 }, (_, n) => ({ model: String(n), totalTokens: 1 })),
      otherTokens: 0,
    },
  ])
    expect(dayModelsSchema.safeParse(models).success).toBe(false);
  const value = calendarSnapshot({
    startDate: "2026-09-01",
    timezone: "UTC",
    group: "workspace",
    scope: { kind: "host" },
  }).days[14];
  expect(calendarDaySchema.safeParse(value).success).toBe(true);
  expect(calendarDaySchema.safeParse({ ...value, models: day("gpt", 601).models }).success).toBe(
    false,
  );
});
it("keeps Other distinct from Unknown and uses safe generated drawing keys", () => {
  const merged = mergeDayModels(Array.from({ length: 10 }, (_, n) => day(`gpt.${n}`, 10)));
  expect(merged.named).toHaveLength(8);
  expect(merged.otherTokens).toBe(20);
  const chart = projectTokenModels([
    { totalTokens: 110, coverage: { zero: false }, models: merged },
  ]);
  expect(chart.series.map((row) => row.key)).toEqual([
    "m0",
    "m1",
    "m2",
    "m3",
    "m4",
    "m5",
    "m6",
    "m7",
    "other",
    "unknown",
  ]);
  expect(chart.facts[0].other).toBe(20);
  expect(chart.facts[0].unknown).toBe(10);
  expect(Object.values(chart.facts[0]).reduce<number>((sum, value) => sum + (value ?? 0), 0)).toBe(
    110,
  );
});
it("keeps colors stable when ranks, dates, or neighboring models change", () => {
  const color = (days: ReturnType<typeof day>[]) =>
    projectTokenModels(days).series.find((row) => row.model === "gpt")!.color;
  expect(color([day("gpt")])).toBe(color([day("aaa", 20), day("gpt", 1)]));
  expect(color([day("gpt", Number.MAX_SAFE_INTEGER), day("gpt", Number.MAX_SAFE_INTEGER)])).toBe(
    color([day("gpt")]),
  );
});
it("preserves unknown dates, observed zero, and a real model named unknown", () => {
  const projection = projectTokenModels([
    day("unknown"),
    { totalTokens: 0, coverage: { zero: false } },
    { totalTokens: 0, coverage: { zero: true } },
  ]);
  expect(projection.series[0]).toMatchObject({ key: "m0", label: "unknown", model: "unknown" });
  expect(projection.facts[1].m0).toBeNull();
  expect(projection.facts[2].m0).toBe(0);
});
