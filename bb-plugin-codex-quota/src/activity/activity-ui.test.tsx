// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { within } from "@testing-library/react";
import { dashboardFixture } from "../machines/app.test-support.js";
import { AccountActivity, ActivityPanel } from "./activity-view.js";
import { normalizeActivity } from "./activity.js";
const snapshot = () =>
  normalizeActivity(
    { stats: { lifetime_tokens: 42, daily_usage_buckets: [{ date: "2026-04-20", tokens: 5 }] } },
    Date.now(),
  )!;
const fresh = () => ({ state: "fresh" as const, reason: "ok" as const, snapshot: snapshot() });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function toggle(container: HTMLElement, open: boolean) {
  await act(async () => {
    const details = Array.from(container.querySelectorAll("details")).find(
      (item) => item.querySelector("summary")?.textContent === "Account details and activity",
    )!;
    details.open = open;
    fireEvent(details, new Event("toggle"));
  });
}
describe("account activity disclosure and presentation", () => {
  it("renders each unknown separately, scopes every table, and expires numbers without a request", () => {
    const view = fresh();
    const refresh = vi.fn();
    const page = render(<ActivityPanel view={view} now={Date.now()} onRefresh={refresh} />);
    expect(page.getAllByText("Unknown")).toHaveLength(4);
    expect(page.getByText(/not selected-host Pi usage/)).toBeTruthy();
    expect(page.getByText(/do not fill local gaps or set prices/)).toBeTruthy();
    const table = page.getByRole("region", { name: "Account-wide daily token table" });
    expect(table.tabIndex).toBe(0);
    expect(page.getByRole("columnheader", { name: "Tokens" })).toBeTruthy();
    fireEvent.change(page.getByRole("combobox"), { target: { value: "weekly" } });
    expect(page.getByRole("region", { name: "Account-wide weekly token table" })).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
    page.rerender(
      <ActivityPanel
        view={view}
        now={Date.parse(view.snapshot.observedAt) + 86_400_000}
        onRefresh={refresh}
      />,
    );
    expect(page.queryByText("42")).toBeNull();
    expect(page.getByRole("status").textContent).toContain("expired");
  });
  it("does not request while collapsed, coalesces/manual-throttles, and disposes its timer/listeners on close", async () => {
    const set = vi.spyOn(globalThis, "setInterval");
    const clear = vi.spyOn(globalThis, "clearInterval");
    const remove = vi.spyOn(window, "removeEventListener");
    const read = vi.fn(async () => fresh());
    const page = render(<AccountActivity selection={{ hostId: "a", generation: 1 }} read={read} />);
    expect(page.container.querySelector("details")!.open).toBe(false);
    expect(read).not.toHaveBeenCalled();
    await toggle(page.container, true);
    await waitFor(() => expect(page.getByText("42")).toBeTruthy());
    expect(read).toHaveBeenCalledTimes(1);
    fireEvent.click(page.getByRole("button", { name: "Refresh activity" }));
    fireEvent(window, new Event("focus"));
    expect(read).toHaveBeenCalledTimes(1);
    const id = set.mock.results[0]!.value;
    await toggle(page.container, false);
    expect(clear).toHaveBeenCalledWith(id);
    expect(remove).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(page.queryByText("42")).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("hides stale identity on host changes and ignores delayed output after disposal", async () => {
    let resolve!: (result: ReturnType<typeof fresh>) => void;
    const read = vi.fn(
      (_input: unknown, _signal: AbortSignal) =>
        new Promise<ReturnType<typeof fresh>>((done) => {
          resolve = done;
        }),
    );
    const page = render(<AccountActivity selection={{ hostId: "a", generation: 1 }} read={read} />);
    await toggle(page.container, true);
    expect(read).toHaveBeenCalledTimes(1);
    const first = resolve;
    page.rerender(<AccountActivity selection={{ hostId: "b", generation: 2 }} read={read} />);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await act(async () => first(fresh()));
    expect(page.queryByText("42")).toBeNull();
    expect(read.mock.calls[0]![1].aborted).toBe(true);
    page.unmount();
    await act(async () => resolve(fresh()));
    expect(read.mock.calls[1]![1].aborted).toBe(true);
  });
  it("stops scheduling while hidden and rechecks on visibility resume", async () => {
    let visible = true;
    const clear = vi.spyOn(globalThis, "clearInterval");
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() =>
      visible ? "visible" : "hidden",
    );
    const read = vi.fn(async () => fresh());
    const page = render(<AccountActivity selection={{ hostId: "a", generation: 1 }} read={read} />);
    await toggle(page.container, true);
    await waitFor(() => expect(page.getByText("42")).toBeTruthy());
    await act(async () => {
      visible = false;
      fireEvent(document, new Event("visibilitychange"));
    });
    expect(clear).toHaveBeenCalled();
    expect(page.queryByText("42")).toBeNull();
    await act(async () => {
      visible = true;
      fireEvent(document, new Event("visibilitychange"));
    });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  });
  it("keeps allowance and the official link visible through account activity failure", async () => {
    const f = await dashboardFixture();
    let reads = 0;
    f.machineAccounts.mockImplementation(async (input) => {
      if ((input as { includeActivity: boolean }).includeActivity) reads++;
      return f.data;
    });
    const page = f.settings(),
      q = within(page.container);
    await q.findByText("63%");
    fireEvent.click(q.getAllByRole("button", { name: "Refresh account activity" })[0]!);
    await waitFor(() => expect(reads).toBe(1));
    expect(q.getByText("63%")).toBeTruthy();
    expect(q.getByRole("link", { name: "Open Codex Usage" }).getAttribute("href")).toBe(
      "https://chatgpt.com/codex/settings/usage",
    );
    expect(f.collectorControl).not.toHaveBeenCalled();
  });
  it.each(["settled", "pending"] as const)(
    "stops activity requests when settings unmount with a %s read",
    async (mode) => {
      const f = await dashboardFixture();
      let reads = 0,
        finish!: (value: unknown) => void;
      f.machineAccounts.mockImplementation(async (input) => {
        if (!(input as { includeActivity: boolean }).includeActivity) return f.data;
        reads++;
        return mode === "pending"
          ? new Promise((done) => {
              finish = done;
            })
          : f.data;
      });
      const settings = f.settings(),
        q = within(settings.container);
      await q.findByText("Account allowance");
      fireEvent.click(q.getAllByRole("button", { name: "Refresh account activity" })[0]!);
      await waitFor(() => expect(reads).toBe(1));
      settings.lifecycle.unmount();
      if (mode === "pending")
        await act(async () => {
          finish(f.data);
        });
      const reopened = f.settings();
      await within(reopened.container).findByText("Account allowance");
      expect(reads).toBe(1);
      reopened.lifecycle.unmount();
    },
  );
});
