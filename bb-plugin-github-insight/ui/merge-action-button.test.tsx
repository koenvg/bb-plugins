// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, within } from "@testing-library/react";
import { installTestPluginRuntime, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { ComponentProps } from "react";
import type { ActionResult, rpcContract } from "../contract";
import type { RunnableMergeAction } from "../core/merge-action";

installTestPluginRuntime();
const { MergeActionButton } = await import("./merge-action-button");

afterEach(cleanup);

const pr = {
  number: 7,
  title: "Add palette commands",
  state: "open",
  url: "https://github.com/o/r/pull/7",
  headOid: "abc123",
} as const;

type Props = ComponentProps<typeof MergeActionButton>;

function renderButton(
  action: RunnableMergeAction,
  props: Partial<Props> = {},
  runMergeAction: () => ActionResult | Promise<ActionResult> = () => ({ kind: "ok" }),
) {
  return renderSlot<Props, typeof rpcContract>(
    { component: MergeActionButton },
    { threadId: "thr_1", pr, action, ...props },
    { rpc: { runMergeAction } as never },
  );
}

function mergeCalls(slot: ReturnType<typeof renderButton>) {
  return slot.inspection.rpcCalls.filter((call) => call.method === "runMergeAction");
}

describe("MergeActionButton request", () => {
  it("opens the confirm dialog for a merge and sends nothing", async () => {
    const handled = vi.fn();
    const slot = renderButton(
      { kind: "merge", method: "SQUASH" },
      { request: { onHandled: handled } },
    );

    const dialog = await slot.findByRole("alertdialog");
    expect(within(dialog).getByText("Merge pull request #7?")).toBeTruthy();
    expect(handled).toHaveBeenCalledTimes(1);
    expect(mergeCalls(slot)).toEqual([]);
  });

  it("sends one enqueue without a dialog", async () => {
    const slot = renderButton({ kind: "enqueue" }, { request: { onHandled: () => {} } });

    await act(async () => {});

    expect(slot.queryByRole("alertdialog")).toBeNull();
    expect(mergeCalls(slot)).toEqual([
      expect.objectContaining({
        input: { threadId: "thr_1", action: "enqueue", expectedHeadOid: pr.headOid },
      }),
    ]);
  });

  it("does nothing without a request", async () => {
    const slot = renderButton({ kind: "enqueue" });

    await slot.findByRole("button", { name: "Enqueue" });

    expect(mergeCalls(slot)).toEqual([]);
  });
});
