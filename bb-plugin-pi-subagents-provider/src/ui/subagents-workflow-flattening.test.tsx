// @vitest-environment jsdom
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Capture, ViewRow, ViewState } from "../subagents-contract.js";
import { SubagentsView } from "./subagents-view.js";

installTestPluginRuntime();
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const row = (id: string, extra: Partial<ViewRow> = {}): ViewRow => ({
  id,
  runId: `run-${id}`,
  sessionId: "pi",
  generation: 1,
  source: "background",
  label: id,
  kind: "subagent",
  state: "complete",
  incomplete: false,
  observedAt: 10,
  ...extra,
});
const workflow = row("Workflow", { kind: "workflow" });
const child = row("Child", { parentId: workflow.id, index: 2, state: "running" });
const snapshot = (...rows: ViewRow[]): ViewState => ({
  kind: "pi-subagents-view",
  version: 1,
  updatedAt: 10,
  availability: "available",
  reason: "",
  omitted: 0,
  rows,
});
const capture = (extra: Partial<Capture> = {}): Capture => ({
  status: "captured",
  capturedAt: 10,
  ...extra,
});
type View = ReturnType<typeof render>;
const overviewButtons = (view: View) =>
  within(view.getByRole("navigation", { name: "Observed children" })).getAllByRole("button");
const labels = (view: View) =>
  overviewButtons(view).map((button) => button.querySelector(".pi-subagents-label")!.textContent);
const depths = (view: View) =>
  overviewButtons(view).map((button) => button.closest("li")!.style.paddingInlineStart);
const agents = (view: View) => fireEvent.click(view.getByRole("tab", { name: "Agents" }));

it.each([
  ["missing capture", undefined],
  ["empty successful capture", capture()],
  [
    "whitespace and zero truncation",
    capture({
      task: " \n ",
      finalOutput: "\t",
      reason: " ",
      messages: [],
      truncated: { task: false, finalOutput: false, messages: 0 },
    }),
  ],
] as const)(
  "promotes children for %s without changing raw references or observed counts",
  (_name, evidence) => {
    const parent = Object.freeze({
      ...workflow,
      capture: evidence,
      activity: "Completed workflow",
    });
    const frozenChild = Object.freeze(child);
    const state = snapshot(parent, frozenChild);
    const before = JSON.stringify(state);
    const view = render(<SubagentsView state={state} />);
    expect(labels(view)).toEqual(["Child"]);
    expect(depths(view)).toEqual(["0px"]);
    const button = overviewButtons(view)[0]!;
    expect(button.getAttribute("aria-label")).toBe(
      "Child Background subagent · task unavailable Entry 2 Child 3 running",
    );
    expect(view.getByRole("tab", { name: "Agents" }).getAttribute("aria-description")).toBe(
      "2 observed entries in available history. Not an active-worker count.",
    );
    fireEvent.click(button);
    expect(view.getByRole("tab", { name: "Child" }).getAttribute("title")).toBe(
      "Child · Entry 2 · running",
    );
    expect(view.getByRole("article").querySelector(".pi-subagents-reference")!.textContent).toBe(
      "Entry 2",
    );
    expect(JSON.stringify(state)).toBe(before);
    expect(state.rows[0]).toBe(parent);
    expect(state.rows[1]).toBe(frozenChild);
  },
);

