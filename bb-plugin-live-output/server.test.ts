import type { PluginBbSdk } from "@get-bb/plugin-sdk";
type ThreadListResult = Awaited<ReturnType<PluginBbSdk["threads"]["list"]>>;
import { afterEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import {
  createFakePluginHost,
  experimental_scanPublicSdkOnly,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin from "./server";
import { snapshotSchema } from "./contract";

const hosts: ReturnType<typeof createFakePluginHost>["harness"][] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.lifecycle.dispose();
  vi.useRealTimers();
});

describe("public plugin boundary", () => {
  it("registers one read-only snapshot and one service, measures event hints and survives host disposal", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const thread = makeThreadResponse({
      id: "thr_a",
      updatedAt: 90_000,
      createdAt: 90_000,
      status: "idle",
    });
    const host = createFakePluginHost({
      pluginId: "live-output",
      sdk: {
        threads: {
          list: async () => [],
          events: {
            list: async (args) =>
              args.afterSeq
                ? []
                : [
                    {
                      id: "event_1",
                      threadId: "thr_a",
                      seq: 1,
                      createdAt: 101_100,
                      scope: { kind: "turn", turnId: "turn_a" },
                      type: "item/agentMessage/delta",
                      data: { providerThreadId: "provider_a", itemId: "item_a", delta: "é🙂" },
                    },
                  ],
          },
        },
      },
    });
    hosts.push(host.harness);
    plugin(host.bb);
    expect(await host.harness.behavior.callRpc("snapshot")).toMatchObject({
      coverage: "starting",
      totalBytes: 0,
    });
    const service = host.harness.behavior.runService("observe-output");
    await vi.advanceTimersByTimeAsync(1000);
    await host.harness.behavior.emitThreadEvent("experimental_thread.events", {
      thread,
      sequence: 1,
    });
    await host.harness.behavior.emitThreadEvent("experimental_thread.events", {
      thread,
      sequence: 1,
    });
    await vi.advanceTimersByTimeAsync(1000);
    const response = await host.harness.behavior.callRpc("snapshot");
    expect(response).toMatchObject({
      coverage: "live",
      totalBytes: 6,
      deltas: 1,
      rawBytesPerSecond: 6,
      smoothBytesPerSecond: 1.2,
    });
    expect(snapshotSchema.safeParse(response).success).toBe(true);
    await expect(host.harness.behavior.callRpc("snapshot", { bad: true })).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(host.harness.inspection.sdk.callsTo("threads.events.list")).toHaveLength(2);
    expect(host.harness.inspection.realtimeSignals).toEqual([]);
    const calls = host.harness.inspection.sdk.calls.length;
    await host.harness.lifecycle.dispose();
    hosts.pop();
    await service.done;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(host.harness.inspection.sdk.calls).toHaveLength(calls);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not resurrect an unknown deleted thread from an in-flight discovery page", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const thread = makeThreadResponse({ id: "thr_deleted", createdAt: 90_000, updatedAt: 90_000 });
    let release!: (rows: ThreadListResult) => void;
    let first = true;
    const host = createFakePluginHost({
      pluginId: "live-output",
      sdk: {
        threads: {
          list: async () => {
            if (!first) return [];
            first = false;
            return new Promise<ThreadListResult>((resolve) => {
              release = resolve;
            });
          },
          events: { list: async () => [] },
        },
      },
    });
    hosts.push(host.harness);
    plugin(host.bb);
    const service = host.harness.behavior.runService("observe-output");
    await vi.advanceTimersByTimeAsync(0);
    await host.harness.behavior.emitThreadEvent("thread.deleted", {
      thread: { ...thread, deletedAt: 100_100 },
    });
    release([
      {
        ...thread,
        activity: {
          activeBackgroundAgentCount: 0,
          activeBackgroundCommandCount: 0,
          activeGoalCount: 0,
          activePlanModeCount: 0,
          activeWorkflowCount: 0,
        },
        environmentBranchName: null,
        environmentHostId: null,
        environmentIsWorktree: null,
        environmentName: null,
        environmentPath: null,
        environmentProviderId: null,
        environmentWorkspaceDisplayKind: "other",
        hasPendingInteraction: false,
        pinSortKey: null,
        queuedWork: "none",
      },
    ]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await host.harness.behavior.callRpc("snapshot")).toMatchObject({
      threadsDiscovered: 0,
      totalBytes: 0,
      coverage: "live",
    });
    expect(host.harness.inspection.sdk.callsTo("threads.events.list")).toHaveLength(0);
    await host.harness.lifecycle.dispose();
    await service;
  });

  it("uses only public SDK imports and declared external test dependencies", () => {
    const scan = experimental_scanPublicSdkOnly(fileURLToPath(new URL(".", import.meta.url)), {
      allow: [/^vitest$/, /^react(?:\/.*)?$/, /^@testing-library\/react$/],
    });
    expect(scan.violations).toEqual([]);
    expect(scan.privateDependencies).toEqual([]);
    expect(scan.files).toContain("collector.ts");
    expect(scan.files).toContain("app.tsx");
  });
});
