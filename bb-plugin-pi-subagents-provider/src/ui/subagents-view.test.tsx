// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SubagentsView } from "./subagents-view.js";
import { type ViewState } from "../subagents-contract.js";
import { restoreViewHistory } from "../view-history.js";
installTestPluginRuntime();
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
const base = {
  sessionId: "pi",
  generation: 1,
  source: "background",
  kind: "subagent",
  state: "complete",
  incomplete: false,
  observedAt: 10000,
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
      durationMs: 42000,
      capture: { status: "captured", capturedAt: 1, task: "first\nsecond", finalOutput: "answer" },
    },
    {
      ...base,
      id: "child",
      parentId: "root",
      runId: "c",
      label: "Child",
      state: "running",
      startedAt: 1000,
      incomplete: true,
      capture: { status: "timeout", capturedAt: 2, reason: "No reply" },
    },
  ],
};
const enriched: ViewState = {
  ...state,
  rows: [
    {
      ...state.rows[0]!,
      source: "foreground",
      capture: {
        ...state.rows[0]!.capture!,
        resolvedModel: { provider: "child-provider", model: "child-model", capturedAt: 1 },
        truncated: { task: true, finalOutput: true, messages: 3 },
        messages: [
          { role: "assistant", kind: "text", text: "**before**", textTruncated: true },
          { role: "assistant", kind: "toolCall", name: "bash", text: "<script>unsafe</script>" },
          { role: "toolResult", kind: "toolResult", name: "bash", isError: true, text: "denied" },
          { role: "assistant", kind: "text", text: "after" },
        ],
      },
    },
  ],
};
it("keeps full IDs in capture details, with snapshot-local Entry navigation", () => {
  const runId = "e0957e6e-9a8b-4ab5-b2d8-6b0d97e1df80";
  const view = render(<SubagentsView state={{ ...state, rows: [{ ...state.rows[0]!, runId }] }} />);
  const nav = view.getByRole("navigation");
  expect(nav.textContent).not.toContain(runId);
  expect(nav.textContent).toContain("Root");
  expect(nav.textContent).toContain("Entry 1");
  expect(within(nav).getByRole("button").querySelector("strong")!.textContent).toBe("first second");
  expect(nav.textContent).not.toContain("e1df80");
  expect(nav.textContent).not.toContain("Model unavailable");
  expect(nav.textContent).not.toContain("Total 42s");
  const details = view.container.querySelector<HTMLDetailsElement>(".pi-subagents-capture")!;
  expect(details.open).toBe(false);
  details.open = true;
  expect(details.textContent).toContain(runId);
  expect(details.textContent).toContain("Model unavailable");
});
const accountingReason =
  "Native accounting requires an observed parent turn at an idle boundary in this bridge generation";

it("keeps the reading anchor when an availability notice appears and clears", () => {
  const available = { ...enriched, omitted: 0 };
  const view = render(<SubagentsView state={available} />);
  const reader = view.getByRole("region", { name: "Captured conversation" });
  const task = view.container.querySelector<HTMLDetailsElement>(".pi-subagents-task")!;
  const conversation = view.container.querySelector<HTMLDetailsElement>(
    ".pi-subagents-conversation",
  )!;
  const tool = view.container.querySelector<HTMLDetailsElement>(".pi-subagents-tool")!;
  task.open = conversation.open = tool.open = true;
  const summary = tool.querySelector("summary")!;
  summary.focus();
  reader.scrollTop = 1772;
  const rect = reader.getBoundingClientRect();
  vi.spyOn(reader, "getBoundingClientRect").mockImplementation(() => ({
    ...rect,
    top: 294 + (view.container.textContent!.includes(accountingReason) ? 50 : 0),
    bottom: 760,
    width: 400,
  }));
  vi.spyOn(summary, "getBoundingClientRect").mockImplementation(() => ({
    ...rect,
    top:
      508 +
      (view.container.textContent!.includes(accountingReason) ? 50 : 0) -
      (reader.scrollTop - 1772),
  }));

  view.rerender(
    <SubagentsView
      state={{ ...available, availability: "unavailable", reason: accountingReason }}
    />,
  );
  expect(view.getByText(accountingReason).getAttribute("role")).toBe("status");
  expect(reader.scrollTop).toBe(1822);
  expect(view.getByRole("region", { name: "Captured conversation" })).toBe(reader);
  expect(view.container.querySelector(".pi-subagents-tool")).toBe(tool);
  expect(task.open && conversation.open && tool.open).toBe(true);
  expect(document.activeElement).toBe(summary);

  view.rerender(<SubagentsView state={available} />);
  expect(reader.scrollTop).toBe(1772);
  expect(document.activeElement).toBe(summary);
});

