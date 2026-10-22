import { afterEach, expect, it, vi } from "vitest";
import { parseViewState, VIEW_EXTENSION_KIND } from "../subagents-contract.js";
import { FULL_PERMISSION_OPTIONS, startFakePiBridge } from "./test-support.js";

afterEach(() => vi.unstubAllEnvs());

it("keeps a live thread's final viewer result after other threads fill the presentation cache", async () => {
  vi.stubEnv("FAKE_PI_SUBAGENT_PROTOCOL", "1");
  vi.stubEnv("FAKE_PI_VERSION", "1.0.0");
  const harness = await startFakePiBridge({ prefix: "bb-pi-view-cache-", initialize: true });
  let requestId = 2000;
  try {
    const threadId = "thr_cache_original";
    const first = await harness.startThread(threadId);
    const providerThreadId = (first.result as { providerThreadId: string }).providerThreadId;
    for (let index = 0; index < 64; index++) {
      const otherId = `thr_cache_other_${index}`;
      const other = await harness.startThread(otherId);
      await harness.request(++requestId, "thread/stop", {
        threadId: otherId,
        providerThreadId: (other.result as { providerThreadId: string }).providerThreadId,
        intent: "release",
        activeTurnId: null,
      });
    }
    const since = harness.deltasOf(threadId).length;
    await harness.request(++requestId, "turn/start", {
      threadId,
      providerThreadId,
      clientRequestId: "creq_ab23456789",
      input: [{ type: "text", text: "/observe-background", mentions: [] }],
      options: FULL_PERMISSION_OPTIONS,
    });
    await harness.waitForTurnBoundary(threadId, since);
    const nativeComplete = (delta: Record<string, unknown>) => {
      const item = delta.item as { type?: string; status?: string } | undefined;
      return (
        delta.kind === "item.close" &&
        item?.type === "backgroundTask" &&
        item.status === "completed"
      );
    };
    await harness.waitForDelta(threadId, nativeComplete, since);
    const finalCapture = (delta: Record<string, unknown>) =>
      delta.kind === "extension.state" &&
      delta.extensionKind === VIEW_EXTENSION_KIND &&
      parseViewState(delta.payload)?.rows.some(
        (row) =>
          row.runId === "owned-run-1" &&
          row.state === "complete" &&
          row.capture?.finalOutput === "Owned final answer",
      ) === true;
    await harness.waitForDelta(threadId, finalCapture, since);
    const deltas = harness.deltasOf(threadId).slice(since);
    expect(deltas.some(nativeComplete)).toBe(true);
    expect(deltas.some(finalCapture)).toBe(true);
    const state = parseViewState(deltas.filter(finalCapture).at(-1)?.payload);
    expect(state?.rows.find((row) => row.runId === "owned-run-1")).toMatchObject({
      state: "complete",
      capture: { status: "captured", finalOutput: "Owned final answer" },
    });
  } finally {
    await harness.teardown();
  }
}, 180_000);
