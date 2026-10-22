import { boundedValue, VIEW_BYTES, type Capture, type ViewState } from "./subagents-contract.js";

function clip(text: string, limit: number, tail = false): string {
  const points = Array.from(text);
  return (tail && limit > 0 ? points.slice(-limit) : points.slice(0, limit)).join("");
}

function compact(capture: Capture, task: number, output: number, messages: number, text: number) {
  const truncated = capture.truncated ?? { task: false, finalOutput: false, messages: 0 };
  capture.truncated = { ...truncated };
  if (capture.task !== undefined) {
    const value = clip(capture.task, task);
    capture.truncated.task ||= value !== capture.task;
    capture.task = value;
  }
  if (capture.finalOutput !== undefined) {
    const value = clip(capture.finalOutput, output, true);
    capture.truncated.finalOutput ||= value !== capture.finalOutput;
    capture.finalOutput = value;
  }
  if (capture.messages) {
    const selected = capture.messages
      .map((message, index) => ({ message, index }))
      .sort(
        (a, b) =>
          Number(b.message.isError === true) - Number(a.message.isError === true) ||
          b.index - a.index,
      )
      .slice(0, messages)
      .sort((a, b) => a.index - b.index)
      .map(({ message }) => message);
    capture.truncated.messages += capture.messages.length - selected.length;
    capture.messages = selected.map((message) => {
      const value = clip(message.text, text);
      return {
        ...message,
        text: value,
        ...(value !== message.text ? { textTruncated: true } : {}),
      };
    });
  }
}

/** Newest-priority rows first. All retained identities stay intact. */
export function fitViewState(candidate: ViewState): ViewState {
  const state = structuredClone(candidate);
  function evict() {
    state.rows.pop();
    state.omitted++;
    const ids = new Set(state.rows.map((row) => row.id));
    for (const row of state.rows) if (row.parentId && !ids.has(row.parentId)) delete row.parentId;
  }
  while (state.rows.length > 128) evict();
  const fits = () => boundedValue(state, VIEW_BYTES);
  if (fits()) return state;
  for (const [task, output, messages, text] of [
    [512, 2048, 4, 256],
    [256, 1024, 2, 256],
    [128, 512, 1, 128],
    [64, 256, 1, 64],
    [64, 256, 0, 0],
    [32, 64, 0, 0],
  ] as const) {
    for (const row of state.rows)
      if (row.capture) compact(row.capture, task, output, messages, text);
    if (fits()) return state;
  }
  while (!fits() && state.rows.length) evict();
  return state;
}
