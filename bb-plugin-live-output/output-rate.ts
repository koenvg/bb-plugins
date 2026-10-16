export type RateMode = Readonly<{ window: 1 | 30; unit: "tokens" | "bytes" }>;
export type ByteRates = Readonly<{ rawBytesPerSecond: number; smoothBytesPerSecond: number }>;
export type RateHistory = Readonly<{
  startedAt: number;
  samples: readonly (ByteRates & { readonly second: number })[];
}>;
export type RatePoint = Readonly<{
  second: number;
  value: number;
  observation: "before-start" | "measured";
}>;
export type OutputRateView = Readonly<{
  mode: RateMode;
  unitLabel: "est. tokens/s" | "bytes/s";
  windowLabel: "Raw 1-second bucket" | "30-second average";
  peak: number | null;
  maximum: number;
  history:
    | { readonly kind: "waiting" }
    | { readonly kind: "history"; readonly points: readonly RatePoint[] };
  rate: (rates: ByteRates) => number;
}>;
export function projectOutputRates(history: RateHistory | null, mode: RateMode): OutputRateView {
  const rate = (rates: ByteRates) =>
    (mode.window === 1 ? rates.rawBytesPerSecond : rates.smoothBytesPerSecond) /
    (mode.unit === "tokens" ? 4 : 1);
  if (
    history &&
    (history.samples.length !== 600 ||
      !Number.isFinite(history.startedAt) ||
      history.samples.some(
        (point, index) =>
          !Number.isInteger(point.second) ||
          point.second !== history.samples[0]!.second + index ||
          !Number.isFinite(point.rawBytesPerSecond) ||
          point.rawBytesPerSecond < 0 ||
          !Number.isFinite(point.smoothBytesPerSecond) ||
          point.smoothBytesPerSecond < 0,
      ))
  )
    throw new Error(
      "Output history must contain 600 consecutive integer seconds and finite nonnegative rates",
    );
  const points = history?.samples.map((point): RatePoint => ({
    second: point.second,
    value: rate(point),
    observation: (point.second + 1) * 1000 <= history.startedAt ? "before-start" : "measured",
  }));
  const peak = points ? Math.max(...points.map((point) => point.value)) : null;
  return {
    mode,
    unitLabel: mode.unit === "tokens" ? "est. tokens/s" : "bytes/s",
    windowLabel: mode.window === 1 ? "Raw 1-second bucket" : "30-second average",
    peak,
    maximum: Math.max((peak ?? 0) * 1.2, mode.unit === "tokens" ? 20 : 80),
    history: points ? { kind: "history", points } : { kind: "waiting" },
    rate,
  };
}