it("measures the current position after manual outer scrolling, not an earlier render", () => {
  const available = { ...enriched, omitted: 0 };
  const view = render(<SubagentsView state={available} />);
  const root = view.container.querySelector<HTMLElement>(".pi-subagents")!;
  const reader = view.getByRole("region", { name: "Captured conversation" });
  const rect = reader.getBoundingClientRect();
  const summary = reader.querySelector("summary")!;
  summary.focus();
  vi.spyOn(reader, "getBoundingClientRect").mockImplementation(() => ({
    ...rect,
    top: 294 - root.scrollTop + (view.container.textContent!.includes(accountingReason) ? 50 : 0),
    bottom: 760 - root.scrollTop,
    width: 400,
  }));
  vi.spyOn(summary, "getBoundingClientRect").mockImplementation(() => ({
    ...rect,
    top:
      508 -
      root.scrollTop +
      (view.container.textContent!.includes(accountingReason) ? 50 : 0) -
      (reader.scrollTop - 400),
  }));
  root.scrollTop = 80;
  reader.scrollTop = 400;
  view.rerender(
    <SubagentsView
      state={{ ...available, availability: "unavailable", reason: accountingReason }}
    />,
  );
  expect(reader.scrollTop).toBe(450);
  expect(root.scrollTop).toBe(80);
});

it("does not compensate twice when viewport growth already clamps a reader at the end", () => {
  const available = { ...enriched, omitted: 0 };
  const view = render(<SubagentsView state={available} />);
  const reader = view.getByRole("region", { name: "Captured conversation" });
  const summary = reader.querySelector("summary")!;
  summary.focus();
  let position = 1000;
  const hasNotice = () => view.container.textContent!.includes(accountingReason);
  Object.defineProperty(reader, "scrollTop", {
    get: () => Math.min(position, hasNotice() ? 1050 : 1000),
    set: (next: number) => {
      position = next;
    },
  });
  const rect = reader.getBoundingClientRect();
  vi.spyOn(reader, "getBoundingClientRect").mockImplementation(() => ({
    ...rect,
    top: 294 + (hasNotice() ? 50 : 0),
    bottom: 760,
    width: 400,
  }));
  vi.spyOn(summary, "getBoundingClientRect").mockImplementation(() => ({
    ...rect,
    top: 508 + (hasNotice() ? 50 : 0) - (reader.scrollTop - 1000),
  }));
  view.rerender(
    <SubagentsView
      state={{ ...available, availability: "unavailable", reason: accountingReason }}
    />,
  );
  expect(reader.scrollTop).toBe(1050);
  view.rerender(<SubagentsView state={available} />);
  expect(reader.scrollTop).toBe(1000);
});

it("preserves the visible reading anchor without requiring focus on a tool", () => {
  const available = { ...enriched, omitted: 0 };
  const view = render(<SubagentsView state={available} />);
  const reader = view.getByRole("region", { name: "Captured conversation" });
  const anchor = reader.querySelector(".pi-subagents-message")!;
  reader.scrollTop = 300;
  const rect = reader.getBoundingClientRect();
  vi.spyOn(reader, "getBoundingClientRect").mockReturnValue({
    ...rect,
    top: 200,
    bottom: 666,
    width: 400,
  });
  vi.spyOn(anchor, "getBoundingClientRect").mockImplementation(() => ({
    ...rect,
    top:
      400 +
      (view.container.textContent!.includes(accountingReason) ? 50 : 0) -
      (reader.scrollTop - 300),
  }));
  const original = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  const point = vi.fn(() => anchor);
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: point });
  try {
    view.rerender(
      <SubagentsView
        state={{ ...available, availability: "unavailable", reason: accountingReason }}
      />,
    );
    expect(point).toHaveBeenCalledWith(200, 433);
    expect(reader.scrollTop).toBe(350);
  } finally {
    if (original) Object.defineProperty(document, "elementFromPoint", original);
    else Reflect.deleteProperty(document, "elementFromPoint");
  }
});

