// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ViewRow, ViewState } from "../subagents-contract.js";
import { SubagentsView } from "./subagents-view.js";

installTestPluginRuntime();
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
const row = (id: string, extra: Partial<ViewRow> = {}): ViewRow => ({
  id,
  runId: id,
  sessionId: "pi",
  generation: 1,
  source: "background",
  kind: "subagent",
  label: id,
  state: "running",
  incomplete: false,
  observedAt: 10,
  capture: {
    status: "captured",
    capturedAt: 10,
    task: `Task for ${id}`,
    messages: [{ role: "assistant", kind: "toolCall", name: "read", text: `input ${id}` }],
  },
  ...extra,
});
const alpha = row("Alpha");
const beta = row("Beta");
const snapshot = (...rows: ViewRow[]): ViewState => ({
  kind: "pi-subagents-view",
  version: 1,
  updatedAt: 10,
  availability: "available",
  reason: "",
  omitted: 0,
  rows,
});
const state = snapshot(alpha, beta);
type View = ReturnType<typeof render>;
const tab = (view: View, name: string) => view.getByRole("tab", { name });
function open(view: View, name: string) {
  fireEvent.click(view.getByRole("button", { name: new RegExp(`${name}.*Entry`) }));
}
function agents(view: View) {
  fireEvent.click(tab(view, "Agents"));
}
function selected(view: View) {
  return view
    .getAllByRole("tab")
    .filter((node) => node.getAttribute("aria-selected") === "true")
    .map((node) => node.querySelector(".pi-subagents-tab-label")!.textContent);
}

it("starts at a full overview, opens unique retained views and keeps their order", () => {
  const view = render(<SubagentsView state={state} />);
  expect(selected(view)).toEqual(["Agents"]);
  expect(view.getByRole("navigation", { name: "Observed children" }).textContent).toContain(
    "Task for Alpha",
  );
  expect(view.queryByRole("article")).toBeNull();
  open(view, "Alpha");
  const detail = view.getByRole("article");
  expect(selected(view)).toEqual(["Alpha"]);
  expect(document.activeElement).toBe(tab(view, "Alpha"));
  agents(view);
  open(view, "Beta");
  agents(view);
  open(view, "Alpha");
  expect(
    view
      .getAllByRole("tab")
      .map((node) => node.querySelector(".pi-subagents-tab-label")!.textContent),
  ).toEqual(["Agents", "Alpha", "Beta"]);
  expect(view.getByRole("article")).toBe(detail);
  expect(view.getAllByRole("article", { hidden: true })).toHaveLength(2);
  expect(view.queryByRole("navigation")).toBeNull();
});

it("closes only views, selects the preceding tab and preserves inactive selection and focus", () => {
  const view = render(<SubagentsView state={state} />);
  open(view, "Alpha");
  agents(view);
  open(view, "Beta");
  const reader = view.getByRole("region", { name: "Captured conversation" });
  reader.focus();
  fireEvent.click(view.getByRole("button", { name: "Close Alpha tab" }));
  expect(selected(view)).toEqual(["Beta"]);
  expect(document.activeElement).toBe(reader);
  fireEvent.click(view.getByRole("button", { name: "Close Beta tab" }));
  expect(selected(view)).toEqual(["Agents"]);
  expect(document.activeElement).toBe(tab(view, "Agents"));
  open(view, "Alpha");
  agents(view);
  open(view, "Beta");
  fireEvent.click(view.getByRole("button", { name: "Close Beta tab" }));
  expect(selected(view)).toEqual(["Alpha"]);
  expect(document.activeElement).toBe(tab(view, "Alpha"));
  expect(view.getByRole("article").textContent).toContain("Task for Alpha");
  expect(view.queryByRole("button", { name: /stop|abort|resume|retry|spawn/i })).toBeNull();
  agents(view);
  expect(view.getAllByRole("button", { name: /Entry/ })).toHaveLength(2);
});

