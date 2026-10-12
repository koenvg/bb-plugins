// @vitest-environment jsdom
import { act, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { dashboardFixture, reportFixture } from "../../machines/app.test-support.js";
import { reportsFixture } from "../../machines/machines.test-support.js";
import { calendarEmptySnapshot, calendarSnapshot } from "./calendar-test-support.js";
import { latestStart, shiftDate } from "./calendar-time.js";
import type { CalendarQuery } from "./calendar-contract.js";
it("shows only the top ten rankings for each grouping and selected metric", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  const f = await dashboardFixture();
  f.machineReports.mockImplementation(async (input) => {
    const data = reportsFixture(requested(input));
    data.machines = data.machines.slice(0, 1);
    const report = data.machines[0]!.report;
    if (report.state === "unavailable") throw new Error("Fixture unavailable");
    const template = report.ranking[0]!;
    report.ranking = Array.from({ length: 12 }, (_, i) => ({
      ...template,
      key: `entry-${i}`,
      label: `Ranking ${i + 1}`,
      totalTokens: (i + 1) * 10,
      money: { ...template.money, capturedCost: 12 - i },
    }));
    return data;
  });
  const page = f.page(),
    q = within(page.container);
  const table = await q.findByRole("table", { name: "Recorded usage ranking" });
  await waitFor(() => expect(table.querySelectorAll("tbody tr")).toHaveLength(10));
  const labels = () =>
    Array.from(table.querySelectorAll("tbody tr td:first-child")).map(
      (cell) => cell.firstChild?.textContent,
    );
  expect(labels()[0]).toContain("Ranking 12");
  expect(labels()).not.toContain("Ranking 1");
  expect(q.getByRole("heading", { name: "Top 10 threads" })).toBeTruthy();
  fireEvent.click(q.getByRole("button", { name: "Workspaces" }));
  await q.findByRole("heading", { name: "Top 10 workspaces" });
  await waitFor(() => expect(table.querySelectorAll("tbody tr")).toHaveLength(10));
  const totals = q.getByLabelText("Recorded token subtotal").textContent;
  fireEvent.click(q.getByRole("button", { name: "Estimated cost" }));
  await waitFor(() => expect(labels()[0]).toBe("Ranking 1"));
  expect(labels()).not.toContain("Ranking 12");
  expect(table.querySelectorAll("tbody tr")).toHaveLength(10);
  expect(q.getByLabelText("Recorded token subtotal").textContent).toBe(totals);
});

