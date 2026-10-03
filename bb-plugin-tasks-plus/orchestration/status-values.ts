import { STATUS_LIMITS } from "./status-contract";

export function excerpt(
  text: string,
  totalCharacters?: number,
  limit: number = STATUS_LIMITS.textCharacters,
) {
  let total = 0;
  let capped = "";
  for (const character of text) {
    if (total < limit) capped += character;
    total++;
  }
  total = totalCharacters ?? total;
  const kept = Math.min(total, limit);
  return {
    text: capped,
    totalCharacters: total,
    omittedCharacters: total - kept,
  };
}
export function cappedList<T>(
  items: readonly T[],
  limit: number,
  total = items.length,
) {
  const kept = items.slice(0, limit);
  return { items: kept, total, omitted: total - kept.length };
}
export function references(items: readonly string[]) {
  const kept: string[] = [];
  for (const item of items) {
    if (item.length <= STATUS_LIMITS.referenceCodeUnits) kept.push(item);
    if (kept.length === STATUS_LIMITS.resultsPerReport) break;
  }
  return {
    items: kept,
    total: items.length,
    omitted: items.length - kept.length,
  };
}
export function removeListItems<T>(list: {
  items: T[];
  total: number;
  omitted: number;
}) {
  list.items = [];
  list.omitted = list.total;
}
