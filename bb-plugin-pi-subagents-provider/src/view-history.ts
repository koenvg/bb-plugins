import { retainCapture } from "./capture-history.js";
import {
  parseViewState,
  boundedValue,
  VIEW_BYTES,
  type ViewState,
  type ViewRow,
} from "./subagents-contract.js";
/** Newest first. Previous attribution is local to one mounted thread reader. */
export function restoreViewHistory(
  values: readonly unknown[],
  previous?: ViewState,
): ViewState | undefined {
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
  const previousRows = new Map(previous?.rows.map((row) => [row.id, row]));
  for (const row of rows.values()) {
    const prior = previousRows.get(row.id);
    if (
      row.capture?.task !== undefined ||
      prior?.capture?.task === undefined ||
      prior.sessionId !== row.sessionId ||
      prior.runId !== row.runId
    )
      continue;
    row.capture = {
      ...(row.capture ?? { status: "not-captured", capturedAt: prior.capture.capturedAt }),
      task: prior.capture.task,
      ...(row.capture?.truncated || prior.capture.truncated
        ? {
            truncated: {
              task: prior.capture.truncated?.task ?? false,
              finalOutput: row.capture?.truncated?.finalOutput ?? false,
              messages: row.capture?.truncated?.messages ?? 0,
            },
          }
        : {}),
    };
  }
  const result = { ...latest, rows: [...rows.values()], omitted: latest.omitted };
  while (result.rows.length > 128 || !boundedValue(result, VIEW_BYTES)) {
    result.rows.pop();
    result.omitted++;
  }
  return parseViewState(result);
}
