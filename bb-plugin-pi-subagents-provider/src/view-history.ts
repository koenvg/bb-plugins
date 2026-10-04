import { parseViewState, boundedValue, VIEW_BYTES, type Capture, type ViewState, type ViewRow } from "./subagents-contract.js";
/** Newest first. Restore accepted captures from the bounded published event window. */
export function restoreViewHistory(values: readonly unknown[]): ViewState | undefined {
  const states = values.slice(0,64).map(parseViewState).filter((s): s is ViewState => !!s);
  const latest = states[0]; if (!latest) return;
  const rows = new Map<string,ViewRow>();
  for (const state of states) for (const original of state.rows) {
    const previous = rows.get(original.id);
    if (!previous) {
      const olderLive = state !== latest && ["running","queued","detached"].includes(original.state);
      rows.set(original.id, structuredClone({ ...original, ...(olderLive ? { state: "unknown" as const, incomplete: true } : {}) }));
    } else if (original.capture) {
      const capture = previous.capture;
      const old = original.capture;
      const restored: Capture = { ...old, ...capture, task: capture?.task ?? old.task, finalOutput: capture?.finalOutput ?? old.finalOutput, messages: capture?.messages?.length ? capture.messages : old.messages };
      if (capture?.status !== "captured" && old.status === "captured") { restored.capturedAt = old.capturedAt; restored.attemptedAt = capture?.attemptedAt ?? capture?.capturedAt; }
      previous.capture = restored;
    }
  }
  const result = { ...latest, rows: [...rows.values()], omitted: latest.omitted };
  while (result.rows.length > 128 || !boundedValue(result,VIEW_BYTES)) { result.rows.pop(); result.omitted++; }
  return parseViewState(result);
}