it("does not undo native anchoring to visible text when the focused control is offscreen", () => {
  const available = { ...enriched, omitted: 0 };
  const view = render(<SubagentsView state={available} />);
  const reader = view.getByRole("region", { name: "Captured conversation" });
  const summary = reader.querySelector("summary")!;
  const anchor = reader.querySelector(".pi-subagents-message")!;
  summary.focus();
  let adjustment = 0;
  const nativePosition = () => (view.container.textContent!.includes("expanded task") ? 333 : 300);
  Object.defineProperty(reader, "scrollTop", {
    get: () => nativePosition() + adjustment,
    set: (value: number) => {
      adjustment = value - nativePosition();
    },
  });
  const rect = reader.getBoundingClientRect();
  vi.spyOn(reader, "getBoundingClientRect").mockReturnValue({
    ...rect,
    top: 200,
    bottom: 666,
    width: 400,
  });
  vi.spyOn(summary, "getBoundingClientRect").mockImplementation(() => ({
    ...rect,
    top: 50 - (reader.scrollTop - 300),
  }));
  vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({ ...rect, top: 400 });
  const original = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  const point = vi.fn(() => anchor);
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: point });
  try {
    view.rerender(
      <SubagentsView
        state={{
          ...available,
          rows: [
            {
              ...available.rows[0]!,
              capture: { ...available.rows[0]!.capture!, task: "expanded task" },
            },
          ],
        }}
      />,
    );
    expect(point).toHaveBeenCalled();
    expect(reader.scrollTop).toBe(333);
    expect(adjustment).toBe(0);
  } finally {
    if (original) Object.defineProperty(document, "elementFromPoint", original);
    else Reflect.deleteProperty(document, "elementFromPoint");
  }
});

it("leaves an unscrolled reader at the beginning when a notice arrives", () => {
  const available = { ...enriched, omitted: 0 };
  const view = render(<SubagentsView state={available} />);
  const reader = view.getByRole("region", { name: "Captured conversation" });
  const rect = reader.getBoundingClientRect();
  vi.spyOn(reader, "getBoundingClientRect").mockImplementation(() => ({
    ...rect,
    top: view.container.textContent!.includes(accountingReason) ? 344 : 294,
  }));
  view.rerender(
    <SubagentsView
      state={{ ...available, availability: "unavailable", reason: accountingReason }}
    />,
  );
  expect(reader.scrollTop).toBe(0);
  expect(view.getByText(accountingReason).getAttribute("role")).toBe("status");
});

