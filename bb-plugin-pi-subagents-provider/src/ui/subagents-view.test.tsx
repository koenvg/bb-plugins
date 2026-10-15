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
it("keeps full IDs in capture details, with readable compact run navigation", () => {
  const runId = "e0957e6e-9a8b-4ab5-b2d8-6b0d97e1df80";
  const view = render(<SubagentsView state={{ ...state, rows: [{ ...state.rows[0]!, runId }] }} />);
  const nav = view.getByRole("navigation");
  expect(nav.textContent).not.toContain(runId);
  expect(nav.textContent).toContain("Root");
  expect(nav.textContent).toContain("e1df80");
  expect(nav.textContent).not.toContain("Model unavailable");
  expect(nav.textContent).not.toContain("Total 42s");
  const details = view.container.querySelector<HTMLDetailsElement>(".pi-subagents-capture")!;
  expect(details.open).toBe(false);
  details.open = true;
  expect(details.textContent).toContain(runId);
  expect(details.textContent).toContain("Model unavailable");
});

it("shows captured task context or actual model in the navigator without guessing missing values", () => {
  const view = render(<SubagentsView state={enriched} />);
  const nav = view.getByRole("navigation");
  expect(nav.textContent).toContain("first");
  expect(nav.textContent).toContain("child-model");
  expect(nav.textContent).not.toContain("child-provider");
  expect(view.getAllByText("Captured model: child-model · child-provider")).toHaveLength(1);
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
  expect(Array.from(transcript.children).map((n) => n.textContent)).toEqual([
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
      .slice(0, 6)
      .map((node) => node.className),
  ).toEqual([
    "pi-subagents-task",
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
