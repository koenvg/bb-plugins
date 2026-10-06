import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import plugin, { TASKS_PLUGIN_VERSION } from "./server";
import { createStore } from "./api";
import { readHistory, seedHistory } from "./test-fixtures/orchestrator-history";

describe("Tasks without Orchestrator", () => {
  it("registers ordinary Tasks without Orchestrator commands, RPCs, or tools", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
    try {
      await plugin(bb);
      expect(harness.inspection.logEntries).toEqual([
        { level: "info", message: `Tasks ${TASKS_PLUGIN_VERSION} loaded` },
      ]);
      await expect(harness.behavior.callRpc("ping", null)).resolves.toEqual({
        ok: true,
        version: TASKS_PLUGIN_VERSION,
      });
      await expect(harness.behavior.runCli(["status"])).resolves.toEqual({
        exitCode: 0,
        stdout: `Tasks ${TASKS_PLUGIN_VERSION}`,
        stderr: "",
      });
      await expect(harness.behavior.runCli(["status", "--json"])).resolves.toEqual({
        exitCode: 0,
        stdout: JSON.stringify({ name: "Tasks", version: TASKS_PLUGIN_VERSION }),
        stderr: "",
      });
      const registrations = harness.inspection.registrations;
      expect(registrations.rpcMethods).toContain("delegate");
      expect(registrations.rpcMethods).toContain("listTasks");
      expect(registrations.rpcMethods).not.toContain("reportWorker");
      expect(registrations.rpcMethods).not.toContain("readWorkerReport");
      expect(registrations.rpcMethods.filter((method) => method.startsWith("orchestrate"))).toEqual(
        [],
      );
      expect(registrations.agentTools.map((tool) => tool.name)).not.toContain("tasks_report");
      expect(registrations.agentTools.map((tool) => tool.name)).not.toContain(
        "tasks_report_context",
      );
      const help = await harness.behavior.runCli(["--help"]);
      expect(help.exitCode).toBe(0);
      expect(help.stdout).toContain("dispatch");
      expect(help.stdout).not.toContain("orchestrate");
      expect(help.stdout).not.toContain("report-context");
      expect(help.stdout).not.toContain("report-show");
    } finally {
      await harness.lifecycle.dispose();
    }
  });

  it("rejects previous entrypoints without records or worker input", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
    try {
      await plugin(bb);
      const store = createStore(bb);
      const before = harness.inspection.sdk.calls.length;
      for (const method of [
        "orchestrateStatus",
        "orchestrateBegin",
        "orchestrateDispatch",
        "reportWorker",
        "readWorkerReport",
      ]) {
        await expect(harness.behavior.callRpc(method, null)).rejects.toThrow();
      }
      for (const tool of ["tasks_report", "tasks_report_context"]) {
        await expect(harness.behavior.callAgentTool(tool, {})).rejects.toThrow();
      }
      for (const args of [
        ["orchestrate", "status", "DEMO-1"],
        ["report", "--help"],
        ["report-context", "--help"],
        ["report-show", "--help"],
      ]) {
        expect((await harness.behavior.runCli(args)).exitCode).not.toBe(0);
      }
      expect(store.tasks.listTasks()).toEqual([]);
      expect(harness.inspection.sdk.calls).toHaveLength(before);
      for (const table of [
        "orchestration_runs",
        "orchestration_dispatch_claims",
        "orchestration_reports",
      ]) {
        expect(
          bb.storage
            .database()
            .prepare<[], { count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)
            .get()?.count,
        ).toBe(0);
      }
    } finally {
      await harness.lifecycle.dispose();
    }
  });

  it("loads and reloads historical pending records without replay or worker changes", async () => {
    let current = createFakePluginHost({
      pluginId: "tasks",
      sdk: {
        threads: {
          get: async () =>
            makeThreadResponse({
              id: "thr_history",
              projectId: "proj_history",
              status: "active",
            }),
        },
      },
    });
    try {
      const fixture = seedHistory(current.bb.storage.database());
      const before = readHistory(current.bb.storage.database());
      await plugin(current.bb);
      for (let generation = 0; generation < 2; generation += 1) {
        const store = createStore(current.bb);
        expect(readHistory(current.bb.storage.database())).toEqual(before);
        expect(store.tasks.getTask(fixture.task.id)).toEqual(fixture.task);
        expect(store.tasks.listComments(fixture.task.id)).toEqual([fixture.comment]);
        expect(store.tasks.listTaskThreads(fixture.task.id)).toEqual([fixture.association]);
        expect(current.harness.inspection.sdk.calls.map(({ path }) => path)).toEqual([
          "threads.get",
        ]);
        expect(current.harness.inspection.experimental_hostRpcCalls).toEqual([]);
        expect(
          current.harness.inspection.registrations.rpcMethods.filter((method) =>
            method.startsWith("orchestrate"),
          ),
        ).toEqual([]);
        if (generation === 0) current = await current.harness.lifecycle.reload(plugin);
      }
    } finally {
      await current.harness.lifecycle.dispose();
    }
  });
});
