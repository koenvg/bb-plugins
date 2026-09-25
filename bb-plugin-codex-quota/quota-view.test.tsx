// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuotaDashboard, QuotaBadge } from "./quota-view.js";
import { visibleView } from "./freshness.js";
import type { QuotaStatus } from "./contract.js";

const observedAt = Date.UTC(2026, 3, 23, 12);
const snapshot = (remainingPercent: number) => ({
  observedAt: new Date(observedAt).toISOString(), plan: "plus" as const, bankedResets: 0,
  general: [{ id: "primary_window", name: "5 hours", remainingPercent, resetAt: new Date(observedAt + 3600000).toISOString() }],
  additional: [{ name: "Code review", windows: [{ id: "primary_window", name: "Primary", remainingPercent: 75, resetAt: null }] }],
  bindingWindowId: "primary_window", bindingRemainingPercent: remainingPercent,
});
const fresh = (remainingPercent: number): QuotaStatus => ({ state: "fresh", reason: "ok", snapshot: snapshot(remainingPercent) });
const absent: QuotaStatus = { state: "unavailable", reason: "no-selection", snapshot: null };
const hosts = [{ id: "host_1", name: "My Mac", status: "connected" as const }];
const props = { hosts, selectedHostId: "host_1", onHostChange: vi.fn(), onRefresh: vi.fn(), now: observedAt };

