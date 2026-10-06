// Calendar arithmetic uses date labels. UTC instants are only used at timezone boundaries.
export function validTimezone(value: string): boolean {
  if (!value || value.length > 100 || /^[+-]/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function shiftDate(date: string, days: number): string {
  if (!validDate(date) || !Number.isSafeInteger(days) || Math.abs(days) > 366)
    throw Error("Calendar date unavailable");
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  const result = value.toISOString().slice(0, 10);
  if (!validDate(result)) throw Error("Calendar date unavailable");
  return result;
}
export function localDate(instant: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}
export function dayBoundary(date: string, timezone: string): string {
  if (!validDate(date) || !validTimezone(timezone)) throw Error("Calendar boundary unavailable");
  const nominal = Date.parse(`${date}T00:00:00Z`);
  // Find the first real instant belonging to this local date. Midnight can be skipped or repeated.
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const label = (n: number) => {
    const p = format.formatToParts(n);
    return `${p.find((x) => x.type === "year")!.value.padStart(4, "0")}-${p.find((x) => x.type === "month")!.value}-${p.find((x) => x.type === "day")!.value}`;
  };
  let low = nominal - 48 * 3600000,
    high = nominal + 48 * 3600000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (label(middle) < date) low = middle + 1;
    else high = middle;
  }
  if (label(low) !== date) throw Error("Calendar date unavailable");
  return new Date(low).toISOString();
}
export function latestStart(now: number, timezone: string): string {
  return shiftDate(localDate(now, timezone), -29);
}
export function calendarDays(startDate: string, timezone: string, count = 30) {
  if (!Number.isInteger(count) || count < 1 || count > 34)
    throw Error("Calendar range unavailable");
  const boundaries = Array.from({ length: count + 1 }, (_, n) =>
    dayBoundary(shiftDate(startDate, n), timezone),
  );
  return boundaries
    .slice(0, -1)
    .map((start, n) => ({ date: shiftDate(startDate, n), start, end: boundaries[n + 1] }));
}
