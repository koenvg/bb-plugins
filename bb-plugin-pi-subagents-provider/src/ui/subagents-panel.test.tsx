// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => {
  const list = vi.fn();
  return { list, sdk: { threads: { events: { list } } } };
});
vi.mock("@get-bb/plugin-sdk/app", () => ({ useSdk: () => h.sdk }));
import { SubagentsPanel } from "./subagents-panel.js";
const state = {
  kind: "pi-subagents-view",
  version: 1,
  updatedAt: 1,
  availability: "available",
  reason: "",
  omitted: 0,
  rows: [
    {
      id: "owned",
      runId: "r",
      sessionId: "pi",
      generation: 1,
      source: "foreground",
      kind: "subagent",
      label: "reviewer",
      state: "complete",
      incomplete: false,
      observedAt: 1,
      capture: { status: "captured", capturedAt: 1, finalOutput: "accepted answer" },
    },
  ],
};
const event = (kind: string, payload: unknown) => ({
  type: "thread/extensionState/updated",
  data: { kind, payload },
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("uses the public event list, filters its qualified kind and restores accepted data after remount", async () => {
  h.list.mockResolvedValue([
    event("other/fake", { ...state, rows: [] }),
    event("pi-subagents-provider/pi-subagents-view", state),
  ]);
  const first = render(<SubagentsPanel threadId="owned-thread" params={{}} />);
  await waitFor(() => expect(first.getByText("accepted answer")).toBeDefined());
  expect(h.list.mock.calls[0]![0]).toMatchObject({
    threadId: "owned-thread",
    types: ["thread/extensionState/updated"],
    order: "desc",
    limit: "64",
  });
  const signal = h.list.mock.calls[0]![0].signal as AbortSignal;
  first.unmount();
  expect(signal.aborted).toBe(true);
  const next = {
    ...state,
    rows: state.rows.map((row) => ({
      ...row,
      capture: { status: "unavailable", capturedAt: 2, reason: "Artifact missing" },
    })),
  };
  h.list.mockResolvedValue([
    event("pi-subagents-provider/pi-subagents-view", next),
    event("pi-subagents-provider/pi-subagents-view", state),
  ]);
  const second = render(<SubagentsPanel threadId="owned-thread" params={{}} />);
  await waitFor(() => expect(second.getByText("accepted answer")).toBeDefined());
  expect(second.getByText(/Capture unavailable: Artifact missing/)).toBeDefined();
});
it("keeps a full-window history notice without treating accepted current data as an error", async () => {
  h.list.mockResolvedValue(
    Array.from({ length: 64 }, () => event("pi-subagents-provider/pi-subagents-view", state)),
  );
  const view = render(<SubagentsPanel threadId="owned-thread" params={{}} />);
  await waitFor(() => expect(view.getByText("accepted answer")).toBeDefined());
  expect(view.getByRole("status").textContent).toContain(
    "Older history may be outside this bounded window.",
  );
  expect(view.queryByRole("alert")).toBeNull();
});

it("shows unsupported stored state rather than accepting it as an empty success", async () => {
  h.list.mockResolvedValue([
    event("pi-subagents-provider/pi-subagents-view", { ...state, version: 2 }),
  ]);
  const view = render(<SubagentsPanel threadId="owned-thread" params={{}} />);
  await waitFor(() =>
    expect(view.getByRole("alert").textContent).toContain("unsupported or malformed"),
  );
});

const background = {
  ...state.rows[0]!,
  id: "background-owned",
  runId: "bg",
  source: "background",
  label: "Builder",
  capture: { status: "captured", capturedAt: 1, finalOutput: "background answer" },
};
it("selects a requested background root after loading and keeps manual selection across refresh", async () => {
  vi.useFakeTimers();
  try {
    h.list.mockResolvedValue([
      event("pi-subagents-provider/pi-subagents-view", {
        ...state,
        rows: [...state.rows, background],
      }),
    ]);
    const view = render(
      <SubagentsPanel threadId="owned-thread" params={{ rowId: background.id }} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(view.getByRole("article", { name: "Child detail" }).textContent).toContain(
      "background answer",
    );
    fireEvent.click(view.getByRole("button", { name: /reviewer/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(h.list).toHaveBeenCalledTimes(2);
    expect(view.getByRole("article", { name: "Child detail" }).textContent).toContain(
      "accepted answer",
    );
    view.unmount();
  } finally {
    vi.useRealTimers();
  }
});
it.each([{ rowId: "missing" }, { rowId: "x".repeat(1801) }, { rowId: 42 }, { rowId: "owned" }])(
  "reports unavailable or invalid targets without showing the wrong detail: %j",
  async (params) => {
    h.list.mockResolvedValue([
      event("pi-subagents-provider/pi-subagents-view", {
        ...state,
        rows: [...state.rows, background],
      }),
    ]);
    const view = render(<SubagentsPanel threadId="owned-thread" params={params} />);
    await waitFor(() => expect(view.getByRole("alert").textContent).toMatch(/unavailable|invalid/));
    expect(view.queryByRole("article", { name: "Child detail" })).toBeNull();
    fireEvent.click(view.getByRole("button", { name: /Builder/ }));
    expect(view.getByRole("article", { name: "Child detail" }).textContent).toContain(
      "background answer",
    );
  },
);
it("applies a changed target without using a stale selection", async () => {
  h.list.mockResolvedValue([
    event("pi-subagents-provider/pi-subagents-view", {
      ...state,
      rows: [...state.rows, background],
    }),
  ]);
  const view = render(<SubagentsPanel threadId="owned-thread" params={null} />);
  await waitFor(() => expect(view.getByText("accepted answer")).toBeDefined());
  view.rerender(<SubagentsPanel threadId="owned-thread" params={{ rowId: background.id }} />);
  expect(view.getByRole("article", { name: "Child detail" }).textContent).toContain(
    "background answer",
  );
});

it("opens an unselected overview and preserves a manual choice on refresh", async () => {
  vi.useFakeTimers();
  try {
    h.list.mockResolvedValue([
      event("pi-subagents-provider/pi-subagents-view", {
        ...state,
        rows: [...state.rows, background],
      }),
    ]);
    const view = render(<SubagentsPanel threadId="owned-thread" params={{ overview: true }} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(view.queryByRole("article", { name: "Child detail" })).toBeNull();
    expect(view.getByText("Select a captured run to view its detail.")).toBeDefined();
    expect(view.queryByRole("alert")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: /Builder/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(view.getByRole("article", { name: "Child detail" }).textContent).toContain(
      "background answer",
    );
    view.rerender(<SubagentsPanel threadId="owned-thread" params={{ rowId: background.id }} />);
    view.rerender(<SubagentsPanel threadId="owned-thread" params={{ overview: true }} />);
    expect(view.queryByRole("article", { name: "Child detail" })).toBeNull();
    view.unmount();
  } finally {
    vi.useRealTimers();
  }
});