it("leads with captured purpose and keeps the actual model only in collapsed capture details", () => {
  const view = render(<SubagentsView state={enriched} />);
  const nav = view.getByRole("navigation");
  expect(within(nav).getByRole("button").querySelector("strong")!.textContent).toBe("first second");
  expect(within(view.getByRole("article")).getByRole("heading", { level: 3 }).textContent).toBe(
    "first second",
  );
  expect(nav.textContent).not.toContain("child-model");
  expect(nav.textContent).not.toContain("child-provider");
  const identity = view.container.querySelector(".pi-subagents-identity")!;
  expect(identity.textContent).toContain("Root");
  expect(identity.textContent).toContain("Entry 1");
  expect(identity.textContent).toContain("Captured observation, not a live feed.");
  expect(identity.textContent).not.toContain("child-model");
  const details = view.container.querySelector<HTMLDetailsElement>(".pi-subagents-capture")!;
  expect(details.open).toBe(false);
  expect(
    within(details).getByText("Captured model: child-model · child-provider").textContent,
  ).toBe("Captured model: child-model · child-provider");
  expect(view.getAllByText("Captured model: child-model · child-provider")).toHaveLength(1);
});
it.each([
  { task: "  **Inspect**\n\tthe   panel  ", purpose: "**Inspect** the panel" },
  {
    task: "Read a " + "long task ".repeat(100) + "to the end",
    purpose: "Read a " + "long task ".repeat(100) + "to the end",
  },
  { task: "", purpose: "Foreground workflow · task unavailable" },
  { task: " \n\t ", purpose: "Foreground workflow · task unavailable" },
  { task: undefined, purpose: "Foreground workflow · task unavailable" },
])(
  "shows truthful plain-text purpose for task case %# without changing the original attribution",
  ({ task, purpose }) => {
    const view = render(
      <SubagentsView
        state={{
          ...state,
          rows: [
            {
              ...state.rows[0]!,
              source: "foreground",
              kind: "workflow",
              label: "  Original  agent  ",
              activity: "Not a title",
              capture: {
                status: "captured",
                capturedAt: 1,
                task,
                finalOutput: "Not a title either",
              },
            },
          ],
        }}
      />,
    );
    const button = within(view.getByRole("navigation")).getByRole("button", {
      name: `${purpose} Original agent Entry 1 complete`,
    });
    expect(button.querySelector("strong")!.textContent).toBe(purpose);
    expect(
      within(view.getByRole("article")).getByRole("heading", { level: 3, name: purpose })
        .textContent,
    ).toBe(purpose);
    const labels = view.container.querySelectorAll(".pi-subagents-label");
    expect(Array.from(labels, (label) => label.textContent)).toEqual([
      "  Original  agent  ",
      "  Original  agent  ",
    ]);
    const taskSection = view.queryByRole("group", { name: "Captured task" });
    if (task !== undefined) {
      expect(within(taskSection!).getByTestId("bb-markdown").textContent).toBe(task);
      expect(view.queryByText("Task attribution not captured.")).toBeNull();
    } else {
      expect(taskSection).toBeNull();
      expect(view.getByText("Task attribution not captured.").textContent).toBe(
        "Task attribution not captured.",
      );
    }
  },
);
it("uses truthful source/kind fallback and Label unavailable for absent capture and blank labels", () => {
  const view = render(
    <SubagentsView
      state={{ ...state, rows: [{ ...state.rows[0]!, label: " \t ", capture: undefined }] }}
    />,
  );
  expect(
    within(view.getByRole("navigation")).getByRole("button").querySelector("strong")!.textContent,
  ).toBe("Background subagent · task unavailable");
  expect(view.getAllByText("Label unavailable").map((label) => label.textContent)).toEqual([
    "Label unavailable",
    "Label unavailable",
  ]);
  expect(within(view.getByRole("article")).getByRole("status").textContent).toContain(
    "Capture not-captured",
  );
});
it("keeps duplicate tasks, labels and Child 1 roots uniquely selectable by Entry", () => {
  const view = render(
    <SubagentsView
      state={{
        ...state,
        rows: [
          { ...state.rows[0]!, id: "one", runId: "private-run-one", index: 0, label: "Same" },
          { ...state.rows[0]!, id: "two", runId: "private-run-two", index: 0, label: "Same" },
        ],
      }}
    />,
  );
  const nav = within(view.getByRole("navigation"));
  const first = nav.getByRole("button", { name: "first second Same Entry 1 Child 1 complete" });
  const second = nav.getByRole("button", { name: "first second Same Entry 2 Child 1 complete" });
  expect(first.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(second);
  expect(second.getAttribute("aria-pressed")).toBe("true");
  expect(first.getAttribute("aria-pressed")).toBe("false");
  expect(view.getByRole("article").textContent).toContain("private-run-two");
  expect(view.getByRole("navigation").textContent).not.toContain("private-run");
});
it("retains selected ID, open tool, summary focus and reading scroll when task arrives and Entry changes", () => {
  const initial = {
    ...enriched,
    rows: [{ ...enriched.rows[0]!, capture: { ...enriched.rows[0]!.capture!, task: undefined } }],
  };
  const view = render(<SubagentsView state={initial} />);
  fireEvent.click(within(view.getByRole("navigation")).getByRole("button"));
  const transcript = view.getByRole("region", { name: "Captured conversation" });
  const tool = transcript.querySelector<HTMLDetailsElement>(".pi-subagents-tool")!;
  const summary = tool.querySelector("summary")!;
  const runs = view.container.querySelector<HTMLDetailsElement>(".pi-subagents-runs")!;
  tool.open = true;
  runs.open = false;
  transcript.scrollTop = 120;
  summary.focus();
  view.rerender(
    <SubagentsView
      state={{
        ...enriched,
        rows: [{ ...state.rows[0]!, id: "earlier", capture: undefined }, ...enriched.rows],
      }}
    />,
  );
  expect(view.getByRole("region", { name: "Captured conversation" })).toBe(transcript);
  expect(transcript.querySelector(".pi-subagents-tool")).toBe(tool);
  expect(tool.open).toBe(true);
  expect(runs.open).toBe(false);
  expect(document.activeElement).toBe(summary);
  expect(transcript.scrollTop).toBe(120);
  expect(within(view.getByRole("article")).getByRole("heading", { level: 3 }).textContent).toBe(
    "first second",
  );
  expect(view.container.querySelector(".pi-subagents-identity")!.textContent).toContain("Entry 2");
  expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
});
it("keeps missing-content notices in capture details rather than ahead of available output", () => {
  const view = render(
    <SubagentsView
      state={{
        ...state,
        rows: [
          {
            ...state.rows[0]!,
            capture: { status: "captured", capturedAt: 1, finalOutput: "Accepted answer" },
          },
        ],
      }}
    />,
  );
  const transcript = view.getByRole("region", { name: "Captured conversation" });
  expect(within(transcript).queryByRole("region", { name: "Captured task" })).toBeNull();
  const details = transcript.querySelector(".pi-subagents-capture")!;
  expect(details.textContent).toContain("Task attribution not captured.");
  expect(details.textContent).toContain("Recent transcript not captured.");
  expect(details.previousElementSibling?.textContent).toContain("Accepted answer");
});

it("uses public SDK Markdown for task, prose and output, with ordered escaped tools", () => {
  const view = render(<SubagentsView state={enriched} />);
  expect(view.getAllByTestId("bb-markdown").map((n) => n.textContent)).toEqual([
    "first\nsecond",
    "**before**",
    "after",
    "answer",
  ]);
  const transcript = view.getByRole("region", { name: "Captured conversation" });
  const content = Array.from(transcript.children).flatMap((node) =>
    node.matches(".pi-subagents-conversation") ? Array.from(node.children).slice(1) : [node],
  );
  expect(content.map((n) => n.textContent)).toEqual([
    expect.stringContaining("first\nsecond"),
    expect.stringContaining("**before**"),
    expect.stringContaining("<script>unsafe</script>"),
    expect.stringContaining("denied"),
    expect.stringContaining("after"),
    expect.stringContaining("Final output"),
    expect.stringContaining("Capture details"),
  ]);
  const tools = transcript.querySelectorAll<HTMLDetailsElement>(".pi-subagents-tool");
  expect(Array.from(tools).every((t) => !t.open)).toBe(true);
  tools[0]!.open = true;
  expect(tools[0]!.querySelector("pre")!.textContent).toBe("<script>unsafe</script>");
  expect(tools[0]!.querySelector("script")).toBeNull();
  expect(tools[1]!.textContent).toContain("Error");
  expect(
    within(view.getByRole("article")).getByLabelText("Execution state: complete"),
  ).toBeDefined();
  expect(view.getAllByText("Captured model: child-model · child-provider")).toHaveLength(1);
  expect(within(view.getByRole("article")).getByText("Total 42s")).toBeDefined();
});
it("exposes captured prose to host reading styles without including labels or tools", () => {
  const view = render(<SubagentsView state={enriched} />);
  const prose = view.getAllByTestId("bb-markdown");
  expect(prose).toHaveLength(4);
  expect(prose.every((node) => node.classList.contains("pi-subagents-prose"))).toBe(true);
  const detail = view.getByRole("article");
  expect(detail.querySelector(".pi-subagents-identity")!.closest(".pi-subagents-prose")).toBeNull();
  expect(
    Array.from(detail.querySelectorAll(".pi-subagents-tool pre")).every(
      (node) => node.closest(".pi-subagents-prose") === null,
    ),
  ).toBe(true);
});
it("renders accepted legacy tool-result text as collapsed escaped output without guessing metadata", () => {
  const text = "<script>unsafe</script>\n**not Markdown**\n  <img src=x onerror=unsafe()> & output";
  const legacy: ViewState = {
    ...state,
    rows: [
      {
        ...state.rows[0]!,
        capture: {
          status: "captured",
          capturedAt: 1,
          task: "Task prose",
          finalOutput: "Answer prose",
          truncated: { task: false, finalOutput: false, messages: 2 },
          messages: [
            { role: "user", kind: "text", text: "User prose" },
            { role: "toolResult", kind: "text", text },
            { role: "assistant", kind: "text", text: "Assistant prose" },
            {
              role: "toolResult",
              kind: "text",
              name: "read",
              isError: true,
              text: "x".repeat(1000),
              textTruncated: true,
            },
            { role: "custom", kind: "text", text: "Custom prose" },
          ],
        },
      },
    ],
  };
  const restored = restoreViewHistory([JSON.parse(JSON.stringify(legacy))]);
  expect(restored).toEqual(legacy);
  const view = render(<SubagentsView state={restored} />);
  expect(view.getAllByTestId("bb-markdown").map((node) => node.textContent)).toEqual([
    "Task prose",
    "User prose",
    "Assistant prose",
    "Custom prose",
    "Answer prose",
  ]);
  const transcript = view.getByRole("region", { name: "Captured conversation" });
  const tools = transcript.querySelectorAll<HTMLDetailsElement>(".pi-subagents-tool");
  expect(tools).toHaveLength(2);
  expect(Array.from(tools).map((tool) => tool.open)).toEqual([false, false]);
  expect(Array.from(tools).map((tool) => tool.querySelector("summary")!.textContent)).toEqual([
    "Tool resultResult · toolResult",
    "readResult · toolResultError",
  ]);
  expect(tools[0]!.querySelector("pre")!.textContent).toBe(text);
  expect(tools[1]!.querySelector("pre")!.textContent).toBe("x".repeat(1000));
  for (const tool of Array.from(tools)) {
    expect(tool.querySelector(".pi-subagents-prose, script, img")).toBeNull();
    expect(tool.closest(".pi-subagents-prose")).toBeNull();
  }
  expect(within(tools[1]!).getByText("Tool text was truncated.")).toBeDefined();
  expect(view.getByText("Transcript text was truncated.")).toBeDefined();
  expect(view.getByText("2 transcript entries omitted.")).toBeDefined();
  expect(view.getByText("Model unavailable")).toBeDefined();
  expect(
    transcript.querySelector(".pi-subagents-message[aria-label='toolResult message']"),
  ).toBeNull();
  expect(
    Array.from(transcript.children)
      .slice(0, 3)
      .map((node) => node.className),
  ).toEqual(["pi-subagents-task", "pi-subagents-conversation", "pi-subagents-output"]);
  expect(
    Array.from(transcript.querySelector(".pi-subagents-conversation")!.children)
      .slice(1)
      .map((node) => node.className),
  ).toEqual([
    "pi-subagents-message",
    "pi-subagents-tool",
    "pi-subagents-message",
    "pi-subagents-tool",
    "pi-subagents-message",
  ]);
  const tool = tools[0]!;
  const summary = tool.querySelector("summary")!;
  tool.open = true;
  summary.focus();
  transcript.scrollTop = 120;
  view.rerender(
    <SubagentsView
      state={{
        ...legacy,
        updatedAt: 20,
        rows: [
          {
            ...legacy.rows[0]!,
            observedAt: 20,
            capture: {
              ...legacy.rows[0]!.capture!,
              status: "timeout",
              attemptedAt: 20,
              reason: "No reply",
              messages: legacy.rows[0]!.capture!.messages!.slice(1),
            },
          },
        ],
      }}
    />,
  );
  expect(transcript.querySelector(".pi-subagents-tool")).toBe(tool);
  expect(tool.open).toBe(true);
  expect(document.activeElement).toBe(summary);
  expect(transcript.scrollTop).toBe(120);
  expect(view.getByText("Answer prose")).toBeDefined();
  view.rerender(
    <SubagentsView
      state={{
        ...legacy,
        rows: [
          {
            ...legacy.rows[0]!,
            capture: {
              ...legacy.rows[0]!.capture!,
              messages: [{ role: "toolResult", kind: "text", text: "different result" }],
            },
          },
        ],
      }}
    />,
  );
  expect(transcript.querySelector<HTMLDetailsElement>(".pi-subagents-tool")!.open).toBe(false);
});
it("keeps keyboard selection without execution controls and reveals observation-based timing", () => {
  const view = render(<SubagentsView state={state} />);
  const buttons = within(view.getByRole("navigation")).getAllByRole("button");
  buttons[0]!.focus();
  fireEvent.keyDown(buttons[0]!, { key: "ArrowDown" });
  expect(
    within(view.getByRole("article")).getByLabelText("Execution state: running"),
  ).toBeDefined();
  expect(view.getByRole("article").textContent).toContain("Elapsed 9s at observation");
  expect(view.getByRole("article").textContent).toContain("Capture timeout: No reply");
  expect(document.activeElement).toBe(buttons[1]);
  expect(buttons[1]!.getAttribute("aria-pressed")).toBe("true");
  fireEvent.keyDown(buttons[1]!, { key: "Home" });
  expect(document.activeElement).toBe(buttons[0]);
  fireEvent.keyDown(buttons[0]!, { key: "End" });
  fireEvent.keyDown(buttons[1]!, { key: "ArrowUp" });
  expect(document.activeElement).toBe(buttons[0]);
  expect(buttons[0]!.scrollIntoView).toHaveBeenCalled();
  expect(view.queryByRole("button", { name: /spawn|stop|retry|resume|steer/i })).toBeNull();
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
it("retains capture disclosures, omission and clipping notices separately from outcome", () => {
  const view = render(<SubagentsView state={enriched} />);
  const capture = view.container.querySelector<HTMLDetailsElement>(".pi-subagents-capture")!;
  capture.open = true;
  for (const notice of [
    "Task text was truncated.",
    "Transcript text was truncated.",
    "Final output was truncated.",
    "3 transcript entries omitted.",
  ]) {
    expect(within(capture).getByText(notice)).toBeDefined();
  }
  expect(capture.parentElement).toBe(view.getByRole("region", { name: "Captured conversation" }));
  expect(capture.textContent).toContain("Model captured 1970-01-01T00:00:00.001Z");
  view.rerender(
    <SubagentsView
      state={{
        ...enriched,
        rows: [
          {
            ...enriched.rows[0]!,
            capture: {
              ...enriched.rows[0]!.capture!,
              status: "timeout",
              attemptedAt: 20,
              reason: "No reply",
            },
          },
        ],
      }}
    />,
  );
  expect(capture.open).toBe(true);
  expect(capture.textContent).toContain("Last capture attempt 1970-01-01T00:00:00.020Z");
  expect(view.getByText("answer")).toBeDefined();
  expect(
    within(view.getByRole("article")).getByLabelText("Execution state: complete"),
  ).toBeDefined();
});
it("preserves scroll, disclosures and focus on same-run and metadata-only refresh", () => {
  const view = render(<SubagentsView state={enriched} />);
  const transcript = view.getByRole("region", { name: "Captured conversation" });
  const tool = transcript.querySelector<HTMLDetailsElement>(".pi-subagents-tool")!;
  tool.open = true;
  transcript.scrollTop = 120;
  fireEvent.click(within(view.getByRole("navigation")).getByRole("button"));
  expect(transcript.scrollTop).toBe(120);
  expect(tool.open).toBe(true);
  const summary = tool.querySelector("summary")!;
  summary.focus();
  view.rerender(
    <SubagentsView
      state={{
        ...enriched,
        updatedAt: 20,
        rows: [
          {
            ...enriched.rows[0]!,
            observedAt: 20,
            capture: { ...enriched.rows[0]!.capture!, attemptedAt: 20 },
          },
        ],
      }}
    />,
  );
  expect(view.getByRole("region", { name: "Captured conversation" })).toBe(transcript);
  expect(transcript.scrollTop).toBe(120);
  expect(tool.open).toBe(true);
  expect(document.activeElement).toBe(summary);
  fireEvent.click(view.getByRole("button", { name: "Final output" }));
  expect(document.activeElement).toBe(view.getByRole("region", { name: "Final output" }));
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
    block: "start",
    behavior: "instant",
  });
});
it("does not transfer open tool state to different bounded-tail records or runs", () => {
  const view = render(<SubagentsView state={enriched} />);
  const tool = view.container.querySelector<HTMLDetailsElement>(".pi-subagents-tool")!;
  tool.open = true;
  const changed = {
    ...enriched,
    rows: [
      {
        ...enriched.rows[0]!,
        capture: {
          ...enriched.rows[0]!.capture!,
          messages: [{ role: "assistant", kind: "toolCall" as const, name: "read", text: "other" }],
        },
      },
    ],
  };
  view.rerender(<SubagentsView state={changed} />);
  expect(view.container.querySelector<HTMLDetailsElement>(".pi-subagents-tool")!.open).toBe(false);
  view.rerender(
    <SubagentsView
      state={{
        ...changed,
        rows: [changed.rows[0]!, { ...changed.rows[0]!, id: "other", label: "Other" }],
      }}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: /Other/ }));
  expect(view.container.querySelector<HTMLDetailsElement>(".pi-subagents-tool")!.open).toBe(false);
});
it("shows unavailable models and durations for legacy/container captures with generic tool labels", () => {
  const view = render(
    <SubagentsView
      state={{
        ...state,
        rows: [
          {
            ...state.rows[0]!,
            kind: "workflow",
            durationMs: undefined,
            capture: {
              status: "captured",
              capturedAt: 1,
              messages: [{ role: "toolResult", kind: "toolResult", text: "legacy" }],
            },
          },
        ],
      }}
    />,
  );
  expect(view.getAllByText("Model unavailable")).toHaveLength(1);
  expect(view.getAllByText("Duration unavailable")).toHaveLength(1);
  expect(view.getByText("Tool result")).toBeDefined();
  expect((view.getByRole("button", { name: "Final output" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(view.getByText(/Final output not captured/)).toBeDefined();
  expect(
    within(view.getByRole("article")).getByLabelText("Execution state: complete"),
  ).toBeDefined();
});

it("starts completed detail with its result and secondary content disclosed on demand", () => {
  const view = render(<SubagentsView state={enriched} />);
  expect(view.container.querySelector<HTMLDetailsElement>(".pi-subagents-runs")!.open).toBe(false);
  const task = view.container.querySelector<HTMLDetailsElement>("details.pi-subagents-task");
  const conversation = view.container.querySelector<HTMLDetailsElement>(
    ".pi-subagents-conversation",
  );
  expect(task).not.toBeNull();
  expect(conversation).not.toBeNull();
  expect(task!.open).toBe(false);
  expect(conversation!.open).toBe(false);
  expect(conversation!.querySelector("summary")!.textContent).toContain("4 entries");
  expect(view.container.querySelector(".pi-subagents-output")!.closest("details")).toBeNull();
  expect(
    view.container.querySelector(".pi-subagents-message")!.closest(".pi-subagents-conversation"),
  ).toBe(conversation);
  expect(
    within(view.getByRole("region", { name: "Final output" })).getByTestId("bb-markdown")
      .textContent,
  ).toBe("answer");
});

it("keeps overview navigation open until a run is chosen without stealing its focus", () => {
  const view = render(<SubagentsView state={state} overview />);
  const runs = view.container.querySelector<HTMLDetailsElement>(".pi-subagents-runs")!;
  expect(runs.open).toBe(true);
  const button = within(view.getByRole("navigation")).getAllByRole("button")[0]!;
  button.focus();
  fireEvent.click(button);
  expect(runs.open).toBe(true);
  expect(document.activeElement).toBe(button);
  expect(view.getByRole("region", { name: "Final output" })).toBeDefined();
});

it("retains opened task and conversation disclosures with tool focus during refresh", () => {
  const view = render(<SubagentsView state={enriched} />);
  const task = view.container.querySelector<HTMLDetailsElement>("details.pi-subagents-task")!;
  const conversation = view.container.querySelector<HTMLDetailsElement>(
    ".pi-subagents-conversation",
  )!;
  expect(task).not.toBeNull();
  expect(conversation).not.toBeNull();
  fireEvent.click(task.querySelector("summary")!);
  fireEvent.click(conversation.querySelector("summary")!);
  expect(task.open).toBe(true);
  expect(conversation.open).toBe(true);
  const tool = conversation.querySelector<HTMLDetailsElement>(".pi-subagents-tool")!;
  tool.open = true;
  const summary = tool.querySelector("summary")!;
  summary.focus();
  const reader = view.getByRole("region", { name: "Captured conversation" });
  reader.scrollTop = 90;
  view.rerender(<SubagentsView state={{ ...enriched, updatedAt: 200 }} />);
  expect(view.container.querySelector(".pi-subagents-task")).toBe(task);
  expect(view.container.querySelector(".pi-subagents-conversation")).toBe(conversation);
  expect(task.open && conversation.open && tool.open).toBe(true);
  expect(document.activeElement).toBe(summary);
  expect(reader.scrollTop).toBe(90);
});

it.each([true, false])(
  "preserves conversation disclosure choice %s when final output arrives",
  (keepOpen) => {
    const row = enriched.rows[0]!;
    const initial = {
      ...enriched,
      rows: [{ ...row, capture: { ...row.capture!, finalOutput: undefined } }],
    };
    const view = render(<SubagentsView state={initial} />);
    const conversation = view.container.querySelector<HTMLDetailsElement>(
      ".pi-subagents-conversation",
    )!;
    expect(conversation).not.toBeNull();
    expect(conversation.open).toBe(true);
    if (!keepOpen) fireEvent.click(conversation.querySelector("summary")!);
    const tool = conversation.querySelector<HTMLDetailsElement>(".pi-subagents-tool")!;
    tool.open = true;
    const summary = keepOpen
      ? tool.querySelector("summary")!
      : conversation.querySelector("summary")!;
    summary.focus();
    const reader = view.getByRole("region", { name: "Captured conversation" });
    reader.scrollTop = 110;
    view.rerender(<SubagentsView state={enriched} />);
    expect(view.container.querySelector(".pi-subagents-conversation")).toBe(conversation);
    expect(conversation.open).toBe(keepOpen);
    expect(tool.open).toBe(true);
    expect(document.activeElement).toBe(summary);
    expect(reader.scrollTop).toBe(110);
  },
);
