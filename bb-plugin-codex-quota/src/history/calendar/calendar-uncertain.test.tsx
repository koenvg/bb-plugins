// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CalendarReportPanel } from "./calendar-panel.js";
import { calendarSnapshot } from "./calendar-test-support.js";
import { chartData } from "./calendar-chart-data.js";
import { ImportPanel } from "../import/import-view.js";
import type { CalendarQuery } from "./calendar-contract.js";
import type { ImportCommand, ImportView } from "../import/import-contract.js";

afterEach(cleanup);
const now = Date.parse("2026-10-01T12:00:00Z");
function snapshot(query: CalendarQuery) {
  const view = calendarSnapshot(query, now);
  if (query.includeUncertain) {
    view.days[14].uncertain = { totalTokens: 300, records: 3 };
    view.summary.uncertain = { totalTokens: 300, records: 3 };
  }
  return view;
}
it("includes uncertain tokens by default without toggles, status clutter or extra cost", async () => {
  const read = vi.fn(async ({ query }: { query: CalendarQuery }) => snapshot(query));
  render(
    <CalendarReportPanel
      selection={{ hostId: "host-a", generation: 1 }}
      now={now}
      read={read}
      prepare={async () => ({ state: "pending", progress: "first" })}
    />,
  );
  await screen.findByRole("group", { name: "Daily recorded values" });
  expect(read.mock.calls[0][0].query.includeUncertain).toBe(true);
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.queryByLabelText("Estimated token summary")).toBeNull();
  for (const copy of [
    "Include uncertain history",
    "Token estimates only.",
    "Preparing history. The chart remains available.",
    "Today is in progress. Values are recorded so far.",
    "Partial history",
  ])
    expect(screen.queryByText(copy)).toBeNull();
  expect(screen.getByRole("columnheader", { name: "Uncertain token estimate" })).toBeTruthy();
  const calls = read.mock.calls.length;
  fireEvent.change(screen.getByRole("combobox", { name: "Report metric" }), {
    target: { value: "cost" },
  });
  expect(read.mock.calls.length).toBe(calls);
  expect(screen.queryByRole("columnheader", { name: "Uncertain token estimate" })).toBeNull();
});

it("includes estimates for each selected host while discarding late responses from another host", async () => {
  let release!: (value: ReturnType<typeof snapshot>) => void;
  const read = vi.fn(async ({ hostId, query }: { hostId: string; query: CalendarQuery }) =>
    hostId === "host-a"
      ? new Promise<ReturnType<typeof snapshot>>((resolve) => {
          release = resolve;
        })
      : snapshot(query),
  );
  const ui = render(
    <CalendarReportPanel selection={{ hostId: "host-a", generation: 1 }} now={now} read={read} />,
  );
  await waitFor(() => expect(release).toBeTruthy());
  const oldQuery = read.mock.calls[0][0].query;
  ui.rerender(
    <CalendarReportPanel selection={{ hostId: "host-b", generation: 2 }} now={now} read={read} />,
  );
  await screen.findByRole("group", { name: "Daily recorded values" });
  const old = snapshot(oldQuery);
  old.days[14].uncertain = { totalTokens: 999, records: 1 };
  old.summary.uncertain = { totalTokens: 999, records: 1 };
  await act(async () => release(old));
  expect(screen.queryByText("999")).toBeNull();
  expect(read.mock.calls.at(-1)?.[0]).toMatchObject({
    hostId: "host-b",
    query: { includeUncertain: true },
  });
});

it("shows an uncertain-only day without treating missing recorded history as zero or adding uncertain cost", () => {
  const view = snapshot({
    startDate: "2026-09-01",
    timezone: "UTC",
    group: "workspace",
    scope: { kind: "host" },
    includeUncertain: true,
  });
  view.days[0].uncertain = { totalTokens: 900, records: 1 };
  const tokens = chartData(view.days, "tokens");
  expect(tokens.maximum).toBe(900);
  expect(tokens.rows[0]).toMatchObject({ value: null, height: 0, uncertainHeight: 1 });
  expect(tokens.rows[14]).toMatchObject({ height: 600 / 900, uncertainHeight: 300 / 900 });
  const cost = chartData(view.days, "cost");
  expect(cost.maximum).toBe(0);
  expect(cost.rows.every((row) => row.uncertainHeight === 0)).toBe(true);
});

it("starts manual imports with uncertain recovery by default and keeps Resume frozen", async () => {
  const configured: ImportView = {
    reason: "ok",
    configuration: { bbRoot: "/source", ordinaryRoots: [], workspaces: ["/work"] },
    generation: null,
  };
  const call = vi.fn(async (_input: { command: ImportCommand }) => configured);
  const ui = render(<ImportPanel selection={{ hostId: "host-a", generation: 1 }} call={call} />);
  (ui.container.querySelector("details") as HTMLDetailsElement).open = true;
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: `Start import` }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(call.mock.calls[0][0].command).toEqual({ action: "status" });
  const stopped: ImportView = {
    ...configured,
    generation: {
      id: "00000000-0000-4000-8000-000000000001",
      state: "stopped",
      startAt: "2026-07-01T00:00:00.000Z",
      endAt: "2026-10-01T00:00:00.000Z",
      workspaces: ["/work"],
      candidates: 1,
      finished: 0,
      bytes: 0,
      records: 0,
      replayed: 0,
      omissions: 0,
      coverage: "partial",
      diagnostics: [],
      includeUncertain: true,
      uncertainRecords: 2,
    },
  };
  call.mockResolvedValue(stopped);
  fireEvent.click(screen.getByRole("button", { name: `Start import` }));
  await screen.findByText(/2 new uncertain token records retained/);
  expect(call.mock.calls.at(-1)?.[0].command).toEqual({ action: "start", includeUncertain: true });
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: `Resume import` }));
  await waitFor(() => expect(call.mock.calls.at(-1)?.[0].command).toEqual({ action: "resume" }));
});
