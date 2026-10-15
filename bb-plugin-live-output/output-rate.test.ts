import { expect, it } from "vitest";
import { projectOutputRates, type RateHistory } from "./output-rate";

const history = (): RateHistory => ({
  startedAt: 1500,
  samples: Array.from({ length: 600 }, (_, second) => ({
    second,
    rawBytesPerSecond: second === 300 ? 120 : 80,
    smoothBytesPerSecond: second === 300 ? 60 : 40,
  })),
});
it("projects all supplied seconds without recomputing their raw or smooth facts", () => {
  const input = history();
  const smooth = projectOutputRates(input, { window: 30, unit: "tokens" });
  expect(smooth.history.kind).toBe("history");
  if (smooth.history.kind !== "history") throw new Error("expected history");
  expect(smooth.history.points).toHaveLength(600);
  expect(smooth.history.points[0]).toEqual({ second: 0, value: 10, observation: "before-start" });
  expect(smooth.history.points[1]).toEqual({ second: 1, value: 10, observation: "measured" });
  expect(smooth.history.points[300]).toEqual({ second: 300, value: 15, observation: "measured" });
  expect(smooth.history.points[599]?.second).toBe(599);
  expect([smooth.peak, smooth.maximum, smooth.rate(input.samples[0]!)]).toEqual([15, 20, 10]);
  const raw = projectOutputRates(input, { window: 1, unit: "tokens" });
  expect([raw.peak, raw.maximum, raw.rate(input.samples[300]!)]).toEqual([30, 36, 30]);
  const bytes = projectOutputRates(input, { window: 1, unit: "bytes" });
  expect([bytes.peak, bytes.maximum, bytes.rate(input.samples[300]!)]).toEqual([120, 144, 120]);
  expect(projectOutputRates(input, { window: 30, unit: "bytes" }).maximum).toBe(80);
});
it("preserves fractional rates, measured zero and collector fixed-divisor startup values", () => {
  const view = projectOutputRates(history(), { window: 30, unit: "tokens" });
  expect(view.rate({ rawBytesPerSecond: 13, smoothBytesPerSecond: 2.75 })).toBe(0.6875);
  expect(view.rate({ rawBytesPerSecond: 120, smoothBytesPerSecond: 4 })).toBe(1);
  expect(view.rate({ rawBytesPerSecond: 0, smoothBytesPerSecond: 0 })).toBe(0);
  expect(projectOutputRates(null, { window: 30, unit: "tokens" })).toMatchObject({
    peak: null,
    maximum: 20,
    history: { kind: "waiting" },
  });
});
it("rejects malformed history rather than sorting, deduplicating or repairing facts", () => {
  const input = history();
  expect(() =>
    projectOutputRates(
      { ...input, samples: input.samples.slice(1) },
      { window: 30, unit: "tokens" },
    ),
  ).toThrow("600 consecutive");
  for (const patch of [
    { second: 0 },
    { rawBytesPerSecond: -1 },
    { smoothBytesPerSecond: Infinity },
  ]) {
    const samples = input.samples.map((point, i) => (i === 2 ? { ...point, ...patch } : point));
    expect(() =>
      projectOutputRates({ ...input, samples }, { window: 30, unit: "tokens" }),
    ).toThrow();
  }
});
