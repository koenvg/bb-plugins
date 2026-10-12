import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { calendarDaySchema } from "./calendar-contract.js";
import { calendarSnapshot } from "./calendar-test-support.js";
import { mergeDayModels, projectTokenModels } from "./calendar-models.js";
import { prepareSpeedFixture } from "../../../scripts/prepare-speed-fixture.js";

const day = {
  totalTokens: 300,
  coverage: { zero: false },
  speedTokens: { normal: 100, fast: 200, ultrafast: 0 },
  models: {
    named: [
      {
        model: "gpt-6.1-sol",
        totalTokens: 200,
        speedTokens: { normal: 0, fast: 200, ultrafast: 0 },
      },
      { model: "gpt-6.1", totalTokens: 100, speedTokens: { normal: 100, fast: 0, ultrafast: 0 } },
    ],
    otherTokens: 0,
    otherSpeedTokens: { normal: 0, fast: 0, ultrafast: 0 },
  },
};
it("draws only positive model and speed combinations, with the authoritative total", () => {
  const graph = projectTokenModels([day]);
  expect(graph.series.map((item) => item.label)).toEqual(["gpt-6.1 Default", "gpt-6.1-sol Fast"]);
  expect(Object.values(graph.facts[0]).reduce<number>((sum, n) => sum + (n ?? 0), 0)).toBe(300);
  expect(graph.series).toHaveLength(2);
});
it("keeps unknown-model speeds distinct and stable without changing their facts", () => {
  const input = [
    { ...day, models: undefined, speedTokens: { normal: 100, fast: 100, ultrafast: 100 } },
  ];
  const graph = projectTokenModels(input);
  expect(graph.series.map((row) => row.label)).toEqual([
    "Unknown model Default",
    "Unknown model Fast",
    "Unknown model Ultrafast",
  ]);
  expect(new Set(graph.series.map((row) => row.color)).size).toBe(3);
  expect(graph.facts).toEqual([{ unknown: 100, unknown_fast: 100, unknown_ultrafast: 100 }]);
  expect(projectTokenModels(input).series).toEqual(graph.series);
});
it("keeps the same model's modes separate through machine merging", () => {
  const second = {
    ...day,
    totalTokens: 100,
    speedTokens: { normal: 100, fast: 0, ultrafast: 0 },
    models: {
      named: [
        {
          model: "gpt-6.1-sol",
          totalTokens: 100,
          speedTokens: { normal: 100, fast: 0, ultrafast: 0 },
        },
      ],
      otherTokens: 0,
    },
  };
  const merged = mergeDayModels([day, second]);
  const graph = projectTokenModels([
    {
      ...day,
      totalTokens: 400,
      speedTokens: { normal: 200, fast: 200, ultrafast: 0 },
      models: merged,
    },
  ]);
  expect(graph.series.map((item) => item.label)).toEqual([
    "gpt-6.1 Default",
    "gpt-6.1-sol Default",
    "gpt-6.1-sol Fast",
  ]);
  expect(Object.values(graph.facts[0]).reduce<number>((sum, n) => sum + (n ?? 0), 0)).toBe(400);
});
it("does not invent model-speed relationships from old cached marginals", () => {
  const graph = projectTokenModels([
    { ...day, models: { named: [{ model: "gpt-6.1", totalTokens: 300 }], otherTokens: 0 } },
  ]);
  expect(graph.series.map((item) => item.label)).toEqual([
    "Unknown model Default",
    "Unknown model Fast",
  ]);
  expect(Object.values(graph.facts[0]).reduce<number>((sum, n) => sum + (n ?? 0), 0)).toBe(300);
  const old = projectTokenModels([
    {
      totalTokens: 300,
      coverage: { zero: false },
      models: { named: [{ model: "gpt-6.1", totalTokens: 300 }], otherTokens: 0 },
    },
  ]);
  expect(old.series.map((item) => item.label)).toEqual(["gpt-6.1 Default"]);
});
it("rejects contradictory model-speed attribution at the report boundary", () => {
  const sample = calendarSnapshot({
    startDate: "2026-09-01",
    timezone: "UTC",
    group: "workspace",
    scope: { kind: "host" },
  }).days[14];
  const value = {
    ...sample,
    ...day,
    coverage: { ...sample.coverage, zero: false },
    classes: { state: "unavailable" },
  };
  expect(calendarDaySchema.safeParse({ ...value }).success).toBe(true);
  const wrong = {
    ...day.models,
    named: [
      { model: "gpt-6.1", totalTokens: 300, speedTokens: { normal: 300, fast: 0, ultrafast: 0 } },
    ],
  };
  expect(calendarDaySchema.safeParse({ ...value, models: wrong }).success).toBe(false);
});
it("carries actual captured per-model tiers from public preparation into the graph", async () => {
  const reports = await prepareSpeedFixture();
  const report = reports.find(
    (value) => value.query.startDate === "2026-09-02" && value.query.group === "workspace",
  )!;
  const graph = projectTokenModels(report.days);
  expect(graph.series.some((item) => item.label.endsWith(" Fast") && item.model)).toBe(true);
  expect(graph.series.some((item) => item.label.endsWith(" Ultrafast") && item.model)).toBe(true);
  expect(graph.series.some((item) => item.label.endsWith(" Default") && item.model)).toBe(true);
  expect(
    graph.facts.reduce(
      (sum, values) =>
        sum + Object.values(values).reduce<number>((n, value) => n + (value ?? 0), 0),
      0,
    ),
  ).toBe(report.summary.totalTokens);
});

