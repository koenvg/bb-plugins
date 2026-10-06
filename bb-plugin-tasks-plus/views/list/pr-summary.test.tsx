// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { COMPACT_VIEWPORT_QUERY } from "@/components/ui/hooks/use-compact-viewport";
import { TaskRow } from "./row.js";
import type { TaskWorkStatus } from "../../shared/contract.js";
import { makeTask } from "../../test-fixtures.js";

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
const thread = (id: string) => ({
  threadId: id,
  title: `Worker ${id}`,
  presetName: "Worker",
  execution: "failed" as const,
  archive: "archived" as const,
});
const pr = (
  state: "open" | "draft" | "merged" | "closed" | "unknown",
  repo = "bb",
  threadIds = ["thr_a"],
) => ({
  url: `https://github.com/acme/${repo}/pull/42`,
  number: 42,
  title: `Work on ${repo}`,
  state,
  updatedAt: "2026-10-02T00:00:00Z",
  threadIds,
  details: "unavailable" as const,
});
function meta(
  items: TaskWorkStatus["pullRequests"]["items"],
  unavailableThreadIds: string[] = [],
): TaskWorkStatus {
  return {
    availability: "available",
    observedAt: "2026-10-02T00:00:00Z",
    threads: [thread("thr_a"), thread("thr_b")],
    pullRequests: {
      availability: unavailableThreadIds.length ? "partial" : "available",
      items,
      unavailableThreadIds,
    },
  };
}
function row(status: TaskWorkStatus | undefined) {
  const onOpen = vi.fn();
  const slot = renderSlot(
    { component: TaskRow },
    {
      task: makeTask({ key: "ABC-1", title: "Work", status: "in_review" }),
      meta: status,
      project: undefined,
      showProject: false,
      projectLabels: [],
      onEdit: vi.fn(),
      onOpen,
      pending: false,
      openMenu: null,
      onOpenMenuChange: vi.fn(),
    },
  );
  return { slot, onOpen };
}

it("shows a direct accessible GitHub link for one shared PR and all associated threads in details without opening the task", async () => {
  const { slot, onOpen } = row(meta([pr("open", "bb", ["thr_a", "thr_b"])]));
  const link = slot.getByRole("link", {
    name: "Open GitHub PR acme/bb #42, Open",
  });
  expect(link.getAttribute("href")).toBe("https://github.com/acme/bb/pull/42");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.textContent).toContain("PR #42 · Open");
  expect(slot.queryByText(/Ready/)).toBeNull();
  const trigger = slot.getByRole("button", { name: /PR details for ABC-1/ });
  fireEvent.click(trigger);
  const dialog = await slot.findByRole("dialog", { name: "PRs for ABC-1" });
  expect(dialog.textContent).toContain("Details unavailable");
  expect(dialog.textContent).toContain("Work on bb");
  expect(slot.getByRole("link", { name: /Open thread Worker thr_a/ })).toBeTruthy();
  fireEvent.click(slot.getByRole("link", { name: /Open thread Worker thr_b/ }));
  expect(slot.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "thr_b" }]);
  expect(onOpen).not.toHaveBeenCalled();
});

it("bounds multiple lifecycle buckets but keeps open, draft and incomplete work visible ahead of merged outcomes", async () => {
  const { slot, onOpen } = row(
    meta(
      [pr("merged", "merged"), pr("closed", "closed"), pr("open"), pr("draft", "other")],
      ["thr_b"],
    ),
  );
  const trigger = slot.getByRole("button", { name: /PRs for ABC-1: 4 PRs/ });
  expect(trigger.textContent).toContain("1 Open");
  expect(trigger.textContent).toContain("1 Draft");
  expect(trigger.textContent).toContain("+2 more");
  expect(trigger.textContent).toContain("Details incomplete");
  fireEvent.click(trigger);
  const dialog = await slot.findByRole("dialog", { name: "PRs for ABC-1" });
  for (const repo of ["bb", "other", "merged", "closed"])
    expect(
      slot.getByRole("link", {
        name: new RegExp(`Open GitHub PR acme/${repo} #42`),
      }),
    ).toBeTruthy();
  for (const label of ["Open", "Draft", "Merged", "Closed"])
    expect(dialog.textContent).toContain(label);
  expect(dialog.textContent).toContain("PR lookup unavailable");
  expect(dialog.textContent).toContain("thr_b");
  expect(onOpen).not.toHaveBeenCalled();
});

it("keeps lookup counts in the PR menu and accessible name, not the row suffix", async () => {
  const { slot } = row(meta([pr("merged")], ["thr_a", "thr_b"]));
  const trigger = slot.getByRole("button", {
    name: /PR details for ABC-1:.*2 lookups unavailable/,
  });
  expect(trigger.textContent).toContain("Details incomplete");
  expect(trigger.textContent).not.toContain("2 lookups unavailable");
  expect(slot.getByRole("link", { name: /Open GitHub PR.*Merged/ })).toBeTruthy();
  fireEvent.click(trigger);
  const dialog = await slot.findByRole("dialog", { name: "PRs for ABC-1" });
  expect(dialog.textContent).toContain("2 lookups unavailable");
  expect(dialog.textContent).toContain("Details unavailable");
});

