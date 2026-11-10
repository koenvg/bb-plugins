// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ViewState } from "../subagents-contract.js";
import { createViewStore } from "../bridge/subagents/view-store.js";
import { SubagentsView } from "./subagents-view.js";

installTestPluginRuntime();
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

it("shows projected attention and tool in overview and the visible detail header through settlement", () => {
  const store = createViewStore(
    () => {},
    () => 100000,
  );
  const owner = { sessionId: "synthetic-session", sessionFile: "/synthetic", generation: 1 };
  const observe = (
    state: "running" | "complete",
    activity: { state: string; currentTool: string },
  ) => {
    store.background(
      owner,
      [{ id: "attention", label: "Review", kind: "subagent", state, activity }],
      false,
    );
    return store.snapshot();
  };
  const view = render(
    <SubagentsView state={observe("running", { state: "needs_attention", currentTool: "bash" })} />,
  );
  const overview = view.getByRole("navigation", { name: "Observed children" });
  const activity = "Last observed activity: Needs attention · Reported tool: bash";
  const row = within(overview).getByRole("button", {
    name: "Review Background subagent · task unavailable Entry 1 running " + activity,
  });
  expect(within(row).getByText(activity).textContent).toBe(activity);
  expect(within(row).getByLabelText("Execution state: running").getAttribute("data-state")).toBe(
    "running",
  );
  fireEvent.click(row);
  const detail = view.getByRole("article", { name: "Child detail" });
  expect(within(detail.querySelector("header")!).getByText(activity).textContent).toBe(activity);
  expect(within(detail).getAllByText(activity)).toHaveLength(1);
  expect(within(detail).getByLabelText("Execution state: running").textContent).toBe("running");
  const active = 'Last observed activity: "active" · Reported tool: read';
  view.rerender(
    <SubagentsView state={observe("running", { state: "active", currentTool: "read" })} />,
  );
  expect(within(detail.querySelector("header")!).getByText(active).textContent).toBe(active);
  expect(within(detail).queryByText(activity)).toBeNull();
  view.rerender(
    <SubagentsView
      state={observe("complete", { state: "needs_attention", currentTool: "bash" })}
    />,
  );
  expect(within(detail).getByLabelText("Execution state: complete").textContent).toBe("complete");
  expect(within(detail.querySelector("header")!).getByText(activity).textContent).toBe(activity);
  fireEvent.click(view.getByRole("tab", { name: "Agents" }));
  expect(within(overview).getByRole("button").getAttribute("aria-label")).toBe(
    "Review Background subagent · task unavailable Entry 1 complete " + activity,
  );
});

it("renders legacy activity verbatim beside package pause without claiming confirmed waiting", () => {
  const state: ViewState = {
    kind: "pi-subagents-view",
    version: 1,
    updatedAt: 100000,
    availability: "available",
    reason: "",
    omitted: 0,
    rows: [
      {
        id: "legacy",
        runId: "legacy",
        sessionId: "synthetic-session",
        generation: 1,
        source: "background",
        kind: "subagent",
        label: "Legacy",
        state: "paused",
        activity: "waiting",
        incomplete: false,
        observedAt: 100000,
      },
    ],
  };
  const view = render(<SubagentsView state={state} />);
  const row = view.getByRole("button", {
    name: "Legacy Background subagent · task unavailable Entry 1 paused waiting",
  });
  expect(within(row).getByText("waiting", { exact: true }).textContent).toBe("waiting");
  expect(within(row).getByLabelText("Execution state: paused").textContent).toBe("paused");
  fireEvent.click(row);
  const header = view.getByRole("article", { name: "Child detail" }).querySelector("header")!;
  expect(within(header).getByText("waiting", { exact: true }).getAttribute("title")).toBe(
    "Activity is a reported observation. It does not confirm waiting or completion.",
  );
});
