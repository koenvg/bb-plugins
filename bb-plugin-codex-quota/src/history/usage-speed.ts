import { z } from "zod";

export const speedModes = [
  { mode: "normal", label: "Normal" },
  { mode: "fast", label: "Fast" },
  { mode: "ultrafast", label: "Ultrafast" },
] as const;
export type SpeedMode = (typeof speedModes)[number]["mode"];
export type SpeedTokens = Readonly<Record<SpeedMode, number>>;
export type SpeedEvidence = { mode: SpeedMode; origin: "response" | "turn" | "policy" };

/** A recorded tier is not a measurement of throughput. Never consult current settings. */
export function normalizeSpeed(raw: unknown): SpeedMode {
  return raw === "fast" || raw === "priority"
    ? "fast"
    : raw === "ultrafast"
      ? "ultrafast"
      : "normal";
}
export const normalTokens = (total: number): SpeedTokens => ({
  normal: total,
  fast: 0,
  ultrafast: 0,
});
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const speedTokensSchema = z
  .object(
    Object.fromEntries(speedModes.map(({ mode }) => [mode, count])) as Record<
      SpeedMode,
      typeof count
    >,
  )
  .strict();
export function sumSpeed(values: readonly SpeedTokens[]): SpeedTokens {
  const result = normalTokens(0) as Record<SpeedMode, number>;
  for (const value of values)
    for (const { mode } of speedModes) {
      result[mode] += value[mode];
      if (!Number.isSafeInteger(result[mode]) || result[mode] < 0)
        throw Error("Speed total unavailable");
    }
  return result;
}
/** Decode only absence. A malformed present bucket must fail validation. */
export function withSpeed<T extends { totalTokens: number; speedTokens?: SpeedTokens }>(
  value: T,
): T {
  const speedTokens = value.speedTokens ?? normalTokens(value.totalTokens);
  if (
    !Number.isSafeInteger(speedTokens.normal + speedTokens.fast + speedTokens.ultrafast) ||
    speedTokens.normal + speedTokens.fast + speedTokens.ultrafast !== value.totalTokens
  )
    throw Error("Speed total mismatch");
  return { ...value, speedTokens };
}
