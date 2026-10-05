// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeHostResponse } from "@get-bb/plugin-sdk/testing";
import { normalizeActivity } from "./activity.js";

const app = await loadPluginApp(() => import("./app.js"));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const missing = {
  state: "not-configured",
  reason: "not-configured",
  storage: "unconfigured",
  collector: "missing",
  writer: "unconfirmed",
};
const compatible = {
  state: "available",
  reason: "ok",
  storage: "compatible",
  collector: "compatible-v1",
  writer: "unconfirmed",
};
const oldHistory = {
  ...missing,
  state: "unavailable",
  reason: "collector-incompatible",
  collector: "incompatible",
};

function fixture() {
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  let selected = { hostId: "host_a", generation: 1 };
  const selections: ReturnType<typeof deferred<typeof selected>>[] = [];
  const historyInputs: unknown[] = [];
  const activityInputs: unknown[] = [];
  let quotaReads = 0;
  const history = deferred<unknown>();
  const activity = deferred<unknown>();
  const quota = deferred<unknown>();
  const activityView = (tokens: number) => ({
    state: "fresh",
    reason: "ok",
    snapshot: normalizeActivity(
      {
        stats: {
          lifetime_tokens: tokens,
          daily_usage_buckets: [{ date: "2026-04-20", tokens: 7 }],
        },
      },
      now,
    )!,
  });
  const options = {
    sdk: {
      hosts: {
        list: async () => [
          makeHostResponse({ id: "host_a", name: "Host A" }),
          makeHostResponse({ id: "host_b", name: "Host B" }),
        ],
      },
    },
    rpc: {
      selection: async () => selected,
      selectHost: async () => {
        const next = deferred<typeof selected>();
        selections.push(next);
        const value = await next.promise;
        selected = value;
        return value;
      },
      read: async () =>
        ++quotaReads === 1
          ? {
              state: "fresh",
              reason: "ok",
              snapshot: {
                observedAt: new Date(now).toISOString(),
                plan: null,
                bankedResets: null,
                additional: [],
                general: [
                  {
                    id: "primary_window",
                    name: "Primary",
                    remainingPercent: 42,
                    resetAt: new Date(now + 7_800_000).toISOString(),
                  },
                ],
                bindingWindowId: "primary_window",
                bindingRemainingPercent: 42,
              },
            }
          : quota.promise,
      historyReadiness: async (input: unknown) => {
        historyInputs.push(input);
        return historyInputs.length === 1
          ? missing
          : historyInputs.length === 2
            ? history.promise
            : compatible;
      },
      activity: async (input: unknown) => {
        activityInputs.push(input);
        return activityInputs.length === 1
          ? activityView(10101)
          : activityInputs.length === 2
            ? activity.promise
            : activityView(30303);
      },
    },
  };
  const owner = renderSlot(
    app.appOverlays.find((slot) => slot.id === "quota-refresh")!,
    {},
    options,
  );
  const page = renderSlot(app.settingsSections[0]!, {}, options);
  const queries = within(page.container);
  const openActivity = async () => {
    await act(async () => {
      const details = queries.getByText("Account details and activity").closest("details")!;
      details.open = true;
      fireEvent(details, new Event("toggle"));
    });
  };
  return {
    queries,
    selections,
    historyInputs,
    activityInputs,
    history,
    activity,
    quota,
    activityView,
    openActivity,
    advance: () => {
      now += 30_001;
    },
    quotaReads: () => quotaReads,
    dispose: () => {
      page.lifecycle.unmount();
      owner.lifecycle.unmount();
    },
  };
}

