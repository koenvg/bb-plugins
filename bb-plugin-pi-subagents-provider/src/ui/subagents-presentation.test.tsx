// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ViewState } from "../subagents-contract.js";
import { SubagentsView } from "./subagents-view.js";

installTestPluginRuntime();
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const snapshot: ViewState = {
  kind: "pi-subagents-view",
  version: 1,
  updatedAt: 20,
  availability: "available",
  reason: "",
  omitted: 2,
  rows: [
    {
      id: "workflow-root",
      runId: "workflow-run",
      sessionId: "pi",
      generation: 1,
      source: "foreground",
      kind: "workflow",
      label: "review workflow",
      state: "complete",
      incomplete: false,
      observedAt: 20,
    },
    {
      id: "delegate-one",
      runId: "delegate-run-one",
      sessionId: "pi",
      generation: 1,
      source: "background",
      kind: "subagent",
      label: "delegate",
      state: "complete",
      incomplete: false,
      observedAt: 20,
      capture: {
        status: "captured",
        capturedAt: 19,
        task: "Read and follow /workspace/project/AGENTS.md.\n\nTask: Inspect the retained tab layout without changing navigation.",
        finalOutput: "Layout inspection complete.",
        messages: [
          { role: "assistant", kind: "toolCall", name: "read", text: "src/ui/subagents-view.tsx" },
        ],
      },
    },
    {
      id: "delegate-two",
      runId: "delegate-run-two",
      sessionId: "pi",
      generation: 1,
      source: "background",
      kind: "subagent",
      label: "delegate",
      state: "complete",
      incomplete: false,
      observedAt: 20,
      capture: {
        status: "unavailable",
        capturedAt: 19,
        reason: "Artifact missing",
        task: "Read and follow /workspace/project/AGENTS.md.\n\nTask: Verify capture warnings without renaming delegate labels.",
      },
    },
    {
      id: "workflow-child",
      parentId: "workflow-root",
      runId: "workflow-step",
      sessionId: "pi",
      generation: 1,
      source: "foreground",
      kind: "step",
      label: "delegate",
      index: 0,
      state: "running",
      incomplete: true,
      observedAt: 20,
      capture: { status: "timeout", capturedAt: 19, reason: "No inspection reply" },
    },
  ],
};

it("starts with one Agents tab and a truthful observed count, without duplicate headings or tutorial", () => {
  const view = render(
    <SubagentsView state={snapshot} warning="Older history may be outside this bounded window." />,
  );
  const agents = view.getByRole("tab", { name: "Agents" });
  expect(agents.getAttribute("aria-selected")).toBe("true");
  expect(agents.getAttribute("aria-description")).toBe(
    "4 observed entries in available history. Not an active-worker count.",
  );
  expect(agents.getAttribute("title")).toBe("Agents · 4 observed entries in available history");
  const count = agents.querySelector(".pi-subagents-tab-count")!;
  expect(count.textContent).toBe("4");
  expect(count.getAttribute("aria-hidden")).toBe("true");
  expect(view.getAllByRole("tab")).toHaveLength(1);
  const nav = view.getByRole("navigation", { name: "Observed children" });
  expect(within(nav).getAllByRole("button")).toHaveLength(3);
  expect(
    within(nav)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label")),
  ).toEqual([
    "delegate Foreground step · task unavailable Entry 2 Child 1 running",
    "delegate Read and follow /workspace/project/AGENTS.md. Task: Inspect the retained tab layout without changing navigation. Entry 3 complete",
    "delegate Read and follow /workspace/project/AGENTS.md. Task: Verify capture warnings without renaming delegate labels. Entry 4 complete",
  ]);
  expect(view.getByText("Read-only · Captured observations, not a live feed.").textContent).toBe(
    "Read-only · Captured observations, not a live feed.",
  );
  expect(view.getAllByRole("status").map((node) => node.textContent)).toEqual([
    "Older history may be outside this bounded window.",
    "2 entries omitted by the capture budget.",
  ]);
  expect(view.queryAllByRole("heading")).toHaveLength(0);
  expect(view.queryByText("Select a captured run to view its detail.")).toBeNull();
});

