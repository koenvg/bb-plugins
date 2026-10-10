// @vitest-environment jsdom
import { act, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { dashboardFixture } from "../machines/app.test-support.js";
import { setHistoryManagementOpen } from "./history-test-support.js";
afterEach(cleanup);
it("keeps one account owner and the official link while history is unconfigured", async () => {
  const f = await dashboardFixture(),
    page = f.page(),
    settings = f.settings();
  const q = within(settings.container);
  await setHistoryManagementOpen(settings.container);
  await q.findByText("History not configured on this host.");
  fireEvent.click(q.getByRole("button", { name: "Check readiness" }));
  await waitFor(() => expect(f.historyReadiness).toHaveBeenCalledTimes(2));
  expect(f.machineAccounts).toHaveBeenCalledTimes(1);
  expect(q.getByText("63%")).toBeTruthy();
  expect(q.getByRole("link", { name: "Open Codex Usage" }).getAttribute("href")).toBe(
    "https://chatgpt.com/codex/settings/usage",
  );
  expect(f.collectorControl).not.toHaveBeenCalled();
  expect(within(page.container).queryByRole("region", { name: "History readiness" })).toBeNull();
});
it.each([false, true])(
  "does not block selected-machine management on a held allowance refresh, switch back=%s",
  async (back) => {
    const f = await dashboardFixture(),
      settings = f.settings(),
      q = within(settings.container);
    await setHistoryManagementOpen(settings.container);
    await q.findByText("History not configured on this host.");
    let finish!: (value: unknown) => void;
    f.machineAccounts.mockImplementationOnce(
      async () =>
        new Promise((done) => {
          finish = done;
        }),
    );
    fireEvent.click(q.getByRole("button", { name: "Refresh allowance" }));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    fireEvent.click(q.getAllByRole("button", { name: "Manage history" })[1]!);
    await q.findByText("History not configured on this host.");
    if (back) {
      fireEvent.click(q.getAllByRole("button", { name: "Manage history" })[0]!);
      await q.findByText("History not configured on this host.");
    }
    expect(f.historyReadiness.mock.lastCall![0]).toMatchObject({
      hostId: back ? "host_one" : "host_two",
    });
    expect((q.getByRole("button", { name: "Check readiness" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(f.collectorControl).not.toHaveBeenCalled();
    await act(async () => {
      finish(f.data);
    });
  },
);
