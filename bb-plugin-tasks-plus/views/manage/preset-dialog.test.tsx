// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { rpcInput } from "../../test-fixtures.js";
import { app, project } from "./manage.test-support.js";

const { describePresetEnvironment, savePresetDraft } = await import("./preset-dialog.js");

afterEach(cleanup);

const MACHINES = [{ id: "mach_1", name: "Sawyer Air" }];

function presetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "01HZZZZZZZZZZZZZZZZZZZZZE1",
    name: "FB3 BE live worktree",
    providerId: "claude-code",
    modelId: "claude-sonnet-5",
    reasoningLevel: "medium",
    serviceTier: null,
    permissionMode: "accept-edits",
    environmentKind: "new-worktree",
    baseBranch: "main",
    machineId: "mach_1",
    instructions: "",
    builtin: false,
    createdAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("describePresetEnvironment", () => {
  it("summarizes worktree presets and falls back to defaults and raw ids", () => {
    expect(describePresetEnvironment(presetRow() as never, MACHINES)).toBe(
      "Worktree · main · Sawyer Air",
    );
    expect(
      describePresetEnvironment(
        presetRow({ baseBranch: null, machineId: null }) as never,
        MACHINES,
      ),
    ).toBe("Worktree · default · default");
    expect(
      describePresetEnvironment(presetRow({ machineId: "mach_gone" }) as never, MACHINES),
    ).toBe("Worktree · main · mach_gone");
    expect(
      describePresetEnvironment(
        presetRow({ environmentKind: "project-default" }) as never,
        MACHINES,
      ),
    ).toBe("Project default");
  });
});

describe("savePresetDraft", () => {
  const draft = {
    name: "FB3",
    providerId: "claude-code",
    modelId: "claude-sonnet-5",
    reasoningLevel: "medium",
    serviceTier: undefined,
    permissionMode: "accept-edits",
    environmentKind: "new-worktree",
    baseBranch: " main ",
    machineId: "mach_1",
    instructions: "",
  } as const;

  function captureRpc() {
    const calls: Array<{ method: string; input: unknown }> = [];
    const rpc = {
      call: (method: string, input: unknown) => {
        calls.push({ method, input });
        return Promise.resolve({});
      },
    };
    return { calls, rpc: rpc as never };
  }

  it("sends trimmed worktree targets on create", async () => {
    const { calls, rpc } = captureRpc();
    await savePresetDraft(rpc, null, draft);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("createPreset");
    expect(calls[0]!.input).toMatchObject({
      environmentKind: "new-worktree",
      baseBranch: "main",
      machineId: "mach_1",
    });
  });

  it("nulls stale targets when the kind is project-default", async () => {
    const { calls, rpc } = captureRpc();
    await savePresetDraft(rpc, presetRow() as never, {
      ...draft,
      environmentKind: "project-default",
    });
    expect(calls[0]!.method).toBe("updatePreset");
    expect(calls[0]!.input).toMatchObject({
      presetId: presetRow().id,
      environmentKind: "project-default",
      baseBranch: null,
      machineId: null,
    });
  });

  it("maps empty worktree targets to nulls (defaults)", async () => {
    const { calls, rpc } = captureRpc();
    await savePresetDraft(rpc, null, {
      ...draft,
      baseBranch: "",
      machineId: "",
    });
    expect(calls[0]!.input).toMatchObject({
      environmentKind: "new-worktree",
      baseBranch: null,
      machineId: null,
    });
  });
});

describe("PresetDialog environment section", () => {
  function renderManagePresets(presets: unknown[], rpcOverrides: Record<string, unknown> = {}) {
    return renderSlot(
      app.navPanels[0]!,
      { subPath: "manage" },
      {
        rpc: {
          listProjects: () => ({ projects: [project] }),
          listFolders: () => ({ folders: [] }),
          listPresets: () => ({ presets }),
          sidebarSummary: () => ({ projects: [] }),
          listTasks: () => ({ tasks: [] }),
          listLabels: () => ({ labels: [] }),
          listMachines: () => ({ machines: MACHINES }),
          ...rpcOverrides,
        },
      },
    );
  }

  it("shows the environment column and hydrates a worktree preset", async () => {
    const slot = renderManagePresets([presetRow({ reasoningLevel: "ultra" })]);
    fireEvent.mouseDown(await slot.findByRole("tab", { name: "Presets" }));
    await slot.findByText("Worktree · main · Sawyer Air");
    fireEvent.click(slot.getByRole("button", { name: "Edit preset FB3 BE live worktree" }));
    const branch = (await slot.findByLabelText("Base branch")) as HTMLInputElement;
    expect(branch.value).toBe("main");
    expect(branch.placeholder).toBe("project default base — leave empty");
    expect(slot.getByLabelText("Machine")).toBeDefined();
    await waitFor(() =>
      expect((slot.getByLabelText("Reasoning level") as HTMLInputElement).value).toBe("ultra"),
    );
    expect(slot.getByTestId("bb-provider-model-picker").dataset.routingKind).toBe("host");
    expect(slot.getByTestId("bb-provider-model-picker").dataset.routingId).toBe("mach_1");
    expect(slot.getByTestId("bb-permission-mode-picker").dataset.align).toBe("start");
  });

  it("hides worktree fields for project-default presets", async () => {
    const slot = renderManagePresets([
      presetRow({
        name: "Default env",
        environmentKind: "project-default",
        baseBranch: null,
        machineId: null,
      }),
    ]);
    fireEvent.mouseDown(await slot.findByRole("tab", { name: "Presets" }));
    await slot.findByText("Project default");
    fireEvent.click(slot.getByRole("button", { name: "Edit preset Default env" }));
    await slot.findByLabelText("Execution environment");
    expect(slot.queryByLabelText("Base branch")).toBeNull();
    expect(slot.queryByLabelText("Machine")).toBeNull();
  });

  it.each(["fast", "priority"])(
    "saves the host picker selection with tier %s",
    async (serviceTier) => {
      const updates: Array<Record<string, unknown>> = [];
      const slot = renderManagePresets([presetRow()], {
        updatePreset: (raw: unknown) => {
          const input = rpcInput(raw);
          updates.push(input);
          return { preset: { ...presetRow(), ...input } };
        },
      });
      fireEvent.mouseDown(await slot.findByRole("tab", { name: "Presets" }));
      fireEvent.click(
        await slot.findByRole("button", {
          name: "Edit preset FB3 BE live worktree",
        }),
      );

      fireEvent.change(await slot.findByLabelText("Provider ID"), {
        target: { value: "codex" },
      });
      fireEvent.change(slot.getByLabelText("Model"), {
        target: { value: "gpt-5.6-sol" },
      });
      fireEvent.change(slot.getByLabelText("Reasoning level"), {
        target: { value: "high" },
      });
      // The SDK test picker has fixed default/fast options, not a provider catalog.
      const tierPicker = slot.getByLabelText("Service tier") as HTMLSelectElement;
      if (serviceTier === "priority") tierPicker.add(new Option("Priority", serviceTier));
      fireEvent.change(slot.getByLabelText("Service tier"), {
        target: { value: serviceTier },
      });
      fireEvent.click(slot.getByRole("button", { name: "Apply execution selection" }));
      fireEvent.click(slot.getByRole("button", { name: "Save preset" }));

      await waitFor(() => expect(updates).toHaveLength(1));
      expect(updates[0]).toMatchObject({
        providerId: "codex",
        modelId: "gpt-5.6-sol",
        reasoningLevel: "high",
        serviceTier,
      });
    },
  );
});
