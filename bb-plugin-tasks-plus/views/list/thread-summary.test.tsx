// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { COMPACT_VIEWPORT_QUERY } from "@/components/ui/hooks/use-compact-viewport";
import { ThreadSummary, threadBuckets } from "./thread-summary.js";
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
      text: "All threads archived",
      unknown: false,
    },
  ] as const)(
    "keeps verified archive counts honest for $executions and $archives",
    async ({ executions, archives, text, unknown }) => {
      const status = meta([...executions]);
      status.threads.forEach((thread, index) => {
        thread.archive = archives[index]!;
      });
      const slot = renderSlot(
        { component: ThreadSummary },
        { taskKey: "ABC-1", meta: status },
      );
      const control = slot.getByRole("button", { name: /Threads for ABC-1/ });
      if (text) expect(control.textContent).toContain(text);
      if (text !== "All threads archived")
        expect(control.textContent).not.toContain("All threads archived");
      expect(control.textContent!.includes("Archive unavailable")).toBe(
        unknown,
      );
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
    const slot = renderSlot(
      { component: ThreadSummary },
      { taskKey: "ABC-1", meta: status },
    );
    const control = slot.getByRole("button", {
      name: "Threads for ABC-1: 1 Failed, 1 Idle, All threads archived",
    });
    expect(control.textContent).toContain("1 Failed");
    expect(control.textContent).toContain("All threads archived");
    fireEvent.click(control);
    const dialog = await slot.findByRole("dialog", {
      name: "Threads for ABC-1",
    });
    expect(dialog.textContent).toContain("Failed");
    expect(slot.getAllByText("Archived")).toHaveLength(2);
    expect(slot.getAllByRole("link")).toHaveLength(2);
  });

  it("distinguishes loading, unavailable and confirmed no attachments", () => {
    const slot = renderSlot(
      { component: ThreadSummary },
      { taskKey: "ABC-1", meta: undefined },
    );
    expect(slot.getByText("Threads loading").getAttribute("aria-busy")).toBe(
      "true",
    );
    slot.lifecycle.rerender(
      <ThreadSummary
        taskKey="ABC-1"
        meta={{ ...meta([]), availability: "unavailable" }}
      />,
    );
    expect(slot.getByText("Threads unavailable")).toBeTruthy();
    slot.lifecycle.rerender(<ThreadSummary taskKey="ABC-1" meta={meta([])} />);
    expect(slot.queryByText(/Threads/)).toBeNull();
  });

  it("keeps failures and item-level uncertainty textual, counts overflow and retains all identities", async () => {
    const status = meta([
      "working",
      "failed",
      "working",
      "unavailable",
      "starting",
      "idle",
    ]);
    expect(threadBuckets(status.threads).map((b) => b.text)).toEqual([
      "1 Failed",
      "1 Unavailable",
      "1 Starting",
      "2 Working",
      "1 Idle",
    ]);
    const slot = renderSlot(
      { component: ThreadSummary },
      { taskKey: "ABC-1", meta: status },
    );
    const control = slot.getByRole("button", {
      name: "Threads for ABC-1: 1 Failed, 1 Unavailable, 1 Starting, 2 Working, 1 Idle",
    });
    expect(control.textContent).toContain("1 Failed");
    expect(control.textContent).toContain("1 Unavailable");
    expect(control.textContent).toContain("+4 more");
    fireEvent.click(control);
    expect(await slot.findAllByRole("link")).toHaveLength(6);
    expect(slot.getByText("Unavailable")).toBeTruthy();
    expect(slot.getByText("thr_5")).toBeTruthy();
  });

  it("supports compact pointer drill-down, Escape and focus return without task navigation", async () => {
    compact = true;
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
    control.focus();
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
    fireEvent.click(
      await slot.findByRole("link", { name: "Open thread Worker 0, thr_0" }),
    );
    expect(slot.inspection.navigateCalls).toEqual([
      { method: "toThread", threadId: "thr_0" },
    ]);
  });

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