const preservation: [string, Partial<ViewRow>][] = [
  ["task", { capture: capture({ task: "Parent instructions" }) }],
  ["output", { capture: capture({ finalOutput: "Parent result" }) }],
  [
    "blank transcript entry",
    { capture: capture({ messages: [{ role: "assistant", kind: "text", text: "" }] }) },
  ],
  [
    "tool call",
    {
      capture: capture({
        messages: [{ role: "assistant", kind: "toolCall", name: "read", text: "" }],
      }),
    },
  ],
  [
    "tool error",
    {
      capture: capture({
        messages: [{ role: "toolResult", kind: "toolResult", isError: true, text: "" }],
      }),
    },
  ],
  [
    "model evidence",
    {
      capture: capture({ resolvedModel: { provider: "openai", model: "gpt-5.4", capturedAt: 10 } }),
    },
  ],
  ["capture reason", { capture: capture({ reason: "Earlier capture failed" }) }],
  [
    "task truncation",
    { capture: capture({ truncated: { task: true, finalOutput: false, messages: 0 } }) },
  ],
  [
    "output truncation",
    { capture: capture({ truncated: { task: false, finalOutput: true, messages: 0 } }) },
  ],
  [
    "omitted messages",
    { capture: capture({ truncated: { task: false, finalOutput: false, messages: 1 } }) },
  ],
  [
    "message truncation",
    {
      capture: capture({
        messages: [{ role: "assistant", kind: "text", text: "", textTruncated: true }],
      }),
    },
  ],
  ["incomplete coverage", { incomplete: true }],
  ...(["pending", "not-captured", "unavailable", "unsupported", "timeout", "stale"] as const).map(
    (status): [string, Partial<ViewRow>] => [status, { capture: capture({ status }) }],
  ),
  ...(
    [
      "queued",
      "running",
      "failed",
      "partial",
      "paused",
      "stopped",
      "rejected",
      "unknown",
      "detached",
    ] as const
  ).map((state): [string, Partial<ViewRow>] => [state, { state }]),
  ...(["subagent", "step", "host-step"] as const).map((kind): [string, Partial<ViewRow>] => [
    kind,
    { kind },
  ]),
];
it.each(preservation)(
  "preserves %s, paired with an otherwise flattenable workflow",
  (_name, extra) => {
    const view = render(<SubagentsView state={snapshot(workflow, child)} />);
    expect(labels(view)).toEqual(["Child"]);
    view.rerender(<SubagentsView state={snapshot({ ...workflow, ...extra }, child)} />);
    expect(labels(view)).toEqual(["Workflow", "Child"]);
    expect(depths(view)).toEqual(["0px", "12px"]);
    fireEvent.click(overviewButtons(view)[0]!);
    expect(view.getByRole("article").querySelector("h3")!.textContent).toBe("Workflow");
  },
);

it("promotes nested wrappers under the nearest visible parent in depth-first order", () => {
  const view = render(
    <SubagentsView
      state={snapshot(
        row("Parent"),
        { ...workflow, parentId: "Parent" },
        row("Nested", { kind: "workflow", parentId: "Workflow", capture: capture() }),
        row("delegate", { parentId: "Nested", index: 0 }),
        row("Sibling", { parentId: "Workflow" }),
        row("delegate-2", { label: "delegate", parentId: "Parent", index: 1 }),
        row("Leaf workflow", { kind: "workflow" }),
      )}
    />,
  );
  expect(labels(view)).toEqual(["Parent", "delegate", "Sibling", "delegate", "Leaf workflow"]);
  expect(depths(view)).toEqual(["0px", "12px", "12px", "12px", "0px"]);
  expect(
    overviewButtons(view).map(
      (button) => button.querySelector(".pi-subagents-reference")!.textContent,
    ),
  ).toEqual(["Entry 1", "Entry 4", "Entry 5", "Entry 6", "Entry 7"]);
  fireEvent.click(overviewButtons(view)[1]!);
  agents(view);
  fireEvent.click(overviewButtons(view)[3]!);
  expect(view.getByRole("tab", { name: "delegate Entry 4" }).getAttribute("title")).toBe(
    "delegate · Entry 4 · complete",
  );
  expect(view.getByRole("tab", { name: "delegate Entry 6" }).getAttribute("title")).toBe(
    "delegate · Entry 6 · complete",
  );
});

