const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const unitText = (value: number, unit: string): string =>
  `${value} ${unit}${value === 1 ? "" : "s"}`;

/** Uses elapsed time, not calendar days; reaching a reset never implies renewed quota. */
export function resetCountdown(resetAt: string | null, now: number): string {
  const remaining = (resetAt === null ? NaN : Date.parse(resetAt)) - now;
  if (!Number.isFinite(remaining)) return "Reset unknown";
  if (remaining <= 0) return "Reset due";
  if (remaining < MINUTE) return "Less than a minute left";

  const units: [number, string][] =
    remaining >= DAY
      ? [
          [Math.floor(remaining / DAY), "day"],
          [Math.floor((remaining % DAY) / HOUR), "hour"],
        ]
      : [
          [Math.floor(remaining / HOUR), "hour"],
          [Math.floor((remaining % HOUR) / MINUTE), "minute"],
        ];
  return `${units
    .filter(([value]) => value > 0)
    .map(([value, unit]) => unitText(value, unit))
    .join(", ")} left`;
}
