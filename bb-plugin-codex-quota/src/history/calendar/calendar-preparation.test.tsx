// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CalendarReportPanel } from "./calendar-panel.js";
import { calendarSnapshot } from "./calendar-test-support.js";

const now = Date.parse("2026-10-01T12:00:00Z");
const selection = { hostId: "host_a", generation: 1 };
const pending = (progress: string) => ({ state: "pending", progress });
const settled = { state: "settled", progress: "done" };
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("finishes 158 bounded batches on one open, keeps the chart usable, and refreshes on clock expiry", async () => {
  vi.useFakeTimers();
  let batch = 0;
  const prepare = vi.fn(
    async (_input: import("../report-preparation-contract.js").PreparationRequest) =>
      ++batch < 158 ? pending(String(batch)) : settled,
  );
  const read = vi.fn(async ({ query }) => calendarSnapshot(query));
  const page = render(
    <CalendarReportPanel selection={selection} now={now} read={read} prepare={prepare} />,
  );
  await flush();
  expect(screen.getByRole("group", { name: "Daily recorded values" })).toBeTruthy();
  expect(screen.getByText("Preparing history. The chart remains available.")).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: "Report metric" }), {
    target: { value: "cost" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Previous 30 days" }));
  await flush();
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(157 * 250);
  });
  expect(prepare).toHaveBeenCalledTimes(158);
  expect(screen.queryByText("Preparing history. The chart remains available.")).toBeNull();
  expect(read).toHaveBeenCalledTimes(3);
  page.rerender(
    <CalendarReportPanel selection={selection} now={now + 60000} read={read} prepare={prepare} />,
  );
  await flush();
  expect(prepare).toHaveBeenCalledTimes(159);
  expect(prepare.mock.calls[0][0]).toMatchObject({ ...selection, refresh: true });
  expect(prepare.mock.calls[1][0]).toMatchObject({ ...selection, refresh: false });
});

it.each(["host", "hidden", "unmount"])(
  "retires held responses on %s cancellation",
  async (cancel) => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    const prepare = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const read = vi.fn(async ({ query }) => calendarSnapshot(query));
    const page = render(
      <CalendarReportPanel selection={selection} now={now} read={read} prepare={prepare} />,
    );
    await flush();
    if (cancel === "host")
      page.rerender(
        <CalendarReportPanel
          selection={selection}
          selectionPending
          now={now}
          read={read}
          prepare={prepare}
        />,
      );
    if (cancel === "hidden") {
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      fireEvent(document, new Event("visibilitychange"));
    }
    if (cancel === "unmount") page.unmount();
    await act(async () => {
      finish(pending("late"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
  },
);

it("resumes after hiding and isolates a host switch from late settlement", async () => {
  vi.useFakeTimers();
  let finish!: (value: unknown) => void;
  const prepare = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(settled);
  const read = vi.fn(async ({ query }) => calendarSnapshot(query));
  const page = render(
    <CalendarReportPanel selection={selection} now={now} read={read} prepare={prepare} />,
  );
  await flush();
  const visible = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  fireEvent(document, new Event("visibilitychange"));
  visible.mockReturnValue("visible");
  fireEvent(document, new Event("visibilitychange"));
  await flush();
  expect(prepare).toHaveBeenCalledTimes(2);
  page.rerender(
    <CalendarReportPanel
      selection={{ hostId: "host_b", generation: 2 }}
      selectionRevision={1}
      now={now}
      read={read}
      prepare={prepare}
    />,
  );
  await flush();
  const reads = read.mock.calls.length;
  await act(async () => {
    finish(settled);
  });
  expect(read).toHaveBeenCalledTimes(reads);
});

it.each(["stalled", "unknown", "failure"])(
  "stops bounded continuation on %s and offers an explicit retry",
  async (mode) => {
    vi.useFakeTimers();
    const prepare = vi.fn(async () => {
      if (mode === "failure") throw Error("offline");
      return mode === "unknown"
        ? { state: "unavailable", progress: "", reason: "identity-unavailable" }
        : pending("same");
    });
    render(
      <CalendarReportPanel
        selection={selection}
        now={now}
        read={async ({ query }) => calendarSnapshot(query)}
        prepare={prepare}
      />,
    );
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(prepare.mock.calls.length).toBeLessThanOrEqual(4);
    expect(
      screen.getByText("History preparation stopped. Recorded values remain available."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry preparation" }));
    await flush();
    expect(prepare.mock.calls.length).toBeGreaterThan(1);
  },
);

it("stops a progressing but oversized round at its absolute batch limit", async () => {
  vi.useFakeTimers();
  let batch = 0;
  const prepare = vi.fn(async () => pending(String(++batch)));
  render(
    <CalendarReportPanel
      selection={selection}
      now={now}
      read={async ({ query }) => calendarSnapshot(query)}
      prepare={prepare}
    />,
  );
  await flush();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2048 * 250);
  });
  expect(prepare).toHaveBeenCalledTimes(2048);
  expect(screen.getByRole("button", { name: "Retry preparation" })).toBeTruthy();
});

it("cancels a queued initial dispatch before leaving the selected host", async () => {
  const prepare = vi.fn(async () => settled);
  const read = vi.fn(async ({ query }) => calendarSnapshot(query));
  const page = render(
    <CalendarReportPanel selection={selection} now={now} read={read} prepare={prepare} />,
  );
  page.rerender(
    <CalendarReportPanel
      selection={selection}
      selectionPending
      now={now}
      read={read}
      prepare={prepare}
    />,
  );
  await flush();
  expect(prepare).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});
