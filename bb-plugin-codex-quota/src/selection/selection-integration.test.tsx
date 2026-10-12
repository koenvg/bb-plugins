// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { dashboardFixture } from "../machines/app.test-support.js";
import { setHistoryManagementOpen } from "../history/history-test-support.js";

afterEach(cleanup);
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
it.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
])(
  "isolates management changes from combined usage, switch back=%s late readiness=%s",
  async (back, late) => {
    const f = await dashboardFixture(),
      selection = deferred<{ hostId: string; generation: number }>();
    const stale = deferred<unknown>(),
      ready = f.historyReadiness.getMockImplementation()!;
    let selected = 0;
    f.selectHost.mockImplementation(async (raw) => {
      const { hostId } = raw as { hostId: string };
      if (++selected === 1) return { hostId, generation: 1 };
      if (hostId === "host_two") return selection.promise;
      return { hostId, generation: 3 };
    });
    const page = f.page(),
      q = within(page.container);
    await q.findByText("63%");
    await setHistoryManagementOpen(page.container);
    await q.findByText("History not configured on this host.");
    if (late) {
      f.historyReadiness.mockImplementationOnce(async () => stale.promise);
      fireEvent.click(q.getByRole("button", { name: "Check readiness" }));
      await waitFor(() => expect(f.historyReadiness.mock.calls.length).toBe(2));
    }
    fireEvent.click(q.getAllByRole("button", { name: "Manage history" })[1]!);
    expect(q.queryByRole("region", { name: "History readiness" })).toBeNull();
    expect(q.getByText("63%")).toBeTruthy();
    expect(q.getByLabelText("Recorded token subtotal").textContent).toBe("1.2K");
    if (back) fireEvent.click(q.getAllByRole("button", { name: "Manage history" })[0]!);
    await act(async () => {
      if (late)
        stale.resolve({
          state: "unavailable",
          reason: "collector-incompatible",
          storage: "unavailable",
          collector: "incompatible",
          writer: "unavailable",
          collection: null,
        });
      selection.resolve({ hostId: "host_two", generation: 2 });
    });
    await q.findByText("History not configured on this host.");
    expect(f.historyReadiness.mock.lastCall![0]).toEqual({
      hostId: back ? "host_one" : "host_two",
      generation: back ? 3 : 2,
    });
    expect(q.queryByText(/Collector is incompatible/)).toBeNull();
    expect(f.collectorControl).not.toHaveBeenCalled();
    expect(
      f.historicalImport.mock.calls.every(
        ([input]) => (input as { command: { action: string } }).command.action === "status",
      ),
    ).toBe(true);
    expect(ready).toBeTypeOf("function");
  },
);
it("does not dispatch management reads while an explicit machine choice is pending", async () => {
  const f = await dashboardFixture(),
    pending = deferred<{ hostId: string; generation: number }>();
  f.selectHost
    .mockImplementationOnce(async () => ({ hostId: "host_one", generation: 1 }))
    .mockImplementationOnce(async () => pending.promise);
  const page = f.settings(),
    q = within(page.container);
  await setHistoryManagementOpen(page.container);
  await q.findByText("History not configured on this host.");
  const reads = f.historyReadiness.mock.calls.length;
  fireEvent.click(q.getAllByRole("button", { name: "Manage history" })[1]!);
  await q.findByText("Opening machine history…");
  expect(f.historyReadiness).toHaveBeenCalledTimes(reads);
  expect(f.collectorControl).not.toHaveBeenCalled();
  await act(async () => {
    pending.resolve({ hostId: "host_two", generation: 2 });
  });
  await q.findByText("History not configured on this host.");
  expect(f.historyReadiness.mock.lastCall![0]).toEqual({ hostId: "host_two", generation: 2 });
});
it("blocks a queued collector request when a same-turn machine choice starts", async () => {
  const f = await dashboardFixture(),
    pending = deferred<{ hostId: string; generation: number }>();
  f.selectHost
    .mockImplementationOnce(async () => ({ hostId: "host_one", generation: 1 }))
    .mockImplementationOnce(async () => pending.promise);
  const page = f.settings(),
    q = within(page.container);
  await setHistoryManagementOpen(page.container);
  await q.findByText("History not configured on this host.");
  q.getByText("Collection and privacy").closest("details")!.open = true;
  const install = q.getByRole("button", { name: "Install collector" });
  await act(async () => {
    fireEvent.click(install);
    fireEvent.click(q.getAllByRole("button", { name: "Manage history" })[1]!);
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  expect(f.collectorControl).not.toHaveBeenCalled();
  await act(async () => {
    pending.resolve({ hostId: "host_two", generation: 2 });
  });
});