it("keeps task, conversation, tool disclosure and numeric scroll through hidden polls", () => {
  const view = render(<SubagentsView state={state} />);
  open(view, "Alpha");
  const reader = view.getByRole("region", { name: "Captured conversation" });
  const task = reader.querySelector<HTMLDetailsElement>(".pi-subagents-task")!;
  const conversation = reader.querySelector<HTMLDetailsElement>(".pi-subagents-conversation")!;
  const tool = reader.querySelector<HTMLDetailsElement>(".pi-subagents-tool")!;
  task.open = conversation.open = tool.open = true;
  reader.scrollTop = 321;
  agents(view);
  open(view, "Beta");
  const geometry = vi.spyOn(reader, "getBoundingClientRect");
  view.rerender(
    <SubagentsView
      state={snapshot(
        { ...alpha, capture: { ...alpha.capture!, finalOutput: "new output" } },
        beta,
      )}
    />,
  );
  expect(geometry).not.toHaveBeenCalled();
  fireEvent.click(tab(view, "Alpha"));
  expect(view.getByRole("region", { name: "Captured conversation" })).toBe(reader);
  expect(reader.scrollTop).toBe(321);
  expect(task.open && conversation.open && tool.open).toBe(true);
  expect(view.getByRole("region", { name: "Final output" }).textContent).toContain("new output");
  fireEvent.click(view.getByRole("button", { name: "Final output" }));
  expect(document.activeElement).toBe(view.getByRole("region", { name: "Final output" }));
});

it("uses tab arrows, Home, End and Delete with after-commit focus and sibling close controls", () => {
  const view = render(<SubagentsView state={state} />);
  open(view, "Alpha");
  agents(view);
  open(view, "Beta");
  fireEvent.keyDown(tab(view, "Beta"), { key: "ArrowRight" });
  expect(selected(view)).toEqual(["Agents"]);
  expect(document.activeElement).toBe(tab(view, "Agents"));
  fireEvent.keyDown(tab(view, "Agents"), { key: "End" });
  expect(document.activeElement).toBe(tab(view, "Beta"));
  fireEvent.keyDown(tab(view, "Beta"), { key: "ArrowLeft" });
  expect(document.activeElement).toBe(tab(view, "Alpha"));
  fireEvent.keyDown(tab(view, "Alpha"), { key: "Home" });
  expect(document.activeElement).toBe(tab(view, "Agents"));
  fireEvent.keyDown(tab(view, "Agents"), { key: "ArrowLeft" });
  fireEvent.keyDown(tab(view, "Beta"), { key: "Delete" });
  expect(
    view
      .getAllByRole("tab")
      .map((node) => node.querySelector(".pi-subagents-tab-label")!.textContent),
  ).toEqual(["Agents", "Alpha"]);
  expect(document.activeElement).toBe(tab(view, "Alpha"));
  expect(view.getByRole("button", { name: "Close Alpha tab" }).parentElement).toBe(
    tab(view, "Alpha").parentElement,
  );
  expect(tab(view, "Alpha").querySelector("button")).toBeNull();
  expect(tab(view, "Alpha").getAttribute("tabindex")).toBe("0");
  expect(tab(view, "Agents").getAttribute("tabindex")).toBe("-1");
});

it("moves list focus without opening and opens with Enter or Space", () => {
  const view = render(<SubagentsView state={state} />);
  const buttons = within(view.getByRole("navigation")).getAllByRole("button");
  buttons[0]!.focus();
  fireEvent.keyDown(buttons[0]!, { key: "ArrowDown" });
  expect(document.activeElement).toBe(buttons[1]);
  expect(selected(view)).toEqual(["Agents"]);
  fireEvent.keyDown(buttons[1]!, { key: "Home" });
  expect(document.activeElement).toBe(buttons[0]);
  fireEvent.keyDown(buttons[0]!, { key: "End" });
  fireEvent.keyDown(buttons[1]!, { key: "ArrowUp" });
  fireEvent.keyDown(buttons[0]!, { key: "Enter" });
  expect(selected(view)).toEqual(["Alpha"]);
  agents(view);
  fireEvent.keyDown(buttons[1]!, { key: " " });
  expect(selected(view)).toEqual(["Beta"]);
});