it("retains overflow speed attribution without drawing empty variants", () => {
  const days = Array.from({ length: 10 }, (_, index) => ({
    totalTokens: 10,
    coverage: { zero: false },
    speedTokens: { normal: 0, fast: 10, ultrafast: 0 },
    models: {
      named: [
        {
          model: `model-${index}`,
          totalTokens: 10,
          speedTokens: { normal: 0, fast: 10, ultrafast: 0 },
        },
      ],
      otherTokens: 0,
    },
  }));
  const models = mergeDayModels(days);
  expect(models.named).toHaveLength(8);
  expect(models.otherTokens).toBe(20);
  expect(models.otherSpeedTokens).toEqual({ normal: 0, fast: 20, ultrafast: 0 });
  const graph = projectTokenModels([
    {
      totalTokens: 100,
      coverage: { zero: false },
      speedTokens: { normal: 0, fast: 100, ultrafast: 0 },
      models,
    },
  ]);
  expect(graph.series).toHaveLength(9);
  expect(graph.series.every((row) => row.label.endsWith(" Fast"))).toBe(true);
  expect(graph.facts[0].other_fast).toBe(20);
});
it("rejects unsafe joint totals as schema errors, without throwing from safeParse", () => {
  const sample = calendarSnapshot({
    startDate: "2026-09-01",
    timezone: "UTC",
    group: "workspace",
    scope: { kind: "host" },
  }).days[14];
  const value = {
    ...sample,
    totalTokens: Number.MAX_SAFE_INTEGER,
    speedTokens: { normal: Number.MAX_SAFE_INTEGER, fast: 0, ultrafast: 0 },
    classes: { state: "unavailable" },
    models: {
      named: [
        {
          model: "gpt-6.1",
          totalTokens: Number.MAX_SAFE_INTEGER,
          speedTokens: { normal: Number.MAX_SAFE_INTEGER, fast: 0, ultrafast: 0 },
        },
      ],
      otherTokens: 1,
      otherSpeedTokens: { normal: 1, fast: 0, ultrafast: 0 },
    },
  };
  expect(calendarDaySchema.safeParse(value).success).toBe(false);
});

it("keeps a missing native model unknown without discarding a real Pi model named unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "model-speed-fixture-"));
  try {
    const base = new URL("../../../fixtures/", import.meta.url);
    const native =
      (await readFile(new URL("native-speed-policy.jsonl", base), "utf8"))
        .trim()
        .split("\n")
        .map((line) => {
          const value = JSON.parse(line);
          if (value.type === "turn_context") delete value.payload.model;
          return JSON.stringify(value);
        })
        .join("\n") + "\n";
    const pi = (await readFile(new URL("pi-speed.jsonl", base), "utf8")).replaceAll(
      '"model":"synthetic"',
      '"model":"unavailable"',
    );
    await writeFile(join(root, "native-speed-policy.jsonl"), native);
    await writeFile(join(root, "pi-speed.jsonl"), pi);
    const reports = await prepareSpeedFixture(root);
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
