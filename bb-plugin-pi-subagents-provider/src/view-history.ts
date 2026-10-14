import { retainCapture } from "./capture-history.js";
import {
  parseViewState,
  boundedValue,
  VIEW_BYTES,
  type ViewState,
  type ViewRow,
} from "./subagents-contract.js";
/** Newest first. Restore accepted captures from the bounded published event window. */
export function restoreViewHistory(values: readonly unknown[]): ViewState | undefined {
  const states = values
    .slice(0, 64)
    .map(parseViewState)
    .filter((s): s is ViewState => !!s);
  const latest = states[0];
  if (!latest) return;
  const rows = new Map<string, ViewRow>();
  for (const state of states)
    for (const original of state.rows) {
      const previous = rows.get(original.id);
      if (!previous) {
        const olderLive =
          state !== latest && ["running", "queued", "detached"].includes(original.state);
        rows.set(
          original.id,
          structuredClone({
            ...original,
            capture: undefined,
            ...(olderLive ? { state: "unknown" as const, incomplete: true } : {}),
          }),
        );
      }
    }
  // Replay captures in live-store order; row identity and ordering remain newest first.
  for (const state of [...states].reverse())
    for (const original of state.rows) {
      const row = rows.get(original.id)!;
      row.capture = retainCapture(original.capture, row.capture);
    }
  const result = { ...latest, rows: [...rows.values()], omitted: latest.omitted };
  while (result.rows.length > 128 || !boundedValue(result, VIEW_BYTES)) {
    result.rows.pop();
    result.omitted++;
  }
  return parseViewState(result);
}
