// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { webcrypto } from "node:crypto";
import plugin from "../server";
import { createStore } from "../api";
import { runRpcContract } from "./run-contract";

const app = await loadPluginApp(() => import("../app"));
const disposals: Array<() => Promise<void>> = [];
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  for (const dispose of disposals.splice(0)) await dispose();
});

async function fixture() {
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks-plus",
    sdk: {
      system: { version: async () => ({ currentVersion: "0.44.0" }) },
      threads: {
        get: async () =>
          makeThreadResponse({
            id: "thr_fixture",
            projectId: "proj_fixture",
            providerId: "pi",
          }),
      },
    },
  });
  disposals.push(() => harness.lifecycle.dispose());
  await plugin(bb);
  const tasks = createStore(bb).tasks;
  const project = tasks.createProject({
    name: "Disposable",
    prefix: "FIX",
    color: "blue",
    linkedBbProjectId: "proj_fixture",
  });
  const epic = tasks.createTask({
    projectId: project.id,
    title: "Disposable epic",
    description: "Epic acceptance and linked specification.",
  });
  const task = tasks.createTask({
    projectId: project.id,
    parentTaskId: epic.id,
    title: "Existing subtask",
    description: "Approved description with a linked reference.\nUnicode: café",
  });
  const preset = tasks.createPreset({
    name: "Disposable execution",
    providerId: "pi",
    modelId: "fixture-model",
    reasoningLevel: "high",
    serviceTier: null,
    permissionMode: "full",
    environmentKind: "project-default",
    baseBranch: null,
    machineId: null,
    instructions: "No publication or production actions.",
  });
  const config = {
    epic: epic.key,
    tasks: [task.key],
    preset: preset.id,
    baselineReferences: ["commit:fixture-base"],
  };
  const preview = () =>
    harness.behavior
      .callRpc("orchestratePreview", {
        coordinatorThreadId: "thr_fixture",
        config,
      })
      .then((result) => runRpcContract.orchestratePreview.output.parse(result));
  const initial = await preview();
  const getTask = (input: unknown) =>
    harness.behavior.callRpc("getTask", input);
  const show = (
    options: {
      taskResponse?: (input: unknown) => unknown;
      coordinator?: { id?: string; projectId?: string };
    } = {},
  ) => {
    const submit = vi.fn(async () => {});
    const slot = renderSlot(
      app.pendingInteractions.find((item) => item.id === "orchestrator-run")!,
      {
        interaction: {
          id: "offline-approval",
          threadId: "thr_fixture",
          title: "Approve orchestration run",
          payload: { action: "begin", config, initial },
          createdAt: 1,
          expiresAt: null,
        },
        submit,
        cancel: async () => {},
      },
      {
        rpc: {
          getTask: options.taskResponse ?? getTask,
          orchestratePreview: preview,
        },
        sdk: {
          threads: {
            get: async () =>
              makeThreadResponse({
                id: "thr_fixture",
                projectId: "proj_fixture",
                title: "Fixture coordinator",
                ...options.coordinator,
              }),
          },
        },
      },
    );
    return { slot, submit };
  };
  return { harness, tasks, epic, task, config, initial, getTask, show };
}

describe("bound approval display through public preview RPC", () => {
  it.each([
    "unchanged",
    "changed-description",
    "wrong-task-project",
    "wrong-task-parent",
    "wrong-coordinator-thread",
    "wrong-coordinator-project",
  ] as const)("keeps exact producer values with %s metadata", async (mode) => {
    const f = await fixture();
    if (mode === "changed-description")
      f.tasks.updateTask(f.task.id, {
        description: "Changed linked reference.",
      });
    const taskResponse = async (input: unknown) => {
      const result = (await f.getTask(input)) as {
        task: Record<string, unknown> | null;
      };
      if (result.task?.id !== f.task.id) return result;
      if (mode === "wrong-task-project")
        return { task: { ...result.task, projectId: "foreign-project" } };
      if (mode === "wrong-task-parent")
        return { task: { ...result.task, parentTaskId: "foreign-epic" } };
      return result;
    };
    const coordinator =
      mode === "wrong-coordinator-thread"
        ? { id: "thr_foreign" }
        : mode === "wrong-coordinator-project"
          ? { projectId: "proj_foreign" }
          : {};
    const { slot, submit } = f.show({ taskResponse, coordinator });
    await waitFor(() =>
      expect(slot.getByText(`${f.epic.key} · ${f.epic.title}`)).toBeTruthy(),
    );
    if (
      [
        "changed-description",
        "wrong-task-project",
        "wrong-task-parent",
      ].includes(mode)
    ) {
      expect(slot.getByText(f.task.id)).toBeTruthy();
      expect(slot.queryByText(`${f.task.key} · ${f.task.title}`)).toBeNull();
    } else
      expect(slot.getByText(`${f.task.key} · ${f.task.title}`)).toBeTruthy();
    if (mode.startsWith("wrong-coordinator")) {
      expect(slot.getByText("thr_fixture")).toBeTruthy();
      expect(slot.queryByText("Fixture coordinator")).toBeNull();
    }
    fireEvent.click(slot.getByText("Approve run"));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        approved: true,
        proposal: f.initial.proposal,
      }),
    );
    expect(f.harness.inspection.pendingInteractions).toHaveLength(0);
    expect(f.harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(0);
  });

  it("does not let a late old lookup failure hide names from a new checked proposal", async () => {
    const f = await fixture();
    let rejectOld!: (reason: Error) => void;
    const oldResponse = new Promise<never>((_, reject) => {
      rejectOld = reject;
    });
    let held = true;
    const { slot } = f.show({
      taskResponse: (input) => {
        if (held && (input as { taskId: string }).taskId === f.task.id)
          return oldResponse;
        return f.getTask(input);
      },
    });
    f.tasks.updateTask(f.task.id, {
      title: "Fresh checked scope",
      description: "New linked reference.",
    });
    held = false;
    fireEvent.change(slot.getByLabelText("Run parameters as JSON"), {
      target: { value: JSON.stringify(f.config) },
    });
    fireEvent.click(slot.getByText("Check scope and selection"));
    await waitFor(() =>
      expect(
        slot.getByText(`${f.task.key} · Fresh checked scope`),
      ).toBeTruthy(),
    );
    await act(async () => {
      rejectOld(
        new Error("Old display lookup failed after proposal replacement"),
      );
      await oldResponse.catch(() => undefined);
    });
    expect(slot.getByText(`${f.task.key} · Fresh checked scope`)).toBeTruthy();
  });
});