it("keeps raw task attribution in Task and separates execution from capture gaps in the overview", () => {
  const view = render(<SubagentsView state={snapshot} />);
  const nav = within(view.getByRole("navigation", { name: "Observed children" }));
  const first = nav.getByRole("button", {
    name: "delegate Read and follow /workspace/project/AGENTS.md. Task: Inspect the retained tab layout without changing navigation. Entry 3 complete",
  });
  expect(first.querySelector(".pi-subagents-purpose")!.textContent).toBe(
    "Read and follow /workspace/project/AGENTS.md. Task: Inspect the retained tab layout without changing navigation.",
  );
  fireEvent.click(first);
  let detail = view.getByRole("article", { name: "Child detail" });
  expect(within(detail).getByRole("heading", { level: 3 }).textContent).toBe("delegate");
  const task = within(detail).getByRole("group", { name: "Captured task" }) as HTMLDetailsElement;
  fireEvent.click(within(task).getByText("Task", { selector: "summary" }));
  expect(task.open).toBe(true);
  expect(within(task).getByTestId("bb-markdown").textContent).toBe(
    "Read and follow /workspace/project/AGENTS.md.\n\nTask: Inspect the retained tab layout without changing navigation.",
  );
  const identity = detail.querySelector(".pi-subagents-identity")!;
  expect(identity.querySelector(".pi-subagents-purpose")).toBeNull();
  expect(identity.textContent).not.toContain("Read and follow");
  expect(within(detail).getByRole("region", { name: "Final output" }).textContent).toBe(
    "Final outputLayout inspection complete.",
  );

  fireEvent.click(view.getByRole("tab", { name: "Agents" }));
  const second = nav.getByRole("button", {
    name: "delegate Read and follow /workspace/project/AGENTS.md. Task: Verify capture warnings without renaming delegate labels. Entry 4 complete",
  });
  const execution = within(second).getByLabelText("Execution state: complete");
  const gap = within(second).getByText("Capture unavailable");
  expect(execution.textContent).toBe("complete");
  expect(execution.getAttribute("data-state")).toBe("complete");
  expect(execution.querySelector(".pi-subagents-state-dot")!.getAttribute("aria-hidden")).toBe(
    "true",
  );
  expect(gap.getAttribute("title")).toBe("Artifact missing");
  expect(execution.contains(gap)).toBe(false);
  expect(second.querySelector(".pi-subagents-row-meta")!.textContent).toBe(
    "background · subagentCapture unavailable",
  );
  fireEvent.click(second);
  detail = view.getByRole("article", { name: "Child detail" });
  expect(within(detail).getByLabelText("Execution state: complete").textContent).toBe("complete");
  expect(within(detail).getByRole("status").textContent).toBe(
    "Capture unavailable: Artifact missing",
  );
  expect(
    within(within(detail).getByRole("group", { name: "Captured task" })).getByTestId("bb-markdown")
      .textContent,
  ).toBe(
    "Read and follow /workspace/project/AGENTS.md.\n\nTask: Verify capture warnings without renaming delegate labels.",
  );
  expect(within(detail).getByRole("region", { name: "Final output" }).textContent).toBe(
    "Final outputFinal output not captured. This does not change the known execution outcome.",
  );
});

