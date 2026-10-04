// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { createHash, webcrypto } from "node:crypto";
import { trackerScopeFields } from "./run-scope-fields";
const app = await loadPluginApp(() => import("../app"));
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function scopeHash(id: string, title: string) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        trackerScopeFields({
          id,
          projectId: "tracker",
          parentTaskId: id === "epic" ? null : "epic",
          title,
          description: "",
        }),
      ),
    )
    .digest("hex");
}
const proposal = {
  epicId: "epic",
  projectId: "tracker",
  bbProjectId: "proj_fixture",
  coordinatorThreadId: "thr_fixture",
  approvedTaskIds: ["task"],
  fingerprints: {
    epic: scopeHash("epic", "Disposable epic"),
    task: scopeHash("task", "Existing subtask"),
  },
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
function form(
  initial: boolean,
  options: {
    action?: "begin" | "resume";
    permissionMode?: string;
    taskTitle?: string;
    liveTaskTitle?: string;
    wrongLabelIdentity?: boolean;
    taskCount?: number;
    coordinatorTitle?: string;
    unavailableLabels?: boolean;
    submitError?: string;
  } = {},
) {
  const ids = Array.from({ length: options.taskCount ?? 1 }, (_, i) =>
    i === 0 ? "task" : `task-${i}`,
  );
  const shownProposal = {
    ...proposal,
    approvedTaskIds: ids,
    fingerprints: {
      epic: proposal.fingerprints.epic,
      ...Object.fromEntries(
        ids.map((id) => [
          id,
          scopeHash(id, options.taskTitle ?? "Existing subtask"),
        ]),
      ),
    },
    execution: {
      ...proposal.execution,
      snapshot: {
        ...proposal.execution.snapshot,
        permissionMode: options.permissionMode ?? "full",
      },
    },
  };
  const submit = vi.fn(async () => {
      if (options.submitError) throw new Error(options.submitError);
    }),
    cancel = vi.fn(async () => {});
  const slot = renderSlot(
    app.pendingInteractions.find((item) => item.id === "orchestrator-run")!,
    {
      interaction: {
        id: "interaction",
        threadId: "thr_fixture",
        title: "Approve orchestration run",
        payload: {
          action: options.action ?? "begin",
          config: initial ? config : {},
          initial: initial
            ? {
                proposal: shownProposal,
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
      sdk: {
        threads: {
          get: async () => {
            if (options.unavailableLabels) throw new Error("Names unavailable");
            return makeThreadResponse({
              id: "thr_fixture",
              projectId: "proj_fixture",
              title: options.coordinatorTitle ?? "Fixture coordinator",
            });
          },
        },
      },
      rpc: {
        getTask: (input) => {
          const { taskId } = input as { taskId: string };
          if (options.unavailableLabels) throw new Error("Names unavailable");
          return {
            task: {
              id: options.wrongLabelIdentity ? "different-task" : taskId,
              projectId: "tracker",
              parentTaskId: taskId === "epic" ? null : "epic",
              key:
                taskId === "epic" ? "FIX-1" : `FIX-${ids.indexOf(taskId) + 2}`,
              title:
                taskId === "epic"
                  ? "Disposable epic"
                  : (options.liveTaskTitle ??
                    options.taskTitle ??
                    "Existing subtask"),
              description: "",
            },
          };
        },
        orchestratePreview: () => ({
          proposal: shownProposal,
          summary: "Complete epic acceptance and subtask scope",
        }),
      },
    },
  );
  return { slot, submit, cancel, proposal: shownProposal };
}
describe("native run approval form", () => {
  it("keeps a readable scope, warning and actions outside closed technical details", async () => {
    const { slot } = form(true);
    await slot.findByText("FIX-2 · Existing subtask");
    expect(slot.getByText("FIX-1 · Disposable epic")).toBeDefined();
    expect(slot.getByText("Fixture coordinator")).toBeDefined();
    expect(slot.getByText("Warning: full access")).toBeDefined();
    expect(slot.getByText("commit:base")).toBeDefined();
    const details = slot.getByText("Technical details").closest("details")!;
    expect(details.open).toBe(false);
    expect(
      slot.getByRole("button", { name: "Approve run" }).closest("details"),
    ).toBeNull();
    expect(
      slot.getByRole("button", { name: "Cancel" }).closest("details"),
    ).toBeNull();
    expect(slot.queryByRole("checkbox")).toBeNull();
    fireEvent.click(slot.getByText("Technical details"));
    expect(details.open).toBe(true);
    expect(slot.getByText(/"fingerprints":/).textContent).toContain(
      proposal.fingerprints.epic,
    );
  });
  it("uses action-aware labels and retains the exact resume proposal", async () => {
    const { slot, submit } = form(true, { action: "resume" });
    fireEvent.click(slot.getByRole("button", { name: "Approve resume" }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({ approved: true, proposal }),
    );
  });
  it("does not claim full access for a different permission mode", () => {
    const { slot } = form(true, { permissionMode: "read-only" });
    expect(slot.queryByText("Warning: full access")).toBeNull();
    expect(slot.getByText("read-only")).toBeDefined();
    expect(
      slot.getByText(/does not approve publication, merge, production/),
    ).toBeDefined();
  });
  it("escapes display labels without changing proposal identities or hashes", async () => {
    const title = '<img src=x onerror="alert(1)">';
    const {
      slot,
      submit,
      proposal: expected,
    } = form(true, { taskTitle: title, coordinatorTitle: title });
    await slot.findByText(`FIX-2 · ${title}`);
    expect(slot.container.querySelector("img")).toBeNull();
    fireEvent.click(slot.getByRole("button", { name: "Approve run" }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        approved: true,
        proposal: expected,
      }),
    );
  });
  it("falls back to exact bound IDs when display names cannot be read", async () => {
    const { slot, submit } = form(true, { unavailableLabels: true });
    expect(slot.getByText("task")).toBeDefined();
    expect(slot.getByText("thr_fixture")).toBeDefined();
    fireEvent.click(slot.getByRole("button", { name: "Approve run" }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({ approved: true, proposal }),
    );
  });
  it.each([
    { wrongLabelIdentity: true },
    { liveTaskTitle: "Changed after approval preview" },
  ])(
    "does not show mismatched or changed task labels as approved scope: %j",
    async (options) => {
      const { slot, submit } = form(true, options);
      await slot.findByText("Fixture coordinator");
      expect(slot.getByText("task")).toBeDefined();
      expect(slot.queryByText(/Changed after approval preview/)).toBeNull();
      fireEvent.click(slot.getByRole("button", { name: "Approve run" }));
      await waitFor(() =>
        expect(submit).toHaveBeenCalledWith({ approved: true, proposal }),
      );
    },
  );
  it("keeps all 100 selected tasks and bounds read-only display lookups", async () => {
    const { slot, proposal: expected } = form(true, { taskCount: 100 });
    await slot.findByText("FIX-101 · Existing subtask");
    expect(slot.getByText("100 selected tasks")).toBeDefined();
    expect(
      slot
        .getByRole("region", { name: "Selected scope" })
        .querySelectorAll("li"),
    ).toHaveLength(100);
    const reads = slot.inspection.rpcCalls;
    expect(reads).toHaveLength(101);
    expect(reads.every((call) => call.method === "getTask")).toBe(true);
    expect(
      new Set(reads.map((call) => (call.input as { taskId: string }).taskId)),
    ).toEqual(new Set([expected.epicId, ...expected.approvedTaskIds]));
    expect(slot.inspection.sdkCalls).toHaveLength(1);
  });
  it.each(["", "Long-label-".repeat(200)])(
    "handles an empty or long display title",
    async (title) => {
      const {
        slot,
        submit,
        proposal: expected,
      } = form(true, { taskTitle: title });
      await slot.findByText(title ? `FIX-2 · ${title}` : "FIX-2");
      fireEvent.click(slot.getByRole("button", { name: "Approve run" }));
      await waitFor(() =>
        expect(submit).toHaveBeenCalledWith({
          approved: true,
          proposal: expected,
        }),
      );
    },
  );
  it("keeps native keyboard-focusable controls when details are expanded", () => {
    const { slot } = form(true);
    const summary = slot.getByText("Technical details");
    summary.focus();
    expect(document.activeElement).toBe(summary);
    fireEvent.click(summary);
    slot.getByLabelText("Run parameters as JSON").focus();
    expect(document.activeElement).toBe(
      slot.getByLabelText("Run parameters as JSON"),
    );
    const approve = slot.getByRole("button", { name: "Approve run" });
    approve.focus();
    expect(document.activeElement).toBe(approve);
    expect(approve.className).toContain("focus-visible:ring");
  });
  it("shows submission failures and restores the same approval action", async () => {
    const { slot, submit } = form(true, {
      submitError: "Scope changed; invoke again",
    });
    fireEvent.click(slot.getByRole("button", { name: "Approve run" }));
    expect((await slot.findByRole("alert")).textContent).toContain(
      "Scope changed",
    );
    expect(
      (slot.getByRole("button", { name: "Approve run" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(submit).toHaveBeenCalledWith({ approved: true, proposal });
  });
  it("resolves missing parameters then submits exactly the displayed complete proposal", async () => {
    const { slot, submit } = form(false);
    expect((slot.getByText("Approve run") as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.change(slot.getByLabelText("Run parameters as JSON"), {
      target: { value: JSON.stringify(config) },
    });
    fireEvent.click(slot.getByText("Check scope and selection"));
    await slot.findByText("Complete epic acceptance and subtask scope");
    fireEvent.click(slot.getByText("Approve run"));
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
    expect((slot.getByText("Approve run") as HTMLButtonElement).disabled).toBe(
      true,
    );
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
