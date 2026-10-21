import { z } from "zod";

export const MODEL_LIMIT = 8;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const modelIdSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((model) =>
    [...model].every(
      (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
    ),
  );
const modelRow = z.object({ model: modelIdSchema, totalTokens: count.positive() }).strict();
export const dayModelsSchema = z
  .object({
    named: z.array(modelRow).max(MODEL_LIMIT),
    otherTokens: count,
  })
  .strict()
  .refine(
    (value) => new Set(value.named.map((row) => row.model)).size === value.named.length,
    "Duplicate model",
  )
  .refine((value) => Number.isSafeInteger(modelTotal(value)), "Unsafe model total");
export type DayModels = z.infer<typeof dayModelsSchema>;
type ModelDay = { totalTokens: number; coverage?: { zero: boolean }; models?: DayModels };
export function modelTotal(value: {
  named: { totalTokens: number }[];
  otherTokens: number;
}): number {
  return value.named.reduce((total, row) => total + row.totalTokens, value.otherTokens);
}
export const compareId = (a: string, b: string) => {
  const encoder = new TextEncoder();
  const left = encoder.encode(a),
    right = encoder.encode(b);
  for (let n = 0; n < Math.min(left.length, right.length); n++) {
    if (left[n] !== right[n]) return left[n] - right[n];
  }
  return left.length - right.length;
};
function safeTotal(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw Error("Model total unavailable");
  return value;
}
export function mergeDayModels(days: readonly ModelDay[]): DayModels {
  const totals = new Map<string, number>();
  let otherTokens = 0;
  for (const day of days) {
    if (day.models && modelTotal(day.models) > day.totalTokens)
      throw Error("Model attribution exceeds recorded tokens");
    otherTokens = safeTotal(otherTokens + (day.models?.otherTokens ?? 0));
    for (const row of day.models?.named ?? [])
      totals.set(row.model, safeTotal((totals.get(row.model) ?? 0) + row.totalTokens));
  }
  const ranked = [...totals].sort((a, b) => b[1] - a[1] || compareId(a[0], b[0]));
  for (const [, tokens] of ranked.slice(MODEL_LIMIT)) otherTokens = safeTotal(otherTokens + tokens);
  return dayModelsSchema.parse({
    named: ranked.slice(0, MODEL_LIMIT).map(([model, totalTokens]) => ({ model, totalTokens })),
    otherTokens,
  });
}
const palette = [
  "light-dark(#42689c, #92b4e2)",
  "light-dark(#2c8b7d, #6ac3b0)",
  "light-dark(#ab8b54, #d8b978)",
  "light-dark(#8b6599, #bd97cb)",
  "light-dark(#a66b5b, #d99b89)",
  "light-dark(#678346, #a4c180)",
];
export function modelColor(model: string): string {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(model)) hash = Math.imul(hash ^ byte, 16777619);
  return palette[(hash >>> 0) % palette.length];
}
export type ModelSeries = { key: string; label: string; color: string; model?: string };
export function projectTokenModels(days: readonly ModelDay[]) {
  const totals = new Map<string, bigint>();
  for (const day of days)
    for (const row of day.models?.named ?? [])
      totals.set(row.model, (totals.get(row.model) ?? 0n) + BigInt(row.totalTokens));
  const selected = [...totals]
    .sort((a, b) => (a[1] === b[1] ? compareId(a[0], b[0]) : a[1] > b[1] ? -1 : 1))
    .slice(0, MODEL_LIMIT)
    .map(([model]) => model)
    .sort(compareId);
  const series: ModelSeries[] = selected.map((model, index) => ({
    key: `m${index}`,
    label: model,
    model,
    color: modelColor(model),
  }));
  const facts = days.map((day) => {
    const values: Record<string, number | null> = {};
    let other = day.models?.otherTokens ?? 0;
    const known = safeTotal(day.models ? modelTotal(day.models) : 0);
    if (known > day.totalTokens) throw Error("Model attribution exceeds recorded tokens");
    for (const row of day.models?.named ?? [])
      if (!selected.includes(row.model)) other = safeTotal(other + row.totalTokens);
    for (const item of series)
      values[item.key] =
        day.models?.named.find((row) => row.model === item.model)?.totalTokens ?? 0;
    values.other = other;
    values.unknown = day.totalTokens - known;
    if (!day.totalTokens && !day.coverage?.zero)
      for (const name of Object.keys(values)) values[name] = null;
    return values;
  });
  for (const base of ["other", "unknown"] as const)
    if (facts.some((day) => (day[base] ?? 0) > 0))
      series.push({
        key: base,
        label: base === "other" ? "Other models" : "Unknown model",
        color: modelColor(base),
      });
  for (const values of facts)
    for (const name of Object.keys(values))
      if (!series.some((item) => item.key === name)) delete values[name];
  return { series, facts };
}