afterEach(cleanup);
describe("Codex quota UI", () => {
  it("keeps the official link and host selector reachable without account data", () => {
    const onHostChange = vi.fn();
    const { container } = render(<QuotaDashboard {...props} selectedHostId={null} view={absent} onHostChange={onHostChange} />);
    expect(screen.getByText(/Select a host to view/i)).toBeTruthy();
    expect(screen.getByText("Unknown")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Open Codex Usage/i });
    expect(link.getAttribute("href")).toBe("https://chatgpt.com/codex/settings/usage");
    fireEvent.change(screen.getByRole("combobox", { name: /Codex host/i }), { target: { value: "host_1" } });
    expect(onHostChange).toHaveBeenCalledWith("host_1");
    expect(container.textContent).not.toMatch(/redeem|tokens remaining|cost/i);
  });
  it("holds one calm layout through first load, a result, and a failure", () => {
    const page = render(<QuotaDashboard {...props} view={absent} selectedHostId={null} ready={false} />);
    const summary = page.getByRole("region", { name: "Codex allowance summary" });
    expect(summary.textContent).toContain("—");
    expect(page.container.textContent).not.toMatch(/Quota unavailable|No general window data|Banked resets.*Unknown/s);
    expect(page.getByRole("link", { name: /Codex Usage/i })).toBeTruthy();
    page.rerender(<QuotaDashboard {...props} view={fresh(25)} ready />);
    expect(page.getByRole("region", { name: "Codex allowance summary" })).toBe(summary);
    expect(page.getByText("25% remaining")).toBeTruthy();
    expect(page.container.querySelectorAll(".bg-card")).toHaveLength(0);
    const extra = page.getByText("Other limits").closest("details");
    expect(extra?.open).toBe(false);
    fireEvent.click(page.getByText("Other limits"));
    expect(extra?.open).toBe(true);
    page.rerender(<QuotaDashboard {...props} view={{ state: "unavailable", reason: "host-offline", snapshot: null }} ready />);
    expect(page.getByRole("region", { name: "Codex allowance summary" })).toBe(summary);
    expect(page.getByText(/host is offline/i)).toBeTruthy();
    expect(summary.querySelector("h2")?.textContent).toBe("—");
  });

  it("renders 0% and 100% remaining, windows and reset labels without treating unknown as zero", () => {
    const { rerender } = render(<QuotaDashboard {...props} view={fresh(0)} />);
    expect(screen.getByText("0% remaining")).toBeTruthy();
    expect(screen.getByText("5 hours window")).toBeTruthy();
    expect(screen.getByText(/Resets.*23 April/i)).toBeTruthy();
    expect(screen.getByText("Code review")).toBeTruthy();
    expect(screen.getByText("0 available")).toBeTruthy();
    rerender(<QuotaDashboard {...props} view={fresh(100)} />);
    expect(screen.getByText("100% remaining")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/^Updated /);
    expect(screen.getByRole("status").textContent).not.toMatch(/Fresh observation|· fresh/i);
    expect(screen.getByText(/Reset unknown/i)).toBeTruthy();
  });

  it("shows unavailable authentication and a labelled stale percentage without a fresh badge", () => {
    const auth: QuotaStatus = { state: "unavailable", reason: "auth-required", snapshot: null };
    const { rerender } = render(<QuotaDashboard {...props} view={auth} />);
    expect(screen.getByText(/Pi Codex sign-in required/i)).toBeTruthy();
    const stale = visibleView(fresh(25), observedAt + 300_000);
    rerender(<QuotaDashboard {...props} view={stale} now={observedAt + 300_000} />);
    expect(screen.getByRole("status").textContent).toMatch(/^Stale · updated /);
    expect(screen.getByText("25% remaining")).toBeTruthy();
    const badge = render(<QuotaBadge view={stale} hostName="My Mac" now={observedAt + 300_000} />);
    expect(badge.container.textContent).toMatch(/Stale/i);
    expect(badge.getByLabelText(/My Mac.*5 hours.*stale/i)).toBeTruthy();
    badge.rerender(<QuotaBadge view={visibleView(fresh(25), observedAt + 86_400_000)} hostName="My Mac" now={observedAt + 86_400_000} />);
    expect(badge.container.textContent).not.toMatch(/25%/);
  });
  it("shows no spinner or fresh badge while a read is in progress", () => {
    const page = render(<QuotaDashboard {...props} view={fresh(25)} loading />);
    expect(page.getByRole("status").textContent).toMatch(/^Updating · last checked /);
    expect(page.container.textContent).not.toMatch(/Checking quota|Fresh observation/);
    expect(page.container.querySelector('[role="progressbar"], .animate-spin')).toBeNull();
    const badge = render(<QuotaBadge view={fresh(25)} hostName="My Mac" now={observedAt} loading />);
    page.rerender(<QuotaDashboard {...props} view={visibleView(fresh(25), observedAt + 300_000)} now={observedAt + 300_000} loading />);
    expect(page.getByRole("status").className).not.toContain("text-destructive");
    expect(badge.container.textContent).toBe("—");
    expect(within(badge.container).getByLabelText(/My Mac.*updating/i)).toBeTruthy();
    badge.rerender(<QuotaBadge view={visibleView(fresh(25), observedAt + 300_000)} hostName="My Mac" now={observedAt + 300_000} loading />);
    expect(badge.container.textContent).toBe("—");
    badge.rerender(<QuotaBadge view={fresh(25)} hostName="My Mac" now={observedAt} />);
    expect(badge.container.textContent).toBe("25%");
  });
  it("labels a tied binding window and hides percentages for offline or unselected hosts", () => {
    const tied: QuotaStatus = { state: "fresh", reason: "ok", snapshot: { ...snapshot(30), general: [
      { id: "primary_window", name: "Primary", remainingPercent: 30, resetAt: null },
      { id: "secondary_window", name: "Secondary", remainingPercent: 30, resetAt: null },
    ], bindingWindowId: "primary_window", bindingRemainingPercent: 30 } };
    const badge = render(<QuotaBadge view={tied} hostName="My Mac" now={observedAt} />);
    expect(within(badge.container).getByLabelText(/My Mac.*Primary.*fresh.*observed/i)).toBeTruthy();
    badge.rerender(<QuotaBadge view={{ state: "unavailable", reason: "host-offline", snapshot: null }} hostName="My Mac" now={observedAt} />);
    expect(badge.container.textContent).not.toMatch(/30%/);
    expect(within(badge.container).getByLabelText(/My Mac.*unavailable.*no observation/i)).toBeTruthy();
    badge.rerender(<QuotaBadge view={absent} hostName={null} now={observedAt} />);
    expect(within(badge.container).getByLabelText(/No selected host.*unavailable/i)).toBeTruthy();
  });
});
