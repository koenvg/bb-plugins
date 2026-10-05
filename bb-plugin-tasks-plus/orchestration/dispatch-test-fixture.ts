import { afterEach, expect, vi } from "vitest";
import {
  createFakePluginHost,
  makeThreadResponse,
  makeMessageDispatchHookContext,
} from "@get-bb/plugin-sdk/testing";
import plugin from "../server";
import { createStore } from "../api";
import { dispatchRpcContract } from "./dispatch-contract";

import { createDispatchStore } from "./dispatch-store";

// Storage-only setup for historical ownership, not a dispatch or agent input.
export function historicalOwner(f: any) {
  const claims = createDispatchStore(f.bb.storage.database());
  const claim = claims.reserve(f.input);
  const association = f.store.tasks.upsertTaskThread({
    taskId: f.task.id,
    threadId: "thr_worker",
    presetName: "Fixture",
    title: "Historical owner",
    liveStatus: "working",
  });
  claims.designate({
    taskId: f.task.id,
    role: "implementation",
    runId: f.input.runId,
    threadId: "thr_worker",
    associationId: association.id,
  });
  f.store.tasks.updateTask(f.task.id, { status: "in_progress" });
  const saved = claims.update(claim.id, {
    phase: "attached",
    threadId: "thr_worker",
    associationId: association.id,
  });
  f.workers.set(
    "thr_worker",
    makeThreadResponse({
      id: "thr_worker",
      projectId: "proj_fixture",
      providerId: "pi",
      parentThreadId: "thr_coordinator",
      originPluginId: f.bb.pluginId,
      createdAt: Date.now(),
    }),
  );
  return saved;
}
export const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
export async function fixture(taskCount = 1, initialize: typeof plugin = plugin) {
  let requests: any[] = [];
  let decisions: any[] = [];
  let interruptions: any[] = [];
  let readInterruptions: () => Promise<any[]> = async () => interruptions;
  let coordinatorProject = "proj_fixture";
  const workers = new Map<string, ReturnType<typeof makeThreadResponse>>();
  const metadata = new Map<string, any>();
  let list: (args: any) => Promise<any[]> = async (args) =>
    [...workers.values()].filter(
      (thread) =>
        thread.projectId === args.projectId &&
        thread.originPluginId === args.originPluginId &&
        (args.archived ? thread.archivedAt != null : thread.archivedAt == null),
    );
  let create: (args: any) => Promise<any> = async (args) => {
    const thread = makeThreadResponse({
      id: "thr_worker",
      projectId: args.projectId,
      parentThreadId: args.parentThreadId,
      originPluginId: "tasks-fixture",
      status: "pending",
    });
    workers.set(thread.id, thread);
    metadata.set(thread.id, args.pluginMetadata);
    return thread;
  };
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks-fixture",
    sdk: {
      projects: {
        get: async ({ projectId }) => ({
          id: projectId,
          name: "Fixture",
          kind: "standard",
          gitRemoteUrl: null,
          sources: [],
          createdAt: 0,
          updatedAt: 0,
        }),
      },
      system: { version: async () => ({ currentVersion: "0.44.0" }) },
      threads: {
        get: async ({ threadId }) => {
          if (threadId === "thr_coordinator")
            return makeThreadResponse({
              id: threadId,
              projectId: coordinatorProject,
              providerId: "pi",
            });
          const thread = workers.get(threadId);
          if (!thread) throw new Error("missing");
          return thread;
        },
        list: (args) => list(args),
        spawn: (args) => create(args),
        getPluginMetadata: async ({ threadId }) => metadata.get(threadId) ?? {},
        events: {
          list: async ({ types }) =>
            types?.[0] === "system/interaction/lifecycle"
              ? decisions
              : types?.[0] === "system/thread/interrupted"
                ? readInterruptions()
                : requests,
        },
      },
    },
  });
  cleanups.push(() => harness.lifecycle.dispose());
  await initialize(bb);
  const store = createStore(bb);
  const project = store.tasks.createProject({
    name: "Disposable",
    prefix: "DSP",
    color: "blue",
    linkedBbProjectId: "proj_fixture",
  });
  const epic = store.tasks.createTask({ projectId: project.id, title: "Epic" });
  const tasks = Array.from({ length: taskCount }, (_, index) =>
    store.tasks.createTask({
      projectId: project.id,
      parentTaskId: epic.id,
      title: `Work ${index + 1}`,
    }),
  );
  const task = tasks[0]!;
  const preset = store.tasks.createPreset({
    name: "Fixture",
    providerId: "pi",
    modelId: "fixture",
    reasoningLevel: "high",
    serviceTier: null,
    permissionMode: "auto",
    environmentKind: "project-default",
    baseBranch: null,
    machineId: null,
    instructions: "No publication.",
  });
  const config = {
    epic: epic.id,
    tasks: tasks.map((task) => task.id),
    preset: preset.id,
    baselineReferences: ["commit:fixture"],
  };
  requests = [
    {
      id: "evt_fixture",
      threadId: "thr_coordinator",
      seq: 1,
      createdAt: Date.now(),
      scope: { kind: "thread" },
      type: "client/turn/requested",
      data: {
        requestId: "creq_fixture",
        initiator: "user",
        senderThreadId: null,
        input: [
          {
            type: "text",
            text: `/skill:bb-orchestrator ${JSON.stringify({ action: "begin", config })}`,
            mentions: [],
          },
        ],
      },
    },
  ];
  await harness.behavior.runCli(["orchestrate", "begin", "--request", "creq_fixture", "--json"], {
    threadId: "thr_coordinator",
  });
  await vi.waitFor(() => expect(harness.inspection.pendingInteractions).toHaveLength(1));
  const form = harness.inspection.pendingInteractions[0]!;
  const value = {
    approved: true,
    proposal: (form.payload as any).initial.proposal,
  };
  decisions = [
    {
      id: "evt_decision",
      threadId: "thr_coordinator",
      seq: 2,
      createdAt: Date.now(),
      scope: { kind: "thread" },
      type: "system/interaction/lifecycle",
      data: {
        interaction: {
          status: "resolved",
          origin: {
            kind: "plugin",
            pluginId: bb.pluginId,
            rendererId: "orchestrator-run",
          },
          resolution: {
            kind: "plugin_submitted",
            description: await form.describeSubmission!(value),
          },
        },
      },
    },
  ];
  harness.behavior.submitInteraction(form.id, value);
  const approved = JSON.parse(
    (
      await harness.behavior.runCli(
        ["orchestrate", "begin", "--request", "creq_fixture", "--json"],
        { threadId: "thr_coordinator" },
      )
    ).stdout!,
  );
  expect(approved.outcome).toBe("run");
  const input = {
    runId: approved.run.id,
    coordinatorThreadId: "thr_coordinator",
    taskId: task.id,
    role: "implementation" as const,
  };
  const dispatch = () =>
    harness.behavior
      .callRpc("orchestrateDispatch", input)
      .then((value) => dispatchRpcContract.orchestrateDispatch.output.parse(value));
  const hook = async (threadId = "thr_worker") =>
    harness.registrations.hooks["message.dispatch"]!(
      makeMessageDispatchHookContext({
        thread: workers.get(threadId)!,
        parentThreadId: "thr_coordinator",
        origin: "plugin",
        originPluginId: bb.pluginId,
        senderThreadId: "thr_coordinator",
        requestedExecution: {
          providerId: "pi",
          model: "fixture",
          reasoningLevel: "high",
          permissionMode: "auto",
          serviceTier: null,
        },
      }),
    );
  return {
    bb,
    harness,
    store,
    epic,
    task,
    tasks,
    preset,
    input,
    dispatch,
    workers,
    metadata,
    hook,
    setListing: (fn: typeof list) => {
      list = fn;
    },
    setRequests: (rows: any[]) => {
      requests = rows;
    },
    setCreate: (fn: typeof create) => {
      create = fn;
    },
    setReadInterruptions: (fn: typeof readInterruptions) => {
      readInterruptions = fn;
    },
    approveRun: async (
      coordinatorThreadId = "thr_coordinator",
      action: "begin" | "resume" = "begin",
    ) => {
      const requestId = `creq_next_${requests.length}`;
      requests.unshift({
        ...requests[0],
        id: `evt_${requestId}`,
        threadId: coordinatorThreadId,
        seq: requests.length + decisions.length + 1,
        createdAt: Date.now(),
        data: {
          ...requests[0].data,
          requestId,
          input: [
            {
              type: "text",
              text: `/skill:bb-orchestrator ${JSON.stringify(action === "begin" ? { action, config } : { action, runId: input.runId })}`,
              mentions: [],
            },
          ],
        },
      });
      const args = ["orchestrate", action, "--request", requestId, "--json"];
      const context = { threadId: coordinatorThreadId };
      await harness.behavior.runCli(args, context);
      await vi.waitFor(() => expect(harness.inspection.pendingInteractions).toHaveLength(1));
      const form = harness.inspection.pendingInteractions[0]!;
      const value = {
        approved: true,
        proposal: (form.payload as any).initial.proposal,
      };
      decisions.unshift({
        ...decisions[0],
        id: `evt_decision_${requestId}`,
        threadId: coordinatorThreadId,
        seq: requests.length + decisions.length + 1,
        createdAt: Date.now(),
        data: {
          interaction: {
            status: "resolved",
            origin: {
              kind: "plugin",
              pluginId: bb.pluginId,
              rendererId: "orchestrator-run",
            },
            resolution: {
              kind: "plugin_submitted",
              description: await form.describeSubmission!(value),
            },
          },
        },
      });
      harness.behavior.submitInteraction(form.id, value);
      const result = JSON.parse((await harness.behavior.runCli(args, context)).stdout!);
      expect(result.outcome).toBe("run");
      return result.run;
    },
    setInterruptions: (events: any[]) => {
      interruptions = events;
    },
    setCoordinatorProject: (id: string) => {
      coordinatorProject = id;
    },
    pause: async () => {
      requests.unshift({
        ...requests[0],
        threadId: "thr_coordinator",
        createdAt: Date.now(),
        id: "evt_pause",
        seq: requests.length + decisions.length + 1,
        data: {
          ...requests[0].data,
          requestId: "creq_pause",
          input: [
            {
              type: "text",
              text: `/skill:bb-orchestrator ${JSON.stringify({ action: "pause", runId: input.runId })}`,
              mentions: [],
            },
          ],
        },
      });
      return harness.behavior.runCli(
        ["orchestrate", "pause", "--request", "creq_pause", "--json"],
        { threadId: "thr_coordinator" },
      );
    },
  };
}
export function expectNoAgentInput(harness: any) {
  for (const method of [
    "threads.spawn",
    "threads.send",
    "threads.queuedMessages.create",
    "threads.queuedMessages.send",
    "threads.stop",
    "threads.resume",
    "threads.recheck",
  ]) {
    expect(harness.sdk.callsTo(method), method).toHaveLength(0);
  }
  expect(harness.registrations.hooks["message.dispatch"]).toBeFalsy();
}
