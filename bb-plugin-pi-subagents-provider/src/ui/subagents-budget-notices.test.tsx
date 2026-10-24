// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SubagentsView } from "./subagents-view.js";
import type { ViewState } from "../subagents-contract.js";
installTestPluginRuntime();
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const state: ViewState = {
  kind: "pi-subagents-view",
  version: 1,
  updatedAt: 1,
  availability: "available",
  reason: "",
  omitted: 0,
  rows: [
    {
      id: "r",
      runId: "r",
      sessionId: "pi",
      generation: 1,
      source: "background",
      label: "reader",
      kind: "subagent",
      state: "complete",
      incomplete: false,
      observedAt: 1,
      capture: {
        status: "captured",
        capturedAt: 1,
        task: "",
        finalOutput: "",
        messages: [],
        truncated: { task: true, finalOutput: true, messages: 4 },
      },
    },
  ],
};
it("distinguishes budget-omitted excerpts from content that was never captured", () => {
  const view = render(<SubagentsView state={state} />);
  fireEvent.click(view.getByRole("button", { name: /reader.*Entry/ }));
  expect(view.getByText("Task text was truncated.").textContent).toBe("Task text was truncated.");
  expect(view.getByText("Final output was truncated.").textContent).toBe(
    "Final output was truncated.",
  );
  expect(view.getByText("4 transcript entries omitted.").textContent).toBe(
    "4 transcript entries omitted.",
  );
  expect(view.queryByText("Recent transcript not captured.")).toBeNull();
  expect(view.queryByText("Task attribution not captured.")).toBeNull();
  expect(view.getByText("Recent transcript omitted by the capture budget.").textContent).toBe(
    "Recent transcript omitted by the capture budget.",
  );
  view.rerender(
    <SubagentsView
      state={{
        ...state,
        rows: [{ ...state.rows[0]!, capture: { status: "not-captured", capturedAt: 1 } }],
      }}
    />,
  );
  expect(view.getByText("Recent transcript not captured.").textContent).toBe(
    "Recent transcript not captured.",
  );
  expect(view.getByText("Task attribution not captured.").textContent).toBe(
    "Task attribution not captured.",
  );
});
