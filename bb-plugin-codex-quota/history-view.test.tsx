// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryReadinessPanel } from "./history-view.js";
import { QuotaDashboard } from "./quota-view.js";
import type { HistoryReadiness, HistoryRequest } from "./history-contract.js";
const missing: HistoryReadiness = { state: "not-configured", reason: "not-configured", storage: "unconfigured", collector: "missing", writer: "unconfirmed" };
afterEach(cleanup);

describe("visible history readiness independent from quota", () => {
  it("shows no selection without a history request or setup side effect", () => {
    const read = vi.fn(); render(<HistoryReadinessPanel selection={{ hostId: null, generation: 0 }} read={read} />);
    expect(screen.getByText(/Select a host to check history readiness/)).toBeTruthy(); expect(read).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /install|import/i })).toBeNull();
  });
  it("shows a fixed unavailable state but leaves quota, refresh, countdown and official link usable", async () => {
    const refresh = vi.fn(); const now = Date.UTC(2026, 9, 3, 12);
    render(<QuotaDashboard selectedHostId="host_a" hosts={[{ id: "host_a", name: "A", status: "connected" }]}
      view={{ state: "fresh", reason: "ok", snapshot: { observedAt: new Date(now).toISOString(), plan: null, bankedResets: null,
        general: [{ id: "primary_window", name: "Primary", remainingPercent: 42, resetAt: new Date(now + 3_600_000).toISOString() }],
        additional: [], bindingWindowId: "primary_window", bindingRemainingPercent: 42 } }}
      now={now} onRefresh={refresh} onHostChange={() => {}}
      history={<HistoryReadinessPanel selection={{ hostId: "host_a", generation: 1 }} read={async () => ({ ...missing, state: "unavailable", reason: "storage-unavailable", storage: "unavailable" })} />} />);
    expect(await screen.findByText(/History storage is unavailable/)).toBeTruthy();
    expect(screen.getByText("42% remaining")).toBeTruthy(); expect(screen.getAllByText(/1 hour.*left/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Open Codex Usage/ }).getAttribute("href")).toBe("https://chatgpt.com/codex/settings/usage");
    fireEvent.click(screen.getByRole("button", { name: /^Refresh$/ })); expect(refresh).toHaveBeenCalledOnce();
  });
  it("clears previous-host display immediately and excludes late results even when switching back", async () => {
    let complete!: (value: HistoryReadiness) => void;
    const pending = new Promise<HistoryReadiness>((resolve) => { complete = resolve; });
    const read = vi.fn((input: HistoryRequest) => input.generation === 1 ? pending : Promise.resolve(missing));
    const view = render(<HistoryReadinessPanel selection={{ hostId: "host_a", generation: 1 }} read={read} />);
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
    view.rerender(<HistoryReadinessPanel selection={{ hostId: "host_b", generation: 2 }} read={read} />);
    await screen.findByText(/Collector: missing/);
    view.rerender(<HistoryReadinessPanel selection={{ hostId: "host_a", generation: 3 }} read={read} />);
    await act(async () => { complete({ ...missing, reason: "collector-incompatible", state: "unavailable", collector: "incompatible" }); });
    expect(screen.queryByText(/Collector is incompatible/)).toBeNull();
    expect(screen.getByText(/Collector: missing/)).toBeTruthy();
  });
  it("does not request quota or create a polling timer when checking readiness", async () => {
    const intervals = vi.spyOn(globalThis, "setInterval"); const read = vi.fn(async () => missing);
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<HistoryReadinessPanel selection={{ hostId: "host_a", generation: 1 }} read={read} />); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Check readiness" })); });
    expect(read).toHaveBeenCalledTimes(2); expect(intervals).not.toHaveBeenCalled();
    view.unmount(); intervals.mockRestore();
  });
  it.each(["healthy", "maintenance", "recovered"] as const)("shows bounded %s storage status and unavailable expired classes", async (state) => {
    const read=vi.fn(async()=>({state:"available",reason:"ok",storage:"compatible",collector:"compatible-v1",writer:"unconfirmed",health:{state,detailFrom:"2026-08-17T12:00:00.000Z",compactFrom:"2026-06-22T00:00:00.000Z",pending:state==="maintenance",legacyLogsPending:true,recoveryGaps:state==="recovered"?[{start:"2026-06-22T00:00:00.000Z",end:"2026-10-01T12:00:00.000Z"}]:[]}}));
    render(<HistoryReadinessPanel selection={{hostId:"host_a",generation:1}} read={read}/>);
    const summary=await screen.findByText("Storage health and retention");expect(summary.closest("details")?.open).toBe(false);fireEvent.click(summary);
    expect(screen.getByText(new RegExp(`Storage health: ${state}`))).toBeTruthy();expect(screen.getByText(/Older token classes are unavailable, not zero/)).toBeTruthy();
    expect(screen.getByText(/Legacy retirement: required/)).toBeTruthy();
    expect(screen.getByText(/Quiet files, repair and one new event are not stop proof/)).toBeTruthy();
    if(state==="recovered")expect(screen.getByText(/Recovery gap:/)).toBeTruthy();
    if(state==="maintenance")expect(screen.getByText(/Bounded retention or backfill work remains/)).toBeTruthy();
    expect(read).toHaveBeenCalledOnce();
  });
});