it("retains repeated-label readers and disclosures across row and tab actions, and closes only the view", () => {
  const view = render(<SubagentsView state={snapshot} />);
  const first = within(view.getByRole("navigation")).getByRole("button", {
    name: "delegate Read and follow /workspace/project/AGENTS.md. Task: Inspect the retained tab layout without changing navigation. Entry 3 complete",
  });
  fireEvent.click(first);
  const reader = view.getByRole("region", { name: "Captured conversation" });
  const task = reader.querySelector<HTMLDetailsElement>(".pi-subagents-task")!;
  const conversation = reader.querySelector<HTMLDetailsElement>(".pi-subagents-conversation")!;
  const tool = reader.querySelector<HTMLDetailsElement>(".pi-subagents-tool")!;
  fireEvent.click(task.querySelector("summary")!);
  fireEvent.click(conversation.querySelector("summary")!);
  fireEvent.click(tool.querySelector("summary")!);
  expect([task.open, conversation.open, tool.open]).toEqual([true, true, true]);
  reader.scrollTop = 211;
  fireEvent.click(view.getByRole("tab", { name: "Agents" }));
  fireEvent.click(
    view.getByRole("button", {
      name: "delegate Read and follow /workspace/project/AGENTS.md. Task: Verify capture warnings without renaming delegate labels. Entry 4 complete",
    }),
  );
  fireEvent.click(view.getByRole("tab", { name: "Agents" }));
  fireEvent.click(first);
  expect(view.getAllByRole("tab")).toHaveLength(3);
  expect(view.getByRole("tab", { name: "delegate Entry 3" }).getAttribute("title")).toBe(
    "delegate · Entry 3 · complete",
  );
  expect(view.getByRole("tab", { name: "delegate Entry 4" }).getAttribute("title")).toBe(
    "delegate · Entry 4 · complete",
  );
  expect(view.getByRole("button", { name: "Close delegate Entry 3 tab" }).textContent).toBe("");
  expect(view.getByRole("button", { name: "Close delegate Entry 4 tab" }).textContent).toBe("");
  fireEvent.click(view.getByRole("tab", { name: "delegate Entry 4" }));
  expect(view.getByRole("article").querySelector(".pi-subagents-reference")!.textContent).toBe(
    "Entry 4",
  );
  fireEvent.click(view.getByRole("tab", { name: "delegate Entry 3" }));
  expect(view.getByRole("region", { name: "Captured conversation" })).toBe(reader);
  expect(reader.querySelector(".pi-subagents-task")).toBe(task);
  expect(reader.querySelector(".pi-subagents-conversation")).toBe(conversation);
  expect(reader.querySelector(".pi-subagents-tool")).toBe(tool);
  expect(reader.scrollTop).toBe(211);
  expect([task.open, conversation.open, tool.open]).toEqual([true, true, true]);
  expect(tool.querySelector("pre")!.textContent).toBe("src/ui/subagents-view.tsx");
  const active = view.getByRole("tab", { name: "delegate Entry 3" });
  expect(document.activeElement).toBe(active);
  fireEvent.click(view.getByRole("button", { name: "Close delegate Entry 3 tab" }));
  const agents = view.getByRole("tab", { name: "Agents" });
  expect(agents.getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(agents);
  expect(view.getAllByRole("tab")).toHaveLength(2);
  expect(agents.querySelector(".pi-subagents-tab-count")!.textContent).toBe("4");
  expect(within(view.getByRole("navigation")).getAllByRole("button")).toHaveLength(3);
  expect(within(first).getByLabelText("Execution state: complete").textContent).toBe("complete");
  fireEvent.click(first);
  const reopened = view.getByRole("region", { name: "Captured conversation" });
  expect(reopened).not.toBe(reader);
  expect(reopened.querySelector<HTMLDetailsElement>(".pi-subagents-task")!.open).toBe(false);
  expect(within(reopened).getByRole("region", { name: "Final output" }).textContent).toBe(
    "Final outputLayout inspection complete.",
  );
  expect(view.queryByRole("button", { name: /spawn|stop|retry|resume|steer/i })).toBeNull();
});

it("promotes the empty workflow's child while preserving its capture gap and execution state", () => {
  const view = render(<SubagentsView state={snapshot} />);
  const nav = within(view.getByRole("navigation"));
  const child = nav.getByRole("button", {
    name: "delegate Foreground step · task unavailable Entry 2 Child 1 running",
  });
  expect(nav.queryByRole("button", { name: /review workflow/ })).toBeNull();
  expect(nav.getAllByRole("button")[0]).toBe(child);
  expect(child.closest("li")!.style.paddingInlineStart).toBe("0px");
  expect(within(child).getByText("Incomplete coverage").textContent).toBe("Incomplete coverage");
  expect(within(child).getByLabelText("Execution state: running").textContent).toBe("running");
  fireEvent.click(child);
  const detail = view.getByRole("article", { name: "Child detail" });
  expect(within(detail).getByRole("heading", { level: 3 }).textContent).toBe("delegate");
  expect(detail.querySelector(".pi-subagents-reference")!.textContent).toBe("Entry 2");
  expect(within(detail).getByRole("status").textContent).toBe(
    "Capture timeout: No inspection reply",
  );
  expect(within(detail).getByLabelText("Execution state: running").textContent).toBe("running");
  expect(view.getAllByRole("tab")).toHaveLength(2);
  fireEvent.click(view.getByRole("tab", { name: "Agents" }));
  expect(nav.getAllByRole("button")).toHaveLength(3);
  expect(child.querySelector(".pi-subagents-label")!.textContent).toBe("delegate");
});