it.each([false, true])(
  "supports pointer/touch drill-down, Escape and focus return in compact=%s",
  async (isCompact) => {
    compact = isCompact;
    const { slot, onOpen } = row(meta([pr("open"), pr("draft", "other")]));
    const trigger = slot.getByRole("button", { name: /PRs for ABC-1:/ });
    const keys: string[] = [];
    const listener = (e: KeyboardEvent) => keys.push(e.key);
    window.addEventListener("keydown", listener);
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.keyDown(trigger, { key: " " });
    window.removeEventListener("keydown", listener);
    expect(keys).toEqual([]);
    fireEvent.click(trigger);
    const dialog = await slot.findByRole("dialog", { name: "PRs for ABC-1" });
    (await slot.findByRole("link", { name: /Open GitHub PR acme\/other #42/ })).focus();
    expect(document.activeElement?.getAttribute("href")).toContain("/other/pull/42");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(slot.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(slot.getByRole("button", { name: "Open ABC-1: Work" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  },
);

it("distinguishes initial PR loading, authoritative absence, lookup unavailable, partial merged and unknown lifecycle", async () => {
  const initial = row(undefined);
  expect(initial.slot.getByText("PRs loading").getAttribute("aria-busy")).toBe("true");
  initial.slot.lifecycle.unmount();
  const absent = row(meta([]));
  expect(absent.slot.queryByText(/PR/)).toBeNull();
  absent.slot.lifecycle.unmount();
  const unavailable = row({
    ...meta([]),
    pullRequests: {
      availability: "unavailable",
      items: [],
      unavailableThreadIds: ["thr_a", "thr_b"],
    },
  });
  expect(
    unavailable.slot.getByRole("button", {
      name: /PRs for ABC-1: PRs unavailable/,
    }),
  ).toBeTruthy();
  unavailable.slot.lifecycle.unmount();
  const partial = row(meta([pr("merged")], ["thr_b"]));
  expect(partial.slot.getByRole("link", { name: /Open GitHub PR.*Merged/ })).toBeTruthy();
  expect(
    partial.slot.getByRole("button", { name: /PR details.*lookup unavailable/ }).textContent,
  ).toContain("Details incomplete");
  partial.slot.lifecycle.unmount();
  const unknown = row(meta([pr("unknown"), pr("merged", "other")]));
  expect(unknown.slot.getByRole("button", { name: /PRs for ABC-1/ }).textContent).toContain(
    "1 Lifecycle unavailable",
  );
});

function richPr(
  state: "open" | "draft" | "merged" | "closed" = "open",
  repo = "bb",
  details: "available" | "incomplete" | "stale" | "unavailable" = "available",
) {
  return {
    ...pr(state, repo, ["thr_a", "thr_b"]),
    details,
    rich: {
      refreshedAt: new Date().toISOString(),
      checks: {
        failed: 2,
        running: 1,
        cancelled: 1,
        passed: 3,
        skipped: 1,
        failedNames: ["unit", "lint"],
      },
      reviewers: {
        pending: 1,
        approved: 1,
        changesRequested: 1,
        pendingNames: ["koen"],
      },
      conditions: [
        "checks_failed",
        "checks_running",
        "review_required",
        "changes_requested",
        "conflicts",
        "future_rule",
      ],
    },
  };
}

it.each([false, true])(
  "shows fresh simultaneous checks/review conditions, counts, observation time and associations in compact=%s without task navigation",
  async (isCompact) => {
    compact = isCompact;
    const { slot, onOpen } = row(meta([richPr()]));
    expect(slot.getByRole("link", { name: /Open GitHub PR.*Open/ }).textContent).toContain(
      "Conflicts",
    );
    fireEvent.click(slot.getByRole("button", { name: /PR details for ABC-1/ }));
    const dialog = await slot.findByRole("dialog", { name: "PRs for ABC-1" });
    await waitFor(() => {
      for (const text of [
        "Checks failing",
        "Checks running",
        "Awaiting review",
        "Changes requested",
        "2 failed",
        "1 running",
        "1 pending",
        "1 approved",
        "unit",
        "koen",
        "Observed",
        "conflicts",
        "future_rule",
        "thr_a",
        "thr_b",
      ])
        expect(dialog.textContent).toContain(text);
    });
    expect(slot.queryByText(/Ready to merge/)).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  },
);

it("counts one primary bucket per distinct PR, keeps Draft and failures beside merged outcomes, and exposes rich incompleteness separately", async () => {
  const awaiting = richPr("open", "review");
  awaiting.rich.checks.failed = 0;
  awaiting.rich.reviewers.changesRequested = 0;
  awaiting.rich.checks.running = 0;
  awaiting.rich.conditions = ["review_required"];
  const { slot } = row(
    meta(
      [
        richPr("draft"),
        awaiting,
        richPr("merged", "merged"),
        { ...pr("open", "missing"), details: "unavailable" },
      ],
      ["thr_missing"],
    ),
  );
  const trigger = slot.getByRole("button", { name: /PRs for ABC-1: 4 PRs/ });
  expect(trigger.textContent).toContain("1 Draft, conflicts");
  expect(trigger.textContent).toContain("1 Awaiting review");
  expect(trigger.textContent).toContain("+2 more");
  expect(trigger.getAttribute("aria-label")).toContain("1 details unavailable");
  expect(trigger.getAttribute("aria-label")).toContain("1 lookup unavailable");
  expect(trigger.textContent).toContain("Details incomplete");
  fireEvent.click(trigger);
  const dialog = await slot.findByRole("dialog", { name: "PRs for ABC-1" });
  expect(dialog.textContent).toContain("Merged");
  expect(dialog.textContent).toContain("Draft");
});

it.each(["stale", "unavailable"] as const)(
  "never turns retained %s counts into current actionable claims",
  async (details) => {
    const { slot } = row(meta([richPr("open", "bb", details)]));
    const link = slot.getByRole("link", { name: /Open GitHub PR.*Open/ });
    expect(link.textContent).not.toContain("Checks failing");
    const trigger = slot.getByRole("button", { name: /PR details for ABC-1/ });
    expect(trigger.textContent).toContain(
      details === "stale" ? "Details stale" : "Details unavailable",
    );
    fireEvent.click(trigger);
    const dialog = await slot.findByRole("dialog", { name: "PRs for ABC-1" });
    expect(dialog.textContent).toContain("Last reported");
    expect(dialog.textContent).toContain("not current");
  },
);

it.each([false, true])(
  "keeps the highest problem textual with Ready/Merged/unknown overflow and queue secondary evidence in compact=%s",
  async (isCompact) => {
    compact = isCompact;
    const ready = richPr("open", "ready");
    ready.rich.conditions = [];
    Object.assign(ready.rich, { readiness: "ready" });
    Object.assign(ready.rich.checks, {
      failed: 0,
      running: 0,
      cancelled: 0,
      failedNames: [],
    });
    Object.assign(ready.rich.reviewers, {
      pending: 0,
      changesRequested: 0,
      pendingNames: [],
    });
    const blocked = richPr("open", "conflict");
    blocked.rich.conditions = [
      "conflicts",
      "checks_failed",
      "changes_requested",
      "blocked",
      "queue_failed",
      "checks_running",
      "review_required",
      "unresolved_threads",
      "behind",
    ];
    Object.assign(blocked.rich, {
      queue: {
        state: "failed",
        position: 2,
        reported: '{"position":2,"state":"failed","rule":"unknown"}',
      },
      mergeObservations: ["unresolvedThreads: 2"],
    });
    const { slot, onOpen } = row(
      meta([ready, richPr("merged", "merged"), blocked, pr("unknown", "unknown")], ["thr_missing"]),
    );
    const trigger = slot.getByRole("button", { name: /PRs for ABC-1: 4 PRs/ });
    expect(trigger.textContent).toContain("1 Conflicts");
    expect(trigger.textContent).toContain("1 Ready to merge");
    expect(trigger.textContent).toContain("+2 more");
    expect(trigger.getAttribute("aria-label")).toContain("1 details unavailable");
    expect(trigger.textContent).toContain("Details incomplete");
    expect(trigger.getAttribute("aria-label")).toContain("1 Merged");
    fireEvent.click(trigger);
    const dialog = await slot.findByRole("dialog", { name: "PRs for ABC-1" });
    await waitFor(() => {
      for (const text of [
        "Conflicts",
        "Other merge blockers",
        "Queue failed",
        "Unresolved comments",
        "Behind",
        "unresolvedThreads: 2",
        '"rule":"unknown"',
      ])
        expect(dialog.textContent).toContain(text);
    });
    expect(onOpen).not.toHaveBeenCalled();
  },
);

it.each(["failed", "running", "cancelled", "review", "queue", "missing_counts"])(
  "does not trust a retained readiness hint over contradictory %s normalized evidence",
  (contradiction) => {
    const candidate = richPr();
    candidate.rich.conditions = [];
    Object.assign(candidate.rich, { readiness: "ready" });
    Object.assign(candidate.rich.checks, {
      failed: 0,
      running: 0,
      cancelled: 0,
      failedNames: [],
    });
    Object.assign(candidate.rich.reviewers, {
      pending: 0,
      changesRequested: 0,
      pendingNames: [],
    });
    if (["failed", "running", "cancelled"].includes(contradiction))
      Object.assign(candidate.rich.checks, { [contradiction]: 1 });
    if (contradiction === "review") candidate.rich.reviewers.pending = 1;
    if (contradiction === "queue")
      Object.assign(candidate.rich, {
        queue: { state: "queued", position: 1, reported: "queued" },
      });
    if (contradiction === "missing_counts")
      Object.assign(candidate.rich.checks, { failed: undefined });
    const { slot } = row(meta([candidate]));
    expect(slot.getByRole("link", { name: /Open GitHub PR/ }).textContent).not.toContain(
      "Ready to merge",
    );
  },
);