it("keeps logical depth beyond four while empty wrappers consume no depth", () => {
  const hidden = Array.from({ length: 7 }, (_, index) =>
    row(`Hidden ${index}`, {
      kind: "workflow",
      parentId: index ? `Hidden ${index - 1}` : undefined,
    }),
  );
  const visible = Array.from({ length: 6 }, (_, index) =>
    row(`Visible ${index}`, {
      parentId: index ? `Visible ${index - 1}` : "Hidden 6",
    }),
  );
  const view = render(<SubagentsView state={snapshot(...hidden, ...visible)} />);
  expect(labels(view)).toEqual([
    "Visible 0",
    "Visible 1",
    "Visible 2",
    "Visible 3",
    "Visible 4",
    "Visible 5",
  ]);
  expect(depths(view)).toEqual(["0px", "12px", "24px", "36px", "48px", "48px"]);
  view.rerender(
    <SubagentsView
      state={snapshot(
        ...visible.map((item, index) => ({ ...item, parentId: index ? item.parentId : undefined })),
        ...hidden.map((item, index) => ({
          ...item,
          parentId: index ? item.parentId : "Visible 5",
        })),
        row("Deep child", { parentId: "Hidden 6" }),
      )}
    />,
  );
  expect(labels(view)).toEqual([
    "Visible 0",
    "Visible 1",
    "Visible 2",
    "Visible 3",
    "Visible 4",
    "Visible 5",
    "Deep child",
  ]);
  expect(depths(view)).toEqual(["0px", "12px", "24px", "36px", "48px", "48px", "48px"]);
});

it("retains orphan and cycle fallback without hiding the final traversable representative", () => {
  const view = render(
    <SubagentsView
      state={snapshot(
        row("Orphan wrapper", { kind: "workflow", parentId: "Missing" }),
        row("Orphan child", { parentId: "Orphan wrapper" }),
        row("Cycle A", { kind: "workflow", parentId: "Cycle B" }),
        row("Cycle B", { kind: "workflow", parentId: "Cycle A" }),
        row("Self cycle", { kind: "workflow", parentId: "Self cycle" }),
      )}
    />,
  );
  expect(labels(view)).toEqual(["Orphan child", "Cycle B", "Self cycle"]);
  expect(depths(view)).toEqual(["0px", "0px", "0px"]);
  expect(
    overviewButtons(view).map(
      (button) => button.querySelector(".pi-subagents-reference")!.textContent,
    ),
  ).toEqual(["Entry 2", "Entry 4", "Entry 5"]);
});

it("moves keyboard focus through visible rows only and opens the original child", () => {
  const view = render(<SubagentsView state={snapshot(workflow, child, row("Last"))} />);
  expect(labels(view)).toEqual(["Child", "Last"]);
  const [first, last] = overviewButtons(view);
  first!.focus();
  for (const key of ["ArrowDown", "End", "ArrowDown"]) {
    fireEvent.keyDown(document.activeElement!, { key });
    expect(document.activeElement).toBe(last);
  }
  for (const key of ["ArrowUp", "Home", "ArrowUp"]) {
    fireEvent.keyDown(document.activeElement!, { key });
    expect(document.activeElement).toBe(first);
  }
  fireEvent.keyDown(first!, { key: "Enter" });
  expect(view.getByRole("tab", { name: "Child" }).getAttribute("aria-selected")).toBe("true");
  expect(view.getByRole("article").textContent).toContain("Child 3");
});

it.each([false, true])(
  "opens a hidden raw root target, delayed=%s, but not its nested child",
  (delayed) => {
    const state = snapshot(workflow, child);
    const view = render(<SubagentsView state={delayed ? snapshot() : state} target="Workflow" />);
    if (delayed) {
      expect(view.getByRole("tab", { name: "Agents" }).getAttribute("aria-selected")).toBe("true");
      view.rerender(<SubagentsView state={state} target="Workflow" />);
    }
    expect(view.getByRole("tab", { name: "Workflow" }).getAttribute("aria-selected")).toBe("true");
    expect(view.getByRole("article").querySelector(".pi-subagents-reference")!.textContent).toBe(
      "Entry 1",
    );
    expect(view.queryByRole("alert")).toBeNull();
    agents(view);
    expect(labels(view)).toEqual(["Child"]);
    view.rerender(<SubagentsView state={state} target="Child" />);
    expect(view.getByRole("alert").textContent).toContain(
      "Requested background detail is unavailable",
    );
    expect(labels(view)).toEqual(["Child"]);
  },
);

it("lets manual visible navigation cancel a delayed hidden-root target", () => {
  const other = row("Other");
  const view = render(<SubagentsView state={snapshot(other)} target="Workflow" />);
  fireEvent.keyDown(overviewButtons(view)[0]!, { key: "Home" });
  view.rerender(<SubagentsView state={snapshot(workflow, child, other)} target="Workflow" />);
  expect(view.getByRole("tab", { name: "Agents" }).getAttribute("aria-selected")).toBe("true");
  expect(labels(view)).toEqual(["Child", "Other"]);
  expect(view.queryByRole("tab", { name: "Workflow" })).toBeNull();
});

