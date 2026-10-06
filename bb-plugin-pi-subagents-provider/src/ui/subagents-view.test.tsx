// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SubagentsView } from "./subagents-view.js";
import { type ViewState } from "../subagents-contract.js";
afterEach(cleanup);
const base = {
  sessionId: "pi",
  generation: 1,
  source: "background",
  kind: "subagent",
  state: "complete",
  incomplete: false,
  observedAt: 1,
} as const;
const state: ViewState = {
  kind: "pi-subagents-view",
  version: 1,
  updatedAt: 1,
  availability: "available",
  reason: "",
  omitted: 1,
  rows: [
    {
      ...base,
      id: "root",
      runId: "r",
      label: "Root",
      capture: { status: "captured", capturedAt: 1, task: "first\nsecond", finalOutput: "answer" },
    },
    {
      ...base,
      id: "child",
      parentId: "root",
      runId: "c",
      label: "Child",
      state: "running",
      incomplete: true,
      capture: { status: "timeout", capturedAt: 2, reason: "No reply" },
    },
  ],
};
it("shows wrapped captured data, limits and keyboard selection without execution controls", () => {
  const view = render(<SubagentsView state={state} />);
  expect(view.getByText("answer").className).toContain("whitespace-pre-wrap");
  const buttons = view.getAllByRole("button");
  expect(buttons).toHaveLength(2);
  buttons[0]!.focus();
  fireEvent.keyDown(buttons[0]!, { key: "ArrowDown" });
  expect(view.getByRole("article").textContent).toContain("Execution state: running");
  expect(view.getByRole("article").textContent).toContain("Capture timeout: No reply");
  expect(document.activeElement).toBe(buttons[1]);
  fireEvent.keyDown(buttons[1]!, { key: "Home" });
  expect(document.activeElement).toBe(buttons[0]);
});
it("distinguishes loading, empty, unavailable and failed reads while retaining data", () => {
  const view = render(<SubagentsView loading />);
  expect(view.getByRole("status").textContent).toContain("Loading");
  view.rerender(<SubagentsView />);
  expect(view.getByText(/No child work/)).toBeDefined();
  view.rerender(<SubagentsView state={state} error="Read failed" />);
  expect(view.getByRole("alert").textContent).toContain("Read failed");
  expect(view.getByText("answer")).toBeDefined();
});
it("discloses clipped transcript text through the persisted message schema", () => {
  const changed: ViewState = {
    ...state,
    rows: [
      {
        ...state.rows[0]!,
        capture: {
          status: "captured",
          capturedAt: 1,
          messages: [{ role: "assistant", kind: "text", text: "clipped", textTruncated: true }],
        },
      },
    ],
  };
  const view = render(<SubagentsView state={changed} />);
  expect(view.getByText("Transcript text was truncated.")).toBeDefined();
});