it("defaults to Threads first and removes the requested generic notices", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  const f = await dashboardFixture();
  f.machinePreparation.mockResolvedValue({ state: "pending", progress: "synthetic-pending" });
  f.machineReports.mockImplementation(async (input) => {
    const data = reportsFixture(requested(input));
    for (const row of data.machines)
      if (row.report.state !== "unavailable") row.report.truncated = true;
    return data;
  });
  const page = f.page(),
    q = within(page.container);
  await q.findByRole("table", { name: "Daily recorded usage" });
  expect(q.getByRole("heading", { name: "Top 10 threads" })).toBeTruthy();
  const grouping = q.getByLabelText("Usage grouping");
  const buttons = within(grouping).getAllByRole("button");
  expect(buttons.map((button) => button.textContent)).toEqual(["Threads", "Workspaces"]);
  expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true");
  expect(q.queryByText(/Preparing newly recorded history/)).toBeNull();
  expect(q.queryByText(/Ranking is bounded or incomplete/)).toBeNull();
  expect(q.queryByText(/Calendar dates use/)).toBeNull();
  expect(q.queryByText(/Unknown dates are not certified zero/)).toBeNull();
  expect(q.getByLabelText("Recorded token subtotal").textContent).toBe("1.2K");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const requested = (input: unknown) => (input as { query: CalendarQuery }).query;
async function pageFixture() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  const f = await dashboardFixture(),
    page = f.page();
  return { ...f, view: page, q: within(page.container) };
}
it("opens the latest thirty dates through today", async () => {
  const f = await pageFixture();
  await f.q.findByRole("table", { name: "Daily recorded usage" });
  expect(requested(f.machineReports.mock.lastCall![0]).startDate).toBe(
    latestStart(Date.now(), "UTC"),
  );
  expect(f.q.getByText(/2026-09-02 – 2026-10-01/)).toBeTruthy();
  expect(f.q.queryByText(/Preparing newly/)).toBeNull();
});
it("navigates the retained chart without opening collection or import controls", async () => {
  const f = await pageFixture();
  await f.q.findByRole("group", { name: "Daily recorded values" });
  const old = requested(f.machineReports.mock.lastCall![0]);
  fireEvent.click(f.q.getByRole("button", { name: "Previous 30 days" }));
  await waitFor(() =>
    expect(requested(f.machineReports.mock.lastCall![0]).startDate).toBe(
      shiftDate(old.startDate, -30),
    ),
  );
  fireEvent.click(f.q.getByRole("button", { name: "Latest" }));
  await waitFor(() =>
    expect(requested(f.machineReports.mock.lastCall![0]).startDate).toBe(old.startDate),
  );
  expect(f.selectHost).not.toHaveBeenCalled();
  expect(f.historyReadiness).not.toHaveBeenCalled();
  expect(f.collectorControl).not.toHaveBeenCalled();
  expect(f.historicalImport).not.toHaveBeenCalled();
  expect(
    f.machineReports.mock.calls.every(
      ([input]) =>
        !(input as { prepare: boolean }).prepare && !(input as { refresh: boolean }).refresh,
    ),
  ).toBe(true);
});
it("changes metrics locally without another report or preparation request", async () => {
  const f = await pageFixture();
  await f.q.findByRole("group", { name: "Daily recorded values" });
  const reads = f.machineReports.mock.calls.length,
    preparations = f.machinePreparation.mock.calls.length;
  fireEvent.click(f.q.getByRole("button", { name: "Estimated cost" }));
  expect(f.machineReports).toHaveBeenCalledTimes(reads);
  expect(f.machinePreparation).toHaveBeenCalledTimes(preparations);
  expect(f.q.queryByText("Daily values")).toBeNull();
});
it("hides the previous date range immediately and ignores its late response", async () => {
  const f = await pageFixture();
  await f.q.findByRole("group", { name: "Daily recorded values" });
  let done!: (value: unknown) => void;
  f.machineReports.mockImplementationOnce(
    async () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  fireEvent.click(f.q.getByRole("button", { name: "Previous 30 days" }));
  await waitFor(() => expect(done).toBeTypeOf("function"));
  expect(f.q.queryByRole("group", { name: "Daily recorded values" })).toBeNull();
  const oldQuery = requested(f.machineReports.mock.lastCall![0]);
  fireEvent.click(f.q.getByRole("button", { name: "Latest" }));
  await f.q.findByRole("group", { name: "Daily recorded values" });
  const old = reportsFixture(oldQuery);
  old.machines[0]!.report = { state: "unavailable", reason: "host-offline" };
  await act(async () => {
    done(old);
  });
  expect(f.q.getByLabelText("Recorded token subtotal").textContent).toBe("1.2K");
});
it("makes a missing viewer time zone explicit and sends no report or ingestion request", async () => {
  const f = await dashboardFixture();
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
    throw new Error("Timezone unavailable");
  });
  const page = f.page();
  await within(page.container).findByText(/Viewer time zone unavailable/);
  expect(f.machineReports).not.toHaveBeenCalled();
  expect(f.machinePreparation).not.toHaveBeenCalled();
});
it.each(["unknown", "observed-inactivity"] as const)(
  "keeps %s dates distinct from invented zero usage",
  async (state) => {
    const f = await dashboardFixture();
    f.machineReports.mockImplementation(async (input) =>
      reportFixture(calendarEmptySnapshot(requested(input), state)),
    );
    const page = f.page(),
      q = within(page.container);
    await q.findByRole("table", { name: "Daily recorded usage" });
    expect(q.getByLabelText("Recorded token subtotal").textContent).toBe(
      state === "unknown" ? "Unknown" : "0",
    );
    expect(
      within(q.getByRole("table", { name: "Daily recorded usage" })).getAllByRole("row").length,
    ).toBe(31);
  },
);
it("does not draw monetary zero when accepted records have no captured prices", async () => {
  const f = await dashboardFixture();
  f.machineReports.mockImplementation(async (input) =>
    reportFixture(calendarSnapshot(requested(input))),
  );
  const page = f.page(),
    q = within(page.container);
  await q.findByRole("table", { name: "Daily recorded usage" });
  fireEvent.click(q.getByRole("button", { name: "Estimated cost" }));
  expect(q.getByLabelText("Captured cost subtotal").textContent).toBe("Unknown");
  expect(q.getAllByText(/0 of 60 accepted records priced/)).toBeTruthy();
  expect(q.queryByText(/Recorded usage can be incomplete/)).toBeNull();
  expect(
    q.queryByText(/Dollar values are captured estimates, not subscription spending/),
  ).toBeNull();
  expect(q.queryByText(/tokens excluded\.$/)).toBeNull();
});
it("retains recorded offline values with an incomplete-coverage notice", async () => {
  const f = await dashboardFixture();
  f.machineReports.mockImplementation(async (input) => {
    const data = reportsFixture(requested(input));
    data.machines[0]!.cached = true;
    data.machines[0]!.machine.status = "disconnected";
    return data;
  });
  const page = f.page(),
    q = within(page.container);
  await waitFor(() => expect(q.getByLabelText("Recorded token subtotal").textContent).toBe("1.2K"));
  expect(q.getByText(/Last-known summaries retained for MacBook/)).toBeTruthy();
  expect(q.getByText(/newer usage is unknown/)).toBeTruthy();
});
it("does not turn absent history into zero, or hide independently available account allowance", async () => {
  const f = await dashboardFixture();
  f.machineReports.mockImplementation(async (input) => {
    const data = reportsFixture(requested(input));
    for (const row of data.machines) row.report = { state: "unavailable", reason: "host-offline" };
    return data;
  });
  const page = f.page(),
    q = within(page.container);
  await q.findByText(/No usable recorded history/);
  expect(q.getByLabelText("Recorded token subtotal").textContent).toBe("—");
  expect(q.getByText("63%")).toBeTruthy();
});
it("retries a chart failure without refreshing allowance or installing collection", async () => {
  const f = await dashboardFixture();
  f.machineReports.mockRejectedValue(new Error("private diagnostic"));
  const page = f.page(),
    q = within(page.container);
  await q.findByRole("button", { name: "Retry chart" });
  expect(page.container.textContent).not.toContain("private diagnostic");
  f.machineReports.mockImplementation(async (input) => reportsFixture(requested(input)));
  fireEvent.click(q.getByRole("button", { name: "Retry chart" }));
  await q.findByRole("group", { name: "Daily recorded values" });
  expect(f.machineAccounts).toHaveBeenCalledTimes(1);
  expect(f.collectorControl).not.toHaveBeenCalled();
  expect(f.historicalImport).not.toHaveBeenCalled();
});
it("keeps stopped preparation visible after a successful report and offers manual retry", async () => {
  const f = await dashboardFixture();
  f.machinePreparation.mockResolvedValue({
    state: "unavailable",
    reason: "unsupported",
    progress: "",
  });
  const page = f.page(),
    q = within(page.container);
  await q.findByRole("group", { name: "Daily recorded values" });
  await q.findByRole("button", { name: "Retry preparation" });
  f.machinePreparation.mockResolvedValue({ state: "settled", progress: "ready" });
  fireEvent.click(q.getByRole("button", { name: "Retry preparation" }));
  await waitFor(() => expect(q.queryByRole("button", { name: "Retry preparation" })).toBeNull());
  expect(f.historyReadiness).not.toHaveBeenCalled();
});
it("ignores report completion after the public slot unmounts", async () => {
  const f = await dashboardFixture();
  let done!: (value: unknown) => void;
  f.machineReports.mockImplementation(
    async () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  const page = f.page();
  await waitFor(() => expect(done).toBeTypeOf("function"));
  const query = requested(f.machineReports.mock.lastCall![0]);
  page.lifecycle.unmount();
  await act(async () => {
    done(reportsFixture(query));
  });
  expect(page.container.textContent).toBe("");
});
it("keeps recorded totals while omitting the generic bounded-ranking notice", async () => {
  const f = await dashboardFixture();
  f.machineReports.mockImplementation(async (input) => {
    const data = reportsFixture(requested(input));
    const report = data.machines[0]!.report;
    if (report.state !== "unavailable") report.truncated = true;
    return data;
  });
  const page = f.page();
  const q = within(page.container);
  await waitFor(() => expect(q.getByLabelText("Recorded token subtotal").textContent).toBe("1.2K"));
  expect(q.queryByText(/Ranking is bounded or incomplete/)).toBeNull();
});
it("keeps a previous valid subtotal after a malformed response for the same range", async () => {
  const f = await dashboardFixture();
  let finish!: (value: unknown) => void,
    reads = 0;
  f.machinePreparation.mockImplementationOnce(
    async () =>
      new Promise((done) => {
        finish = done;
      }),
  );
  f.machineReports.mockImplementation(async (input) =>
    ++reads === 1 ? reportsFixture(requested(input)) : { machines: "invalid" },
  );
  const page = f.page(),
    q = within(page.container);
  await q.findByRole("group", { name: "Daily recorded values" });
  await act(async () => {
    finish({ state: "settled", progress: "ready" });
  });
  await q.findByRole("button", { name: "Retry chart" });
  expect(q.getByLabelText("Recorded token subtotal").textContent).toBe("1.2K");
  expect(q.getByText(/Recorded values are out of date/)).toBeTruthy();
});