it("consumes semantic external navigation once and resolves delayed background roots", () => {
  const view = render(<SubagentsView state={snapshot(alpha)} target="Beta" />);
  expect(selected(view)).toEqual(["Agents"]);
  expect(view.getByRole("alert").textContent).toContain("unavailable");
  view.rerender(<SubagentsView state={state} target="Beta" />);
  expect(selected(view)).toEqual(["Beta"]);
  agents(view);
  view.rerender(<SubagentsView state={{ ...state, updatedAt: 20 }} target="Beta" />);
  expect(selected(view)).toEqual(["Agents"]);
  fireEvent.click(tab(view, "Beta"));
  fireEvent.click(view.getByRole("button", { name: "Close Beta tab" }));
  view.rerender(<SubagentsView state={{ ...state, updatedAt: 30 }} target="Beta" />);
  expect(
    view
      .getAllByRole("tab")
      .map((node) => node.querySelector(".pi-subagents-tab-label")!.textContent),
  ).toEqual(["Agents"]);
  view.rerender(<SubagentsView state={state} target="Alpha" />);
  expect(selected(view)).toEqual(["Alpha"]);
  view.rerender(<SubagentsView state={state} overview />);
  expect(selected(view)).toEqual(["Agents"]);
  open(view, "Beta");
  view.rerender(<SubagentsView state={state} overview />);
  expect(selected(view)).toEqual(["Beta"]);
  view.rerender(<SubagentsView state={state} />);
  expect(selected(view)).toEqual(["Agents"]);
});

it.each(["open", "activate", "close", "list-key"])(
  "cancels pending external activation on manual %s",
  (action) => {
    const view = render(<SubagentsView state={snapshot(alpha)} />);
    open(view, "Alpha");
    view.rerender(<SubagentsView state={snapshot(alpha)} target="Beta" />);
    if (action === "open") open(view, "Alpha");
    if (action === "activate") fireEvent.click(tab(view, "Alpha"));
    if (action === "close") fireEvent.click(view.getByRole("button", { name: "Close Alpha tab" }));
    if (action === "list-key")
      fireEvent.keyDown(view.getByRole("button", { name: /Alpha.*Entry/ }), { key: "ArrowDown" });
    view.rerender(<SubagentsView state={state} target="Beta" />);
    expect(selected(view)).toEqual([
      action === "open" || action === "activate" ? "Alpha" : "Agents",
    ]);
    expect(view.queryByRole("tab", { name: "Beta" })).toBeNull();
  },
);

it.each([null, "foreground", "nested"])(
  "rejects invalid and non-root external target %s but permits manual recovery",
  (target) => {
    const rows = snapshot(
      alpha,
      row("foreground", { source: "foreground" }),
      row("nested", { parentId: "Alpha" }),
    );
    const view = render(<SubagentsView state={rows} target={target} />);
    expect(selected(view)).toEqual(["Agents"]);
    expect(view.getByRole("alert").textContent).toMatch(/invalid|unavailable/);
    open(view, "nested");
    expect(selected(view)).toEqual(["nested"]);
    expect(view.getByRole("article").textContent).toContain("Task for nested");
  },
);

