// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import type { InsightResult, rpcContract } from "../contract";
import type { Check } from "../core/checks";
import type { PrInsight } from "../core/overview";
import { forgetInsights } from "./pr-availability";

type ReadMethods = Pick<typeof rpcContract, "getInsight">;
const app = await loadPluginApp(() => import("../app"));
const tab = app.threadPanelActions.find((action) => action.id === "pr")!;

const insight: PrInsight = {
  pr: {
    number: 25707,
    title: "fix(libs-bound-shared): reset lifecycle chart total",
    state: "open",
    url: "https://github.com/o/r/pull/25707",
    headOid: "a",
    headRefName: "kvg/fix-total",
    headOwner: null,
    baseRefName: "main",
    author: "koenvg",
    additions: 42,
    deletions: 7,
    changedFiles: 3,
  },
  mergeAction: { kind: "none" },
  autoMergeAction: { kind: "none" },
  canUpdateBranch: false,
  blockers: [],
  checks: [],
  reviewers: [],
  mergeQueue: null,
};

function check(name: string, status: Check["status"], required = false): Check {
  return { name, status, url: null, required, failure: null };
}

function renderTab(data: PrInsight) {
  const result: InsightResult = { kind: "ok", insight: data, refreshedAt: Date.now(), error: null };
  const panel = renderSlot<PluginThreadPanelProps, ReadMethods>(
    tab,
    { threadId: "thr_layout", params: null },
    { rpc: { getInsight: async () => result } },
  );
  return within(panel.container);
}

afterEach(() => {
  cleanup();
  forgetInsights();
});

describe("PR header", () => {
  it("shows the number, state, branches, diff size, author, and title", async () => {
    const view = renderTab(insight);

    expect(
      await view.findByText("fix(libs-bound-shared): reset lifecycle chart total"),
    ).toBeTruthy();
    for (const text of [
      "#25707",
      "Open",
      "kvg/fix-total → main",
      "+42",
      "-7",
      "3 files",
      "koenvg",
    ]) {
      expect(view.getByText(text)).toBeTruthy();
    }
  });

  it("names the fork owner of the head branch", async () => {
    const view = renderTab({
      ...insight,
      pr: { ...insight.pr, headRefName: "fix", headOwner: "alice" },
    });

    expect(await view.findByText("alice:fix → main")).toBeTruthy();
  });

  it("says file for one changed file", async () => {
    const view = renderTab({ ...insight, pr: { ...insight.pr, changedFiles: 1 } });

    expect(await view.findByText("1 file")).toBeTruthy();
  });
});

describe("PR summary line", () => {
  function summaryOf(view: ReturnType<typeof renderTab>) {
    return view.getByRole("status", { name: "Merge status" }).textContent;
  }

  it("shows the only blocker", async () => {
    const view = renderTab({
      ...insight,
      blockers: [{ code: "review_required", text: "Review required" }],
    });
    await view.findByText("#25707");

    expect(summaryOf(view)).toBe("Review required");
    expect(view.queryByRole("region", { name: "Merge blockers" })).toBeNull();
  });

  it("shows the first blocker and how many more", async () => {
    const view = renderTab({
      ...insight,
      blockers: [
        { code: "conflicts", text: "Merge conflicts" },
        { code: "checks_failed", text: "1 check failed" },
        { code: "review_required", text: "Review required" },
      ],
    });
    await view.findByText("#25707");

    expect(summaryOf(view)).toBe("Merge conflicts+2 more");
    const list = view.getByRole("region", { name: "Merge blockers" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  });

  it("shows a ready PR", async () => {
    const view = renderTab({ ...insight, mergeAction: { kind: "merge", method: "SQUASH" } });
    await view.findByText("#25707");

    expect(summaryOf(view)).toBe("Ready to merge");
  });

  it("shows no summary line for a merged PR", async () => {
    const view = renderTab({ ...insight, pr: { ...insight.pr, state: "merged" } });
    await view.findByText("#25707");

    expect(view.queryByRole("status", { name: "Merge status" })).toBeNull();
  });
});

describe("PR checks", () => {
  it("labels required checks", async () => {
    const view = renderTab({
      ...insight,
      checks: [check("build", "failed", true), check("lint-docs", "failed")],
    });

    const build = (await view.findByText("build")).closest("li")!;
    const lint = view.getByText("lint-docs").closest("li")!;
    expect(within(build).getByText("required")).toBeTruthy();
    expect(within(lint).queryByText("required")).toBeNull();
  });

  it("puts passed and skipped checks in one collapsed line", async () => {
    const view = renderTab({
      ...insight,
      checks: [check("unit", "passed"), check("e2e", "passed"), check("docs", "skipped")],
    });

    const line = await view.findByText("2 passed, 1 skipped");
    const group = line.closest("details")!;
    expect(group.open).toBe(false);

    fireEvent.click(line);

    expect(group.open).toBe(true);
    for (const name of ["unit", "e2e", "docs"]) {
      expect(within(group).getByText(name)).toBeTruthy();
    }
  });

  it("shows a failed check open above the collapsed passed line", async () => {
    const view = renderTab({
      ...insight,
      checks: [check("unit", "passed"), check("build", "failed")],
    });

    const failed = await view.findByText("build");
    const passed = view.getByText("1 passed");
    expect(failed.closest("details")).toBeNull();
    expect(failed.compareDocumentPosition(passed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