it("retains a hidden workflow reader across visibility refresh, then evicts its capture DOM", () => {
  const populated = { ...workflow, capture: capture({ finalOutput: "Parent result" }) };
  const view = render(<SubagentsView state={snapshot(populated, child)} target="Workflow" />);
  const reader = view.getByRole("region", { name: "Captured conversation" });
  const disclosure = reader.querySelector<HTMLDetailsElement>(".pi-subagents-capture")!;
  disclosure.open = true;
  reader.scrollTop = 87;
  disclosure.querySelector("summary")!.focus();
  view.rerender(<SubagentsView state={snapshot(workflow, child)} target="Workflow" />);
  expect(view.getByRole("region", { name: "Captured conversation" })).toBe(reader);
  expect(disclosure.open).toBe(true);
  expect(document.activeElement).toBe(disclosure.querySelector("summary"));
  expect(reader.scrollTop).toBe(87);
  expect(view.getByRole("article").querySelector("h3")!.textContent).toBe("Workflow");
  agents(view);
  expect(labels(view)).toEqual(["Child"]);
  fireEvent.click(view.getByRole("tab", { name: "Workflow" }));
  view.rerender(<SubagentsView state={snapshot(child)} target="Workflow" />);
  expect(reader.isConnected).toBe(false);
  expect(view.getByRole("tabpanel").textContent).toContain(
    "outside the available captured history",
  );
  expect(view.queryByRole("article")).toBeNull();
  expect(document.activeElement).toBe(view.getByRole("tab", { name: "Unavailable agent" }));
  view.rerender(<SubagentsView state={snapshot(populated, child)} target="Workflow" />);
  expect(view.getByRole("region", { name: "Captured conversation" })).not.toBe(reader);
  expect(view.getByRole("article").textContent).toContain("Parent result");
});

it.each(["middle", "clamped", "none"])(
  "repairs removed overview focus at its clamped index, %s",
  (position) => {
    const populated = { ...workflow, capture: capture({ task: "Parent instructions" }) };
    const other = row("Other");
    const last = row("Last");
    const view = render(<SubagentsView state={snapshot(other, populated, child, last)} />);
    view.getByRole("button", { name: /Workflow.*Entry/ }).focus();
    const next =
      position === "none"
        ? snapshot()
        : position === "clamped"
          ? snapshot(other)
          : snapshot(other, workflow, child, last);
    view.rerender(<SubagentsView state={next} />);
    if (position === "none") {
      expect(view.getByRole("tabpanel").textContent).toContain("No child work has been captured");
      expect(document.activeElement).toBe(view.getByRole("tab", { name: "Agents" }));
    } else {
      expect(labels(view)).toEqual(position === "clamped" ? ["Other"] : ["Other", "Child", "Last"]);
      expect(document.activeElement).toBe(overviewButtons(view)[position === "clamped" ? 0 : 1]);
    }
  },
);

it("keeps surviving row and composer focus through visible-hidden-visible refresh", () => {
  const populated = { ...workflow, capture: capture({ task: "Parent instructions" }) };
  const content = (parent: ViewRow) => (
    <>
      <input aria-label="Composer" />
      <SubagentsView state={snapshot(parent, child)} />
    </>
  );
  const view = render(content(populated));
  const surviving = view.getByRole("button", { name: /Child.*Entry/ });
  surviving.focus();
  view.rerender(content(workflow));
  expect(labels(view)).toEqual(["Child"]);
  expect(document.activeElement).toBe(surviving);
  expect(depths(view)).toEqual(["0px"]);
  view.rerender(content(populated));
  expect(labels(view)).toEqual(["Workflow", "Child"]);
  expect(document.activeElement).toBe(surviving);
  expect(depths(view)).toEqual(["0px", "12px"]);
  const composer = view.getByRole("textbox", { name: "Composer" });
  composer.focus();
  view.rerender(content(workflow));
  expect(labels(view)).toEqual(["Child"]);
  expect(document.activeElement).toBe(composer);
});