it("releases evicted capture DOM, retains an ID-only unavailable shell and remounts current data", () => {
  const view = render(<SubagentsView state={state} />);
  open(view, "Alpha");
  const reader = view.getByRole("region", { name: "Captured conversation" });
  const tool = reader.querySelector<HTMLDetailsElement>(".pi-subagents-tool")!;
  tool.open = true;
  tool.querySelector("summary")!.focus();
  view.rerender(<SubagentsView state={snapshot(beta)} />);
  expect(selected(view)).toEqual(["Unavailable agent"]);
  expect(reader.isConnected).toBe(false);
  expect(view.container.textContent).not.toContain("Task for Alpha");
  expect(view.container.textContent).not.toContain("input Alpha");
  expect(view.getByRole("tabpanel").textContent).toContain(
    "outside the available captured history",
  );
  expect(document.activeElement).toBe(tab(view, "Unavailable agent"));
  view.rerender(<SubagentsView state={state} />);
  const nextReader = view.getByRole("region", { name: "Captured conversation" });
  expect(nextReader).not.toBe(reader);
  expect(nextReader.querySelector<HTMLDetailsElement>(".pi-subagents-tool")!.open).toBe(false);
  expect(nextReader.textContent).toContain("input Alpha");
  agents(view);
  open(view, "Beta");
  view.rerender(<SubagentsView state={snapshot(beta)} />);
  expect(view.container.textContent).not.toContain("input Alpha");
  expect(selected(view)).toEqual(["Beta"]);
});

it("preserves accepted detail, disclosure and focus on failed polls and same-tab reactivation", () => {
  const view = render(<SubagentsView state={state} />);
  open(view, "Alpha");
  const reader = view.getByRole("region", { name: "Captured conversation" });
  const tool = reader.querySelector<HTMLDetailsElement>(".pi-subagents-tool")!;
  tool.open = true;
  reader.scrollTop = 90;
  fireEvent.click(tab(view, "Alpha"));
  expect(document.activeElement).toBe(tab(view, "Alpha"));
  const summary = tool.querySelector("summary")!;
  summary.focus();
  view.rerender(<SubagentsView state={state} error="Read failed" />);
  expect(view.getByRole("alert").textContent).toContain("Previously captured detail stays visible");
  expect(document.activeElement).toBe(summary);
  expect(view.getByRole("region", { name: "Captured conversation" })).toBe(reader);
  expect(reader.scrollTop).toBe(90);
  expect(tool.open).toBe(true);
});

it("repairs focus only when navigation hides focused content and never steals composer focus", () => {
  const view = render(
    <>
      <input aria-label="Composer" />
      <SubagentsView state={state} />
    </>,
  );
  open(view, "Alpha");
  const reader = view.getByRole("region", { name: "Captured conversation" });
  reader.focus();
  view.rerender(
    <>
      <input aria-label="Composer" />
      <SubagentsView state={state} target="Beta" />
    </>,
  );
  expect(document.activeElement).toBe(tab(view, "Beta"));
  const composer = view.getByRole("textbox", { name: "Composer" });
  composer.focus();
  view.rerender(
    <>
      <input aria-label="Composer" />
      <SubagentsView state={state} target="Alpha" />
    </>,
  );
  expect(selected(view)).toEqual(["Alpha"]);
  expect(document.activeElement).toBe(composer);
  view.rerender(
    <>
      <input aria-label="Composer" />
      <SubagentsView state={snapshot(beta)} target="Alpha" />
    </>,
  );
  expect(document.activeElement).toBe(composer);
});

it("gives every viewer unique ARIA relationships, including a row literally named agents", () => {
  const view = render(
    <>
      <SubagentsView state={snapshot(row("agents"))} target="agents" />
      <SubagentsView state={snapshot(alpha)} target="Alpha" />
    </>,
  );
  const tabs = view.getAllByRole("tab");
  const ids = tabs.map((node) => node.id);
  expect(new Set(ids).size).toBe(4);
  for (const node of tabs) {
    const panel = document.getElementById(node.getAttribute("aria-controls")!);
    expect(panel?.getAttribute("aria-labelledby")).toBe(node.id);
    expect(panel?.hidden).toBe(node.getAttribute("aria-selected") !== "true");
  }
  expect(view.getAllByRole("tabpanel").map((node) => node.textContent)).toEqual([
    expect.stringContaining("Task for agents"),
    expect.stringContaining("Task for Alpha"),
  ]);
});