describe("integrated selection transitions in the public quota slot", () => {
  it.each([
    { switchBack: false, late: false },
    { switchBack: true, late: false },
    { switchBack: false, late: true },
    { switchBack: true, late: true },
  ])(
    "clears both panels at switch start, switch back=$switchBack late output=$late",
    async ({ switchBack, late }) => {
      const f = fixture();
      const q = f.queries;
      await q.findByText("History not configured on this host.");
      await q.findByText("42% remaining");
      expect(f.activityInputs).toHaveLength(0);
      await f.openActivity();
      await q.findByText("10,101");
      f.advance();
      fireEvent.click(q.getByRole("button", { name: "Refresh activity" }));
      fireEvent.click(q.getByRole("button", { name: "Check readiness" }));
      await waitFor(() => {
        expect(f.activityInputs).toHaveLength(2);
        expect(f.historyInputs).toHaveLength(2);
      });
      expect(q.getByText("10,101")).toBeTruthy();
      fireEvent.change(q.getByRole("combobox", { name: "Codex host" }), {
        target: { value: "host_b" },
      });
      await waitFor(() => expect(f.selections).toHaveLength(1));
      expect(q.queryByText("10,101")).toBeNull();
      expect(q.getByText("Changing selected host. History readiness is pending.")).toBeTruthy();
      expect(q.getByRole("status", { name: "Account activity status" }).textContent).toContain(
        "Changing selected host",
      );
      const resolveOld = async () => {
        await act(async () => {
          f.history.resolve(oldHistory);
          f.activity.resolve(f.activityView(20202));
        });
      };
      if (!late) await resolveOld();
      fireEvent.click(q.getByRole("button", { name: "Check readiness" }));
      fireEvent.click(q.getByRole("button", { name: "Refresh activity" }));
      fireEvent(window, new Event("focus"));
      expect(
        (q.getByRole("button", { name: "Check readiness" }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(
        (q.getByRole("button", { name: "Refresh activity" }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(f.historyInputs).toHaveLength(2);
      expect(f.activityInputs).toHaveLength(2);
      expect(f.quotaReads()).toBe(1);
      expect(q.queryByText("20,202")).toBeNull();
      expect(q.queryByText(/Collector is incompatible/)).toBeNull();
      if (switchBack) {
        fireEvent.change(q.getByRole("combobox", { name: "Codex host" }), {
          target: { value: "host_a" },
        });
        await waitFor(() => expect(f.selections).toHaveLength(2));
        // Superseded server selection did not commit. The final selection is the same host/generation.
        await act(async () => f.selections[0]!.resolve({ hostId: "host_a", generation: 1 }));
        expect(f.historyInputs).toHaveLength(2);
        expect(f.activityInputs).toHaveLength(2);
        expect(q.getByText("Changing selected host. History readiness is pending.")).toBeTruthy();
        await act(async () => f.selections[1]!.resolve({ hostId: "host_a", generation: 1 }));
      } else await act(async () => f.selections[0]!.resolve({ hostId: "host_b", generation: 2 }));
      await q.findByText(
        "History storage and collector asset are compatible. Writer activation is not confirmed.",
      );
      await q.findByText("30,303");
      if (late) await resolveOld();
      expect(q.queryByText("10,101")).toBeNull();
      expect(q.queryByText("20,202")).toBeNull();
      expect(q.queryByText(/Collector is incompatible/)).toBeNull();
      const selected = { hostId: switchBack ? "host_a" : "host_b", generation: switchBack ? 1 : 2 };
      expect(f.historyInputs[2]).toEqual(selected);
      expect(f.activityInputs[2]).toEqual({ ...selected, refresh: false });
      expect(f.historyInputs).toHaveLength(3);
      expect(f.activityInputs).toHaveLength(3);
      expect(f.quotaReads()).toBe(2);
      expect(q.getByLabelText("Allowance pending")).toBeTruthy();
      expect(
        (q.getByRole("button", { name: "Check readiness" }) as HTMLButtonElement).disabled,
      ).toBe(false);
      expect(
        (q.getByRole("button", { name: "Refresh activity" }) as HTMLButtonElement).disabled,
      ).toBe(false);
      expect(q.getByRole("link", { name: /Open Codex Usage/ })).toBeTruthy();
      await act(async () =>
        f.quota.resolve({ state: "unavailable", reason: "auth-required", snapshot: null }),
      );
      f.dispose();
    },
  );
  it("does not read activity opened during a pending selection", async () => {
    const f = fixture();
    const q = f.queries;
    await q.findByText("History not configured on this host.");
    await q.findByRole("option", { name: "Host B" });
    fireEvent.change(q.getByRole("combobox", { name: "Codex host" }), {
      target: { value: "host_b" },
    });
    await waitFor(() => expect(f.selections).toHaveLength(1));
    await f.openActivity();
    expect(q.getByRole("status", { name: "Account activity status" }).textContent).toContain(
      "Changing selected host",
    );
    expect(f.activityInputs).toHaveLength(0);
    expect(f.historyInputs).toHaveLength(1);
    await act(async () => f.selections[0]!.resolve({ hostId: "host_b", generation: 2 }));
    await q.findByText("10,101");
    expect(f.activityInputs).toEqual([{ hostId: "host_b", generation: 2, refresh: false }]);
    expect(f.historyInputs).toHaveLength(2);
    await act(async () => f.history.resolve(compatible));
    await q.findByText(
      "History storage and collector asset are compatible. Writer activation is not confirmed.",
    );
    expect(q.getByLabelText("Allowance pending")).toBeTruthy();
    await act(async () =>
      f.quota.resolve({ state: "unavailable", reason: "auth-required", snapshot: null }),
    );
    f.dispose();
  });
  it("does not dispatch a queued activity read after a same-turn host switch starts", async () => {
    const f = fixture();
    const q = f.queries;
    await q.findByText("History not configured on this host.");
    await q.findByRole("option", { name: "Host B" });
    act(() => {
      const details = q.getByText("Account details and activity").closest("details")!;
      details.open = true;
      fireEvent(details, new Event("toggle"));
    });
    expect(f.activityInputs).toHaveLength(0);
    fireEvent.change(q.getByRole("combobox", { name: "Codex host" }), {
      target: { value: "host_b" },
    });
    await act(async () => {});
    expect(q.getByRole("status", { name: "Account activity status" }).textContent).toContain(
      "Changing selected host",
    );
    expect(f.activityInputs).toHaveLength(0);
    expect(f.historyInputs).toHaveLength(1);
    expect(f.selections).toHaveLength(1);
    await act(async () => f.selections[0]!.resolve({ hostId: "host_b", generation: 2 }));
    await q.findByText("10,101");
    expect(f.activityInputs).toEqual([{ hostId: "host_b", generation: 2, refresh: false }]);
    await act(async () => {
      f.history.resolve(compatible);
      f.quota.resolve({ state: "unavailable", reason: "auth-required", snapshot: null });
    });
    f.dispose();
  });
});
