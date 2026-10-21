import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { calendarDaySchema } from "./calendar-contract.js";
import { calendarSnapshot } from "./calendar-test-support.js";
import { mergeDayModels, projectTokenModels } from "./calendar-models.js";
import { prepareNativeUsageFixture } from "../../../scripts/prepare-native-usage-fixture.js";

const day = {
  totalTokens: 300,
  coverage: { zero: false },
  models: {
    named: [
      { model: "gpt-6.1-sol", totalTokens: 200 },
      { model: "gpt-6.1", totalTokens: 100 },
    ],
    otherTokens: 0,
  },
};
it("draws model-only scalar series with authoritative literal totals", () => {
  const graph = projectTokenModels([day]);
  expect(graph.series.map((row) => row.label)).toEqual(["gpt-6.1", "gpt-6.1-sol"]);
  expect(graph.facts).toEqual([{ m0: 100, m1: 200 }]);
  expect(JSON.stringify(graph)).not.toMatch(/speed|Default|Fast/);
});
it("keeps named, overflow and unknown attribution distinct", () => {
  const graph = projectTokenModels([
    { ...day, totalTokens: 350, models: { ...day.models, otherTokens: 20 } },
  ]);
  expect(graph.series.map((row) => row.label)).toEqual([
    "gpt-6.1",
    "gpt-6.1-sol",
    "Other models",
    "Unknown model",
  ]);
  expect(graph.facts).toEqual([{ m0: 100, m1: 200, other: 20, unknown: 30 }]);
  expect(projectTokenModels([{ totalTokens: 300 }]).facts).toEqual([{ unknown: 300 }]);
});
it("sums the same model across machines without losing legacy named totals", () => {
  const merged = mergeDayModels([
    day,
    {
      totalTokens: 100,
      models: { named: [{ model: "gpt-6.1-sol", totalTokens: 100 }], otherTokens: 0 },
    },
  ]);
  expect(merged).toEqual({
    named: [
      { model: "gpt-6.1-sol", totalTokens: 300 },
      { model: "gpt-6.1", totalTokens: 100 },
    ],
    otherTokens: 0,
  });
  expect(
    projectTokenModels([
      {
        totalTokens: 300,
        models: { named: [{ model: "legacy-named", totalTokens: 300 }], otherTokens: 0 },
      },
    ]).facts,
  ).toEqual([{ m0: 300 }]);
});
it("rejects over-attribution and unsafe scalar model totals at the report boundary", () => {
  const sample = calendarSnapshot({
    startDate: "2026-09-01",
    timezone: "UTC",
    group: "workspace",
    scope: { kind: "host" },
  }).days[14];
  expect(
    calendarDaySchema.safeParse({ ...sample, ...day, coverage: sample.coverage }).success,
  ).toBe(true);
  expect(
    calendarDaySchema.safeParse({ ...sample, ...day, coverage: sample.coverage, totalTokens: 299 })
      .success,
  ).toBe(false);
  expect(
    calendarDaySchema.safeParse({
      ...sample,
      totalTokens: Number.MAX_SAFE_INTEGER,
      models: {
        named: [{ model: "large", totalTokens: Number.MAX_SAFE_INTEGER }],
        otherTokens: 1,
      },
    }).success,
  ).toBe(false);
});
it("carries captured model totals and raw money from public preparation into the graph", async () => {
  const reports = await prepareNativeUsageFixture();
  const report = reports.find(
    (value) => value.query.startDate === "2026-09-02" && value.query.group === "workspace",
  )!;
  expect(report.summary.totalTokens).toBe(450);
  expect(report.summary.money.capturedCost).toBe(0.03);
  expect(report.days.find((day) => day.date === "2026-09-15")?.models).toEqual({
    named: [{ model: "synthetic", totalTokens: 450 }],
    otherTokens: 0,
  });
  const graph = projectTokenModels(report.days);
  expect(graph.series.map((row) => row.label)).toEqual(["synthetic"]);
  expect(graph.facts.reduce((sum, row) => sum + (row.m0 ?? 0), 0)).toBe(450);
});
it("bounds ranking at eight with deterministic overflow and certified zero semantics", () => {
  const days = Array.from({ length: 10 }, (_, index) => ({
    totalTokens: 10,
    models: { named: [{ model: `model-${index}`, totalTokens: 10 }], otherTokens: 0 },
  }));
  const models = mergeDayModels(days);
  expect(models.named.map((row) => row.model)).toEqual([
    "model-0",
    "model-1",
    "model-2",
    "model-3",
    "model-4",
    "model-5",
    "model-6",
    "model-7",
  ]);
  expect(models.otherTokens).toBe(20);
  const graph = projectTokenModels([
    { totalTokens: 100, models },
    { totalTokens: 0 },
    { totalTokens: 0, coverage: { zero: true } },
  ]);
  expect(graph.series).toHaveLength(9);
  expect(graph.facts[0].other).toBe(20);
  expect(graph.facts[1].m0).toBeNull();
  expect(graph.facts[2].m0).toBe(0);
});

it("keeps a missing native model unknown without discarding a real Pi model named unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "model-totals-fixture-"));
  try {
    const base = new URL("../../../fixtures/", import.meta.url);
    const native =
      (await readFile(new URL("native-legacy-usage.jsonl", base), "utf8"))
        .trim()
        .split("\n")
        .map((line) => {
          const value = JSON.parse(line);
          if (value.type === "turn_context") delete value.payload.model;
          return JSON.stringify(value);
        })
        .join("\n") + "\n";
    const pi = (await readFile(new URL("pi-legacy-usage.jsonl", base), "utf8")).replaceAll(
      '"model":"synthetic"',
      '"model":"unavailable"',
    );
    await writeFile(join(root, "native-legacy-usage.jsonl"), native);
    await writeFile(join(root, "pi-legacy-usage.jsonl"), pi);
    const reports = await prepareNativeUsageFixture(root);
    const report = reports.find(
      (value) => value.query.startDate === "2026-09-02" && value.query.group === "workspace",
    )!;
    expect(report.summary.totalTokens).toBe(450);
    const known = report.days.flatMap((value) => value.models?.named ?? []);
    expect(known.reduce((sum, value) => sum + value.totalTokens, 0)).toBe(80);
    expect(known.every((row) => row.model === "unavailable")).toBe(true);
    const graph = projectTokenModels(report.days);
    expect(graph.series.some((row) => row.label.startsWith("Unknown model"))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
