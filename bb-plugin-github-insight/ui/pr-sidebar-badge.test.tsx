// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { ReviewQueueResult, rpcContract } from "../contract";
import {
  ok,
  panelRpc,
  queuePr,
  reviewThread,
  view,
  type QueueHandler,
} from "../test/review-queue-fixtures";

const app = await loadPluginApp(() => import("../app"));
const panel = app.navPanels.find((registration) => registration.id === "pull-requests")!;
function Badge() {
  const badge = panel.experimental_useBadge?.();
  return <output data-testid="badge">{JSON.stringify(badge)}</output>;
}
afterEach(cleanup);

describe("Pull Requests sidebar badge", () => {
  function renderBadge(getReviewQueue: QueueHandler) {
    return renderSlot<object, typeof rpcContract>(
      { component: Badge },
      {},
      { rpc: panelRpc(getReviewQueue) },
    );
  }
  const returnedThread = { ...reviewThread, status: "idle", returned: "finished" } as const;

  it("shows nothing while loading and when nothing waits", async () => {
    let result: ReviewQueueResult = { kind: "loading" };
    const slot = renderBadge(() => result);
    await vi.waitFor(() => expect(slot.inspection.rpcCalls).toHaveLength(1));
    expect(slot.getByTestId("badge").textContent).toBe("null");
    result = ok(view([]));
    await slot.behavior.emitRealtime("review-queue.updated", result);
    expect(slot.getByTestId("badge").textContent).toBe("null");
  });

  it("shows the neutral needs-review count", async () => {
    const slot = renderBadge(() =>
      ok(view([queuePr(), queuePr({ number: 16 }), queuePr({ review: "reviewed" })])),
    );
    await vi.waitFor(() =>
      expect(JSON.parse(slot.getByTestId("badge").textContent!)).toEqual({
        text: "2",
        tone: "neutral",
        label: "2 pull requests need review",
      }),
    );
  });

  it("marks the count when a PR is unseen", async () => {
    const slot = renderBadge(() => ok({ ...view([queuePr()]), hasUnseen: true }));
    await vi.waitFor(() =>
      expect(JSON.parse(slot.getByTestId("badge").textContent!)).toEqual({
        text: "1",
        tone: "warning",
        label: "1 pull requests need review. New pull requests",
      }),
    );
  });

  it("requests a warning dot when a review agent came back without a count", async () => {
    const slot = renderBadge(() =>
      ok({ ...view([queuePr({ review: "reviewed", thread: returnedThread })]), hasReturned: true }),
    );
    await vi.waitFor(() =>
      expect(JSON.parse(slot.getByTestId("badge").textContent!)).toEqual({
        tone: "warning",
        label: "Review agent came back",
      }),
    );
  });

  it("follows queue updates and keeps the last good state on errors", async () => {
    const slot = renderBadge(() => ok(view([queuePr()])));
    await vi.waitFor(() =>
      expect(JSON.parse(slot.getByTestId("badge").textContent!)).toEqual({
        text: "1",
        tone: "neutral",
        label: "1 pull requests need review",
      }),
    );
    const next = ok({ ...view([queuePr(), queuePr({ number: 16 })]), hasUnseen: true });
    await slot.behavior.emitRealtime("review-queue.updated", next);
    const expected = {
      text: "2",
      tone: "warning",
      label: "2 pull requests need review. New pull requests",
    };
    expect(JSON.parse(slot.getByTestId("badge").textContent!)).toEqual(expected);
    await slot.behavior.emitRealtime("review-queue.updated", {
      kind: "error",
      message: "gh not logged in",
      lastGood: next,
    });
    expect(JSON.parse(slot.getByTestId("badge").textContent!)).toEqual(expected);
  });
});
