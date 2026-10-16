// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { dashboardFixture } from "./app.test-support.js";
import { reportsFixture } from "./machines.test-support.js";
import { useMachineReport } from "./use-report.js";
import type { CalendarQuery } from "../history/calendar/calendar-contract.js";
import { calendarEmptySnapshot } from "../history/calendar/calendar-test-support.js";

const now = Date.parse("2026-10-01T12:00:00Z");
const query: CalendarQuery = {
  startDate: "2026-09-02",
  timezone: "UTC",
  group: "workspace",
  scope: { kind: "host" },
  includeUncertain: true,
};
const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function observation(q: CalendarQuery, tokens = 1200, cached = false) {
  const value = reportsFixture(q, now);
  for (const row of value.machines) {
    row.cached = cached;
    if (row.report.state === "unavailable") throw Error("Fixture unavailable");
    const report = row.report;
    report.days[14]!.totalTokens = report.summary.totalTokens = tokens / 2;
    report.days[14]!.classes = { state: "unavailable" };
    report.ranking[0]!.totalTokens = tokens / 2;
  }
  return value;
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("renders saved 1200 and cost 6 in the real dashboard before live and preparation settle", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  const f = await dashboardFixture();
  const live = deferred<unknown>(),
    prepare = deferred<unknown>(),
    threads = deferred<unknown>();
  f.machinePreparation.mockReturnValue(prepare.promise);
  f.machineReports.mockImplementation(() => live.promise);
  f.machineReportSnapshot.mockImplementation(async (input) => {
    const q = (input as { query: CalendarQuery }).query;
    return q.group === "thread" ? threads.promise : observation(q, 1200, true);
  });
  const page = f.page(),
    q = within(page.container);
  await waitFor(() =>
    expect(q.getByLabelText("Recorded token subtotal").textContent).toBe("1.2 thousand"),
  );
  expect(q.getByLabelText("Recorded token subtotal").title).toBe("1,200 tokens");
  expect(q.getByLabelText("Captured cost subtotal").textContent).toBe("$6.00");
  expect(q.getByText(/Last-known summaries/).textContent).toContain("MacBook, Build server");
  expect(q.getByText("Refreshing recorded usage…").textContent).toBe("Refreshing recorded usage…");
  expect((q.getByRole("button", { name: "Previous 30 days" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  const count = f.machineReports.mock.calls.length;
  fireEvent.click(q.getByRole("button", { name: "Estimated cost" }));
  expect(f.machineReports.mock.calls.length).toBe(count);
  await act(async () =>
    live.resolve(
      observation((f.machineReports.mock.calls[0]![0] as { query: CalendarQuery }).query, 1800),
    ),
  );
  await waitFor(() =>
    expect(q.getByLabelText("Recorded token subtotal").textContent).toBe("1.8 thousand"),
  );
  expect(q.queryByText(/Last-known summaries/)).toBeNull();
  expect([
    f.historyReadiness.mock.calls.length,
    f.collectorControl.mock.calls.length,
    f.historicalImport.mock.calls.length,
  ]).toEqual([0, 0, 0]);
  page.lifecycle.unmount();
});

it("does not let a hanging saved lookup delay a cold live report or let a late snapshot overwrite it", async () => {
  const saved = deferred<unknown>();
  const read = vi.fn(async () => observation(query, 1800));
  const hook = renderHook(() => useMachineReport(query, 0, read, () => saved.promise));
  await waitFor(() =>
    expect(hook.result.current.view?.summary).toMatchObject({ totalTokens: 1800, capturedCost: 6 }),
  );
  await act(async () => saved.resolve(observation(query, 1200, true)));
  expect(hook.result.current.view?.summary.totalTokens).toBe(1800);
  expect(hook.result.current.current?.machines.map((row) => row.cached)).toEqual([false, false]);
});

it("retains same-query known marked values on rejection and clears them on authoritative removal", async () => {
  let revision = 0;
  const read = vi.fn(async (): Promise<unknown> => observation(query, 1800));
  const hook = renderHook(() =>
    useMachineReport(query, revision, read, async () => observation(query, 1200, true)),
  );
  await waitFor(() => expect(hook.result.current.view?.summary.totalTokens).toBe(1800));
  read.mockRejectedValueOnce(Error("transient"));
  revision++;
  hook.rerender();
  await waitFor(() => expect(hook.result.current.failed).toBe(true));
  expect(hook.result.current.view?.summary).toMatchObject({ totalTokens: 1800, capturedCost: 6 });
  expect(hook.result.current.current?.machines.map((row) => row.cached)).toEqual([true, true]);
  read.mockResolvedValueOnce({ machines: [], truncated: false, cache: "saved" });
  await act(async () => hook.result.current.retry());
  await waitFor(() => expect(hook.result.current.failed).toBe(false));
  expect(hook.result.current.view).toBeNull();
  expect(hook.result.current.current?.machines).toEqual([]);
});

it("retires both saved and live A-to-B-to-A responses and cannot publish after unmount", async () => {
  const aSaved = deferred<unknown>(),
    aLive = deferred<unknown>(),
    bSaved = deferred<unknown>(),
    bLive = deferred<unknown>();
  const read = vi
    .fn()
    .mockReturnValueOnce(aLive.promise)
    .mockReturnValueOnce(bLive.promise)
    .mockResolvedValue(observation(query, 1800));
  const saved = vi
    .fn()
    .mockReturnValueOnce(aSaved.promise)
    .mockReturnValueOnce(bSaved.promise)
    .mockResolvedValue(observation(query, 1200, true));
  let selected = query;
  const hook = renderHook(() => useMachineReport(selected, 0, read, saved));
  await waitFor(() => expect(read.mock.calls.length).toBe(1));
  selected = { ...query, startDate: "2026-08-03" };
  hook.rerender();
  await waitFor(() => expect(read.mock.calls.length).toBe(2));
  selected = query;
  hook.rerender();
  await waitFor(() => expect(hook.result.current.view?.summary.totalTokens).toBe(1800));
  await act(async () => {
    aSaved.resolve(observation(query, 1200, true));
    aLive.resolve(observation(query, 1200));
    bSaved.resolve(observation(selected, 2400, true));
    bLive.resolve(observation(selected, 2400));
  });
  expect(hook.result.current.view?.summary.totalTokens).toBe(1800);
  const pending = deferred<unknown>();
  read.mockReturnValueOnce(pending.promise);
  act(() => hook.result.current.retry());
  await waitFor(() => expect(read.mock.calls.length).toBe(4));
  hook.unmount();
  await act(async () => pending.resolve(observation(query, 2400)));
  expect(hook.result.current.view?.summary.totalTokens).toBe(1800);
});

it("performs one trailing live read when preparation settles during an outstanding read", async () => {
  const first = deferred<unknown>(),
    next = deferred<unknown>();
  const read = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise);
  let revision = 0;
  const hook = renderHook(() =>
    useMachineReport(query, revision, read, async () => observation(query, 1200, true)),
  );
  await waitFor(() => expect(hook.result.current.view?.summary.totalTokens).toBe(1200));
  revision = 1;
  hook.rerender();
  revision = 2;
  hook.rerender();
  expect(read.mock.calls.length).toBe(1);
  await act(async () => first.resolve(observation(query, 1800)));
  await waitFor(() => expect(read.mock.calls.length).toBe(2));
  expect(hook.result.current.view?.summary.totalTokens).toBe(1800);
  await act(async () => next.resolve(observation(query, 2400)));
  await waitFor(() => expect(hook.result.current.view?.summary.totalTokens).toBe(2400));
});

it("preserves a certified zero while its live reread is pending", async () => {
  const zero = reportsFixture(query, now);
  for (const row of zero.machines) row.report = calendarEmptySnapshot(query, "observed-inactivity");
  const held = deferred<unknown>();
  const read = vi.fn().mockResolvedValueOnce(zero).mockReturnValueOnce(held.promise);
  let revision = 0;
  const hook = renderHook(() => useMachineReport(query, revision, read));
  await waitFor(() => expect(hook.result.current.view?.summary.totalTokens).toBe(0));
  revision = 1;
  hook.rerender();
  await waitFor(() => expect(read.mock.calls.length).toBe(2));
  expect(hook.result.current.refreshing).toBe(true);
  expect(hook.result.current.view?.days.every((day) => day.coverage.zero)).toBe(true);
  expect(hook.result.current.current?.machines.map((row) => row.cached)).toEqual([false, false]);
});
