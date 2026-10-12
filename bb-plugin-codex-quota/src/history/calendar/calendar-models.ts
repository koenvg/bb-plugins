import { z } from "zod";
import {
  normalTokens,
  speedModes,
  speedTokensSchema,
  sumSpeed,
  type SpeedMode,
  type SpeedTokens,
} from "../usage-speed.js";

export const MODEL_LIMIT = 8;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const speedTotal = (value: SpeedTokens) => value.normal + value.fast + value.ultrafast;
const modelRow = z
  .object({
    model: z
      .string()
      .min(1)
      .max(128)
      .refine((model) =>
        [...model].every(
          (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
        ),
      ),
    totalTokens: count.refine((value) => value > 0),
    speedTokens: speedTokensSchema.optional(),
  })
  .strict()
  .refine(
    (row) => !row.speedTokens || speedTotal(row.speedTokens) === row.totalTokens,
    "Model speed total mismatch",
  );
export const dayModelsSchema = z
  .object({
    named: z.array(modelRow).max(MODEL_LIMIT),
    otherTokens: count,
    otherSpeedTokens: speedTokensSchema.optional(),
  })
  .strict()
  .refine(
    (value) => new Set(value.named.map((row) => row.model)).size === value.named.length,
    "Duplicate model",
  )
  .refine((value) => Number.isSafeInteger(modelTotal(value)), "Unsafe model total")
  .refine(
    (value) => !value.otherSpeedTokens || speedTotal(value.otherSpeedTokens) === value.otherTokens,
    "Other model speed mismatch",
  );
export type DayModels = z.infer<typeof dayModelsSchema>;
type ModelDay = {
  totalTokens: number;
  coverage?: { zero: boolean };
  models?: DayModels;
  speedTokens?: SpeedTokens;
};
export function modelTotal(value: {
  named: { totalTokens: number }[];
  otherTokens: number;
}): number {
  return value.named.reduce((total, row) => total + row.totalTokens, value.otherTokens);
}
const compareId = (a: string, b: string) => {
  const encoder = new TextEncoder();
  const left = encoder.encode(a),
    right = encoder.encode(b);
  for (let n = 0; n < Math.min(left.length, right.length); n++) {
    if (left[n] !== right[n]) return left[n] - right[n];
  }
  return left.length - right.length;
};
export function validModelSpeeds(day: ModelDay): boolean {
  const attributed = { ...normalTokens(0) };
  const parts = [
    ...(day.models?.named.flatMap((row) => (row.speedTokens ? [row.speedTokens] : [])) ?? []),
    ...(day.models?.otherSpeedTokens ? [day.models.otherSpeedTokens] : []),
  ];
  for (const part of parts)
    for (const { mode } of speedModes) {
      attributed[mode] += part[mode];
      if (!Number.isSafeInteger(attributed[mode])) return false;
    }
  const total = day.speedTokens ?? normalTokens(day.totalTokens);
  return speedModes.every(({ mode }) => attributed[mode] <= total[mode]);
}
function jointModels(day: ModelDay) {
  const total = day.speedTokens ?? normalTokens(day.totalTokens);
  const legacyNormal = total.fast === 0 && total.ultrafast === 0;
  // Separate old model and speed marginals cannot prove a joint attribution.
  const rows = (day.models?.named ?? []).flatMap((row) => {
    const speedTokens = row.speedTokens ?? (legacyNormal ? normalTokens(row.totalTokens) : null);
    return speedTokens ? [{ ...row, speedTokens }] : [];
  });
  const other =
    day.models?.otherSpeedTokens ??
    (legacyNormal ? normalTokens(day.models?.otherTokens ?? 0) : normalTokens(0));
  return { rows, other, total };
}
export function mergeDayModels(days: readonly ModelDay[]): DayModels {
  const totals = new Map<string, SpeedTokens>();
  let otherSpeedTokens = normalTokens(0);
  for (const day of days) {
    const joint = jointModels(day);
    otherSpeedTokens = sumSpeed([otherSpeedTokens, joint.other]);
    for (const row of joint.rows)
      totals.set(row.model, sumSpeed([totals.get(row.model) ?? normalTokens(0), row.speedTokens]));
  }
  const ranked = [...totals].sort(
    (a, b) => speedTotal(b[1]) - speedTotal(a[1]) || compareId(a[0], b[0]),
  );
  for (const [, tokens] of ranked.slice(MODEL_LIMIT))
    otherSpeedTokens = sumSpeed([otherSpeedTokens, tokens]);
  return dayModelsSchema.parse({
    named: ranked.slice(0, MODEL_LIMIT).map(([model, speedTokens]) => ({
      model,
      totalTokens: speedTotal(speedTokens),
      speedTokens,
    })),
    otherTokens: speedTotal(otherSpeedTokens),
    otherSpeedTokens,
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
function modelColor(model: string, mode: SpeedMode): string {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(model)) hash = Math.imul(hash ^ byte, 16777619);
  const color = palette[(hash >>> 0) % palette.length];
  return mode === "normal"
    ? color
    : `color-mix(in oklab, ${color} ${mode === "fast" ? 78 : 56}%, var(--foreground))`;
}
export type ModelSeries = {
  key: string;
  label: string;
  color: string;
  model?: string;
  speed: SpeedMode;
};
const label = (mode: SpeedMode) =>
  mode === "normal" ? "Default" : speedModes.find((value) => value.mode === mode)!.label;
const key = (base: string, mode: SpeedMode) => (mode === "normal" ? base : `${base}_${mode}`);
export function projectTokenModels(days: readonly ModelDay[]) {
  const joints = days.map(jointModels);
  const totals = new Map<string, bigint>();
  for (const joint of joints)
    for (const row of joint.rows)
      totals.set(row.model, (totals.get(row.model) ?? 0n) + BigInt(row.totalTokens));
  const selected = [...totals]
    .sort((a, b) => (a[1] === b[1] ? compareId(a[0], b[0]) : a[1] > b[1] ? -1 : 1))
    .slice(0, MODEL_LIMIT)
    .map(([model]) => model)
    .sort(compareId);
  const series: ModelSeries[] = selected.flatMap((model, index) =>
    speedModes
      .filter(({ mode }) =>
        joints.some((joint) =>
          joint.rows.some((row) => row.model === model && row.speedTokens[mode] > 0),
        ),
      )
      .map(({ mode }) => ({
        key: key(`m${index}`, mode),
        label: `${model} ${label(mode)}`,
        model,
        speed: mode,
        color: modelColor(model, mode),
      })),
  );
  const facts = joints.map((joint, index) => {
    const values: Record<string, number | null> = {};
    let other = joint.other;
    let known = joint.other;
    for (const row of joint.rows) {
      known = sumSpeed([known, row.speedTokens]);
      if (!selected.includes(row.model)) other = sumSpeed([other, row.speedTokens]);
    }
    for (const item of series)
      values[item.key] =
        joint.rows.find((row) => row.model === item.model)?.speedTokens[item.speed] ?? 0;
    for (const { mode } of speedModes) {
      if (known[mode] > joint.total[mode])
        throw Error("Model speed attribution exceeds recorded tokens");
      values[key("other", mode)] = other[mode];
      values[key("unknown", mode)] = joint.total[mode] - known[mode];
    }
    if (!days[index].totalTokens && !days[index].coverage?.zero)
      for (const name of Object.keys(values)) values[name] = null;
    return values;
  });
  for (const base of ["other", "unknown"] as const)
    for (const { mode } of speedModes)
      if (facts.some((day) => (day[key(base, mode)] ?? 0) > 0))
        series.push({
          key: key(base, mode),
          label: `${base === "other" ? "Other models" : "Unknown model"} ${label(mode)}`,
          speed: mode,
          color: modelColor(base, mode),
        });
  for (const values of facts)
    for (const name of Object.keys(values))
      if (!series.some((item) => item.key === name)) delete values[name];
  return { series, facts };
}
