// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

const app = await loadPluginApp(() => import("../app"));
afterEach(cleanup);
const proposal = {
  epicId: "epic",
  projectId: "tracker",
  bbProjectId: "proj_fixture",
  coordinatorThreadId: "thr_fixture",
  approvedTaskIds: ["task"],
  fingerprints: { epic: "a".repeat(64), task: "b".repeat(64) },
  execution: {
    presetId: "preset",
    fingerprint: "c".repeat(64),
    snapshot: {
      providerId: "pi",
      modelId: "fixture",
      reasoningLevel: "high",
      serviceTier: null,
      permissionMode: "full",
      environmentKind: "project-default",
      baseBranch: null,
      machineId: null,
      instructions: "No publishing",
    },
  },
  baselineReferences: ["commit:base"],
};
const config = {
  epic: "FIX-1",
  tasks: ["FIX-2"],
  preset: "preset",
  baselineReferences: ["commit:base"],
};
function form(initial: boolean) {
  const submit = vi.fn(async () => {}),
    cancel = vi.fn(async () => {});
  const slot = renderSlot(
    app.pendingInteractions.find((item) => item.id === "orchestrator-run")!,
    {
      interaction: {
        id: "interaction",
        threadId: "thr_fixture",
        title: "Approve orchestration run",
        payload: {
          config: initial ? config : {},
          initial: initial
            ? {
                proposal,
                summary: "Complete epic acceptance and subtask scope",
              }
            : null,
        },
        createdAt: 1,
        expiresAt: null,
      },
      submit,
      cancel,
    },
    {
      rpc: {
        orchestratePreview: () => ({
          proposal,
          summary: "Complete epic acceptance and subtask scope",
        }),
      },
    },
  );
  return { slot, submit, cancel };
}
describe("native run approval form", () => {
  it("resolves missing parameters then submits exactly the displayed complete proposal", async () => {
    const { slot, submit } = form(false);
    expect(
      (slot.getByText("Approve run control") as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(slot.getByLabelText("Run parameters as JSON"), {
      target: { value: JSON.stringify(config) },
    });
    fireEvent.click(slot.getByText("Check scope and selection"));
    await slot.findByText("Complete epic acceptance and subtask scope");
    fireEvent.click(slot.getByText("Approve run control"));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({ approved: true, proposal }),
    );
    expect(
      slot.getByText(
        /BB-recorded user classification does not prove human identity/,
      ),
    ).toBeDefined();
  });
  it("clears approval when fields change and displays validation errors", async () => {
    const { slot, submit } = form(true);
    fireEvent.change(slot.getByLabelText("Run parameters as JSON"), {
      target: { value: "{}" },
    });
    expect(
      (slot.getByText("Approve run control") as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(slot.getByText("Check scope and selection"));
    await slot.findByRole("alert");
    expect(submit).not.toHaveBeenCalled();
  });
  it("lets the user cancel without giving run or restricted authority", async () => {
    const { slot, cancel, submit } = form(true);
    fireEvent.click(slot.getByText("Cancel"));
    expect(cancel).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });
});
