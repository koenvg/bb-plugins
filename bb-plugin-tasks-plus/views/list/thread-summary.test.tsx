// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { COMPACT_VIEWPORT_QUERY } from "@/components/ui/hooks/use-compact-viewport";
import { ThreadSummary, ThreadActivitySummary, threadBuckets } from "./thread-summary.js";
import type { TaskWorkStatus, ThreadExecution } from "../../shared/contract.js";

// Archive assertions use the same summary seam in the popover and compact drawer.
let compact = false;
beforeEach(() => {
  compact = false;
  window.matchMedia = (query: string) => ({
    matches: compact && query === COMPACT_VIEWPORT_QUERY,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
});
afterEach(cleanup);
function meta(executions: ThreadExecution[]): TaskWorkStatus {
  return {
    availability: "available",
    observedAt: "2026-10-02T00:00:00.000Z",
    pullRequests: {
      availability: "available",
      items: [],
      unavailableThreadIds: [],
    },
    threads: executions.map((execution, index) => ({
      threadId: `thr_${index}`,
      title: `Worker ${index}`,
      presetName: "Default",
      execution,
      archive: "unarchived",
    })),
  };
}

describe("thread summary states and compact interactions", () => {
  it.each([
    {
      executions: ["idle", "idle"],
      archives: ["archived", "unarchived"],
      text: "1 archived",
      unknown: false,
    },
    {
      executions: ["failed", "unavailable"],
      archives: ["archived", "unknown"],
      text: "1 archived",
      unknown: true,
    },
    {
      executions: ["idle", "idle"],
      archives: ["archived", "unknown"],
      text: "1 archived",
      unknown: true,
    },
    {
      executions: ["removed", "removed"],
      archives: ["unknown", "unknown"],
      text: null,
      unknown: false,
    },
    {
      executions: ["idle", "removed"],
      archives: ["archived", "unknown"],
      text: "All archived",
      unknown: false,
    },
  ] as const)(
    "keeps verified archive counts honest for $executions and $archives",
    async ({ executions, archives, text, unknown }) => {
      const status = meta([...executions]);
      status.threads.forEach((thread, index) => {
        thread.archive = archives[index]!;
      });
      const slot = renderSlot({ component: ThreadSummary }, { taskKey: "ABC-1", meta: status });
      const control = slot.getByRole("button", { name: /Threads for ABC-1/ });
      if (text) expect(control.textContent).toContain(text);
      if (text !== "All archived") expect(control.textContent).not.toContain("All archived");
      expect(control.textContent!.includes("Archive unavailable")).toBe(unknown);
      fireEvent.click(control);
      await slot.findByRole("dialog");
      expect(slot.queryAllByRole("link")).toHaveLength(
        executions.filter((execution) => execution !== "removed").length,
      );
      if (executions.every((execution) => execution === "removed")) {
        expect(control.textContent).toContain("2 Removed");
        expect(slot.queryByText("Archived")).toBeNull();
        expect(slot.getAllByText("Removed")).toHaveLength(2);
      }
    },
  );

  it("shows all archived alongside failure and identifies archive state in drill-down", async () => {
    const status = meta(["failed", "idle"]);
    status.threads.forEach((thread) => {
      thread.archive = "archived";
    });
    const slot = renderSlot({ component: ThreadSummary }, { taskKey: "ABC-1", meta: status });
    const control = slot.getByRole("button", {
      name: "Threads for ABC-1: 1 Failed, 1 Idle, All threads archived",
    });
    expect(control.textContent).toContain("1 Failed");
    expect(control.textContent).toContain("All archived");
    fireEvent.click(control);
    const dialog = await slot.findByRole("dialog", {
      name: "Threads for ABC-1",
    });
    expect(dialog.textContent).toContain("Failed");
    expect(slot.getAllByText("Archived")).toHaveLength(2);
    expect(slot.getAllByRole("link")).toHaveLength(2);
  });

  it("distinguishes loading, unavailable and confirmed no attachments", () => {
    const slot = renderSlot({ component: ThreadSummary }, { taskKey: "ABC-1", meta: undefined });
    expect(slot.getByText("Threads loading").getAttribute("aria-busy")).toBe("true");
    slot.lifecycle.rerender(
      <ThreadSummary taskKey="ABC-1" meta={{ ...meta([]), availability: "unavailable" }} />,
    );
    expect(slot.getByText("Threads unavailable")).toBeTruthy();
    slot.lifecycle.rerender(<ThreadSummary taskKey="ABC-1" meta={meta([])} />);
    expect(slot.queryByText(/Threads/)).toBeNull();
  });

  it("keeps failures and item-level uncertainty textual, counts overflow and retains all identities", async () => {
    const status = meta(["working", "failed", "working", "unavailable", "starting", "idle"]);
    expect(threadBuckets(status.threads).map((b) => b.text)).toEqual([
      "1 Failed",
      "1 Unavailable",
      "1 Starting",
      "2 Running",
      "1 Idle",
    ]);
    const slot = renderSlot({ component: ThreadSummary }, { taskKey: "ABC-1", meta: status });
    const control = slot.getByRole("button", {
      name: "Threads for ABC-1: 1 Failed, 1 Unavailable, 1 Starting, 2 Running, 1 Idle",
    });
    expect(control.textContent).toContain("1 Failed");
    expect(control.textContent).toContain("1 Unavailable");
    expect(control.textContent).toContain("+4 more");
    fireEvent.click(control);
    expect(await slot.findAllByRole("link")).toHaveLength(6);
    expect(slot.getByText("Unavailable")).toBeTruthy();
    expect(slot.getByText("thr_5")).toBeTruthy();
  });

  it.each([false, true])(
    "supports pointer drill-down, Escape and focus return without task navigation, compact=%s",
    async (isCompact) => {
      compact = isCompact;
      const slot = renderSlot(
        { component: ThreadSummary },
        {
          taskKey: "ABC-1",
          meta: {
            ...meta(["failed", "working"]),
            threads: meta(["failed", "working"]).threads.map((thread) => ({
              ...thread,
              archive: "archived" as const,
            })),
          },
        },
      );
      const control = slot.getByRole("button", { name: /Threads for ABC-1/ });
      fireEvent.click(control);
      const drawer = await slot.findByRole("dialog", {
        name: "Threads for ABC-1",
      });
      const link = await slot.findByRole("link", {
        name: "Open thread Worker 1, thr_1",
      });
      link.focus();
      expect(document.activeElement).toBe(link);
      fireEvent.keyDown(drawer, { key: "Escape" });
      await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(control));
      fireEvent.click(control);
      fireEvent.click(await slot.findByRole("link", { name: "Open thread Worker 0, thr_0" }));
      expect(slot.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "thr_0" }]);
    },
  );

  it("leaves Enter and Space activation to the summary instead of the row-open shortcut", () => {
    const slot = renderSlot(
      { component: ThreadSummary },
      { taskKey: "ABC-1", meta: meta(["working"]) },
    );
    const control = slot.getByRole("button", { name: /Threads for ABC-1/ });
    const keys: string[] = [];
    const listener = (event: KeyboardEvent) => keys.push(event.key);
    window.addEventListener("keydown", listener);
    fireEvent.keyDown(control, { key: "Enter" });
    fireEvent.keyDown(control, { key: " " });
    window.removeEventListener("keydown", listener);
    expect(keys).toEqual([]);
    expect(slot.inspection.navigateCalls).toEqual([]);
  });
});

