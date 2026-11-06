// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { ReviewQueueResult, rpcContract } from "../contract";
import { ok, panelRpc, queuePr, view, type QueueHandler } from "../test/review-queue-fixtures";

const app = await loadPluginApp(() => import("../app"));
const panel = app.navPanels.find((registration) => registration.id === "pull-requests")!;
function Badge() {
  const badge = panel.experimental_useBadge!();
  return badge ? (
    <output
      aria-label={badge.label}
      data-tone={badge.tone}
      data-count={badge.count}
      data-text={badge.text}
    >
      {badge.count ?? badge.text}
    </output>
  ) : null;
}

afterEach(cleanup);

describe("Pull Requests host navigation badge", () => {
  function renderBadge(getReviewQueue: QueueHandler) {
    return renderSlot<object, typeof rpcContract>(
      { component: Badge },
      {},
      { rpc: panelRpc(getReviewQueue) },
    );
  }

  it("shows nothing while loading and when nothing waits", async () => {
    let result: ReviewQueueResult = { kind: "loading" };
    const slot = renderBadge(() => result);
    await vi.waitFor(() => expect(slot.inspection.rpcCalls).toHaveLength(1));
    expect(slot.container.textContent).toBe("");
    result = ok(view([]));
    await slot.behavior.emitRealtime("review-queue.updated", result);
    expect(slot.queryByRole("status")).toBeNull();
  });

  it("provides the neutral needs-review count", async () => {
    const slot = renderBadge(() =>
      ok(view([queuePr(), queuePr({ number: 16 }), queuePr({ review: "reviewed" })])),
    );
    const count = await slot.findByLabelText("2 pull requests need review");
    expect(count.textContent).toBe("2");
    expect(count.getAttribute("data-tone")).toBe("neutral");
    expect(count.getAttribute("data-count")).toBe("2");
    expect(count.getAttribute("data-text")).toBeNull();
  });

  it("marks unseen PRs for the host and accessible label", async () => {
    const slot = renderBadge(() => ok({ ...view([queuePr()]), hasUnseen: true }));
    const count = await slot.findByLabelText("1 pull request needs review, new");
    expect(count.textContent).toBe("1");
    expect(count.getAttribute("data-tone")).toBe("warning");
  });

  it("provides a labeled dot when a review agent came back without a count", async () => {
    const slot = renderBadge(() => ok({ ...view([]), hasReturned: true }));
    const dot = await slot.findByLabelText("Review agent came back");
    expect(dot.textContent).toBe("");
    expect(dot.getAttribute("data-tone")).toBe("warning");
  });

  it("retains both the count and returned-agent information", async () => {
    const slot = renderBadge(() => ok({ ...view([queuePr()]), hasReturned: true }));
    expect(
      (await slot.findByLabelText("1 pull request needs review, Review agent came back"))
        .textContent,
    ).toBe("1");
  });

  it("preserves the truncated count", async () => {
    const slot = renderBadge(() => ok(view([queuePr()], true)));
    expect((await slot.findByLabelText("50+ pull requests need review")).textContent).toBe("50+");
  });

  it("follows updates and keeps the last good state on errors", async () => {
    const slot = renderBadge(() => ok(view([queuePr()])));
    expect((await slot.findByLabelText("1 pull request needs review")).textContent).toBe("1");
    const next = ok({ ...view([queuePr(), queuePr({ number: 16 })]), hasUnseen: true });
    await slot.behavior.emitRealtime("review-queue.updated", next);
    expect(slot.getByLabelText("2 pull requests need review, new").textContent).toBe("2");
    await slot.behavior.emitRealtime("review-queue.updated", {
      kind: "error",
      message: "gh not logged in",
      lastGood: next,
    });
    expect(slot.getByLabelText("2 pull requests need review, new").textContent).toBe("2");
    await slot.behavior.emitRealtime("review-queue.updated", ok(view([])));
    expect(slot.queryByRole("status")).toBeNull();
  });
});