describe("agent activity presentation", () => {
  it("changes a running badge to quiet idle, without changing task or archive state", () => {
    const running = meta(["working"]);
    running.threads[0]!.archive = "archived";
    const slot = renderSlot({ component: ThreadSummary }, { taskKey: "ABC-1", meta: running });
    const button = slot.getByRole("button", { name: /1 Running, All threads archived/ });
    expect(button.getAttribute("data-agent-state")).toBe("running");
    expect(button.querySelector(".task-agent-bars")).toBeTruthy();
    expect(button.textContent).toContain("All archived");
    slot.lifecycle.rerender(<ThreadSummary taskKey="ABC-1" meta={meta(["idle"])} />);
    expect(button.getAttribute("data-agent-state")).toBe("idle");
    expect(button.querySelector(".task-agent-bars")).toBeNull();
    expect(button.querySelector(".task-agent-idle-dot")).toBeTruthy();
    expect(button.getAttribute("data-motion-paused")).toBeNull();
  });

  it.each(["failed", "starting", "unavailable", "removed"] as const)(
    "does not animate %s as running or label it idle",
    (execution) => {
      const slot = renderSlot(
        { component: ThreadSummary },
        { taskKey: "ABC-1", meta: meta([execution]) },
      );
      const button = slot.getByRole("button", { name: /Threads for ABC-1/ });
      expect(button.getAttribute("data-agent-state")).toBeNull();
      expect(button.querySelector(".task-agent-bars")).toBeNull();
    },
  );

  it("does not animate an unavailable observation even if it retains a working thread", () => {
    const slot = renderSlot(
      { component: ThreadSummary },
      { taskKey: "ABC-1", meta: { ...meta(["working"]), availability: "unavailable" } },
    );
    expect(slot.getByRole("button").getAttribute("data-agent-state")).toBeNull();
  });

  it("pauses offscreen and hidden activity, and removes the observers on idle and unmount", () => {
    const disconnect = vi.fn();
    let observe: IntersectionObserverCallback | undefined;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          observe = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const slot = renderSlot(
      { component: ThreadSummary },
      { taskKey: "ABC-1", meta: meta(["working"]) },
    );
    const button = slot.getByRole("button");
    const intersect = (isIntersecting: boolean) =>
      observe!([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
    try {
      intersect(false);
      expect(button.dataset.motionPaused).toBe("true");
      intersect(true);
      expect(button.dataset.motionPaused).toBe("false");
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      fireEvent(document, new Event("visibilitychange"));
      expect(button.dataset.motionPaused).toBe("true");
      slot.lifecycle.rerender(<ThreadSummary taskKey="ABC-1" meta={meta(["idle"])} />);
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(button.dataset.motionPaused).toBeUndefined();
      slot.lifecycle.rerender(<ThreadSummary taskKey="ABC-1" meta={meta(["working"])} />);
      slot.lifecycle.unmount();
      expect(disconnect).toHaveBeenCalledTimes(2);
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it("counts shared agents once and keeps failed, starting and unavailable states visible", () => {
    const status = meta(["working", "idle", "failed", "starting", "unavailable", "removed"]);
    const slot = renderSlot({ component: ThreadActivitySummary }, { statuses: [status, status] });
    const summary = slot.getByLabelText("Agent activity for listed tasks");
    for (const text of ["1 running", "1 idle", "1 failed", "1 starting", "1 unavailable"]) {
      expect(summary.textContent).toContain(text);
    }
    expect(summary.textContent).not.toContain("2 running");
    expect(summary.textContent).not.toContain("removed");
    slot.lifecycle.rerender(<ThreadActivitySummary statuses={[undefined]} />);
    expect(slot.getByText("Agent activity loading")).toBeTruthy();
    slot.lifecycle.rerender(
      <ThreadActivitySummary statuses={[{ ...meta(["working"]), availability: "unavailable" }]} />,
    );
    expect(slot.getByLabelText("Agent activity for listed tasks").textContent).toBe(
      "1 unavailable · Agent inventory incomplete",
    );
  });
  it.each([false, true])(
    "prefers current shared-agent data in either row order, reverse=%s",
    (reverse) => {
      const current = meta(["working"]);
      const retained = { ...meta(["idle"]), availability: "unavailable" as const };
      const statuses = reverse ? [retained, current] : [current, retained];
      const slot = renderSlot({ component: ThreadActivitySummary }, { statuses });
      expect(slot.getByLabelText("Agent activity for listed tasks").textContent).toBe(
        "1 running · Agent inventory incomplete",
      );
    },
  );

  it.each([false, true])(
    "uses the latest available observation regardless of order, reverse=%s",
    (reverse) => {
      const old = meta(["working"]);
      const current = { ...meta(["idle"]), observedAt: "2026-10-02T00:00:01.000Z" };
      const statuses = reverse ? [current, old] : [old, current];
      const slot = renderSlot({ component: ThreadActivitySummary }, { statuses });
      expect(slot.getByLabelText("Agent activity for listed tasks").textContent).toBe("1 idle");
    },
  );

  it.each([false, true])(
    "resolves equal-time conflicts with state priority, reverse=%s",
    (reverse) => {
      const running = meta(["working"]);
      const failed = meta(["failed"]);
      const statuses = reverse ? [failed, running] : [running, failed];
      const slot = renderSlot({ component: ThreadActivitySummary }, { statuses });
      expect(slot.getByLabelText("Agent activity for listed tasks").textContent).toBe("1 failed");
    },
  );

  it.each([false, true])("keeps same-time removal from becoming idle, reverse=%s", (reverse) => {
    const idle = meta(["idle"]);
    const removed = meta(["removed"]);
    const statuses = reverse ? [removed, idle] : [idle, removed];
    const slot = renderSlot({ component: ThreadActivitySummary }, { statuses });
    expect(slot.queryByLabelText("Agent activity for listed tasks")).toBeNull();
  });

  it("shows unknown inventory without inventing an agent count", () => {
    const unknown = { ...meta([]), availability: "unavailable" as const };
    const slot = renderSlot({ component: ThreadActivitySummary }, { statuses: [unknown] });
    expect(slot.getByLabelText("Agent activity for listed tasks").textContent).toBe(
      "Agent inventory unavailable",
    );
    slot.lifecycle.rerender(<ThreadActivitySummary statuses={[meta(["working"]), unknown]} />);
    expect(slot.getByLabelText("Agent activity for listed tasks").textContent).toBe(
      "1 running · Agent inventory incomplete",
    );
    slot.lifecycle.rerender(<ThreadActivitySummary statuses={[undefined, unknown]} />);
    expect(slot.getByLabelText("Agent activity for listed tasks").textContent).toBe(
      "Agent activity loading · Agent inventory unavailable",
    );
    slot.lifecycle.rerender(<ThreadActivitySummary statuses={[meta([])]} />);
    expect(slot.queryByLabelText("Agent activity for listed tasks")).toBeNull();
  });
});
