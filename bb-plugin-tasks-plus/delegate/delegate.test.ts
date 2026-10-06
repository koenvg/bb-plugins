import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import { createStore, registerTasksApi } from "../api";
import { tasksRpcContract } from "../shared/contract";
import type { Project, Task } from "../db";
import { displayWidth } from "../shared/text-measure";
import { delegationRpcContract } from "./contract";
import { buildSeedPrompt, registerDelegation } from ".";
import { expectReportingRules, expectTaskLinkRules } from "../reporting-test-support";

import {
  createAgentContextFixture,
  measureContext,
  reportPolicy,
  wordCount,
} from "../agent-context-test-support";
function createTestPreset(
  store: ReturnType<typeof createStore>,
  overrides: Partial<{
    environmentKind: "project-default" | "new-worktree";
    serviceTier: string;
    baseBranch: string | null;
    machineId: string | null;
  }> = {},
) {
  return store.tasks.createPreset({
    name: "Test worker",
    providerId: "claude-code",
    modelId: "claude-sonnet-5",
    reasoningLevel: "high",
    serviceTier: overrides.serviceTier ?? "fast",
    permissionMode: "full",
    environmentKind: overrides.environmentKind ?? "project-default",
    baseBranch: overrides.baseBranch ?? null,
    machineId: overrides.machineId ?? null,
    instructions: "",
    builtin: false,
  });
}

describe("task delegation", () => {
  it("keeps assigned requirements and old comment attachments without automatic history", async () => {
    const fixture = createAgentContextFixture();
    const {
      harness,
      store,
      task,
      preset,
      project,
      subtask,
      blocker,
      comments,
      taskAttachment,
      commentAttachment,
      presetInstructions,
      extraInstructions,
    } = fixture;
    try {
      await harness.callRpc("delegate", {
        taskId: task.id,
        presetId: preset.id,
        extraInstructions,
      });
      const args = harness.sdk.callsTo("threads.spawn")[0]?.[0] as { prompt: string };
      const policy = reportPolicy(args.prompt);
      const authoredPolicy = policy.replaceAll(task.key, "").replaceAll(task.id, "");
      measureContext("delegation", args.prompt, authoredPolicy);
      expect(args.prompt).toContain(task.description);
      expect(args.prompt).toContain(project.name);
      expect(args.prompt).toContain(project.linkedBbProjectId);
      expect(args.prompt).toContain(`${blocker.key} · ${blocker.title} (${blocker.status})`);
      expect(args.prompt).toContain(`${subtask.key} · ${subtask.title} (${subtask.status})`);
      expect(args.prompt).toContain(presetInstructions);
      expect(args.prompt).toContain(extraInstructions);
      for (const attachment of [taskAttachment, commentAttachment]) {
        expect(args.prompt).toContain(`${attachment.fileName} · ${attachment.id}`);
        expect(args.prompt).toContain(`bb tasks attachment get ${attachment.id}`);
      }
      expect(store.tasks.getTask(task.id)?.status).toBe("in_progress");
      expect(
        store.tasks
          .listTaskThreads(task.id)
          .map((link) => link.threadId)
          .sort(),
      ).toEqual(["thr_context", "thr_prior_sentinel"]);
      expect(store.tasks.listComments(task.id)).toEqual(expect.arrayContaining(comments));
      expect(policy).not.toBe("");
      expect.soft(wordCount(authoredPolicy), "authored policy budget").toBeLessThanOrEqual(120);
      expect.soft(args.prompt.includes("## Recent comments"), "no history section").toBe(false);
      for (const comment of comments) {
        expect.soft(args.prompt.includes(comment.body), "no injected comment body").toBe(false);
      }
      for (const excluded of [
        "meaningful milestones",
        "40-80 words",
        "parent refreshes",
        "tasks_report",
        "report/comment IDs",
      ]) {
        expect.soft(policy.includes(excluded), `no ${excluded} instruction`).toBe(false);
      }
    } finally {
      await harness.dispose();
    }
  });

  it.each(["dispatch", "attach"])("keeps a %s link after a public update to Done", async (mode) => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks",
      sdk: {
        threads: {
          spawn: async () => ({ id: "thr_completed" }),
          get: async () => makeThreadResponse({ id: "thr_completed", status: "idle" }),
        },
      },
    });
    try {
      const store = createStore(bb);
      const project = store.tasks.createProject({
        name: "Completed links",
        prefix: "KEEP",
        color: "blue",
        linkedBbProjectId: "proj_bb",
      });
      const task = store.tasks.createTask({
        projectId: project.id,
        title: "Retain link",
        status: "todo",
      });
      registerDelegation(bb, store);
      registerTasksApi(bb, store);
      if (mode === "dispatch") {
        const preset = createTestPreset(store);
        await harness.behavior.callRpc("delegate", { taskId: task.id, presetId: preset.id });
      } else {
        await harness.behavior.callRpc("taskThreadsAttach", {
          taskId: task.id,
          threadId: "thr_completed",
        });
      }
      const before = tasksRpcContract.listTaskThreads.output.parse(
        await harness.behavior.callRpc("listTaskThreads", { taskId: task.id }),
      );
      expect(before.taskThreads).toEqual([
        expect.objectContaining({ taskId: task.id, threadId: "thr_completed" }),
      ]);
      const updated = await harness.behavior.callRpc("updateTask", {
        taskId: task.id,
        status: "done",
        authorName: "User",
      });
      expect(updated).toMatchObject({ ok: true, task: { id: task.id, status: "done" } });
      expect(await harness.behavior.callRpc("listTaskThreads", { taskId: task.id })).toEqual(
        before,
      );
      const linked = tasksRpcContract.getTasksForThread.output.parse(
        await harness.behavior.callRpc("getTasksForThread", { threadId: "thr_completed" }),
      );
      expect(linked.tasks).toEqual([
        expect.objectContaining({ id: task.id, key: task.key, status: "done" }),
      ]);
      expect(harness.inspection.sdk.callsTo("threads.spawn")).toHaveLength(
        mode === "dispatch" ? 1 : 0,
      );
      expect(harness.inspection.sdk.calls.map((call) => call.path)).toEqual(
        mode === "dispatch" ? ["threads.spawn", "threads.get"] : ["threads.get"],
      );
    } finally {
      await harness.lifecycle.dispose();
    }
  });

  it.each(["fast", "priority"])(
    "dispatches tier %s from a preset and updates the task",
    async (serviceTier) => {
      const { bb, harness } = createFakePluginHost({
        pluginId: "tasks",
        sdk: {
          threads: {
            spawn: async () => ({ id: "thr_delegated" }),
            get: async () => makeThreadResponse({ id: "thr_delegated", status: "starting" }),
          },
        },
      });
      const store = createStore(bb);
      const project = store.tasks.createProject({
        name: "Tasks plugin",
        prefix: "TASK",
        color: "blue",
        linkedBbProjectId: "proj_bb",
      });
      const task = store.tasks.createTask({
        projectId: project.id,
        title: "Implement delegation",
        description: "Build the core agent loop.",
        status: "todo",
      });
      registerDelegation(bb, store);
      const preset = createTestPreset(store, { serviceTier });

      const result = delegationRpcContract.delegate.output.parse(
        await harness.callRpc("delegate", {
          taskId: task.id,
          presetId: preset.id,
          extraInstructions: "Run the focused tests before reporting back.",
        }),
      );

      expect(result).toEqual({ threadId: "thr_delegated" });
      expect(harness.sdk.callsTo("threads.spawn")).toEqual([
        [
          expect.objectContaining({
            projectId: "proj_bb",
            environment: { type: "project-default" },
            providerId: "claude-code",
            model: "claude-sonnet-5",
            reasoningLevel: "high",
            serviceTier,
            permissionMode: "full",
            title: "TASK-1 · Implement delegation",
            prompt: expect.stringContaining("Run the focused tests before reporting back."),
            origin: "plugin",
            originPluginId: "tasks",
          }),
        ],
      ]);
      expect(harness.sdk.callsTo("threads.spawn")[0]?.[0]).toMatchObject({
        prompt: expect.stringContaining("Comment only for review readiness"),
      });
      expect(store.tasks.listTaskThreads(task.id)).toEqual([
        expect.objectContaining({
          taskId: task.id,
          threadId: "thr_delegated",
          presetName: "Test worker",
          title: "TASK-1 · Implement delegation",
          liveStatus: "starting",
        }),
      ]);
      expect(store.tasks.getTask(task.id)?.status).toBe("in_progress");
      expect(store.tasks.listComments(task.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "system",
            authorName: "Tasks",
            presetName: "Test worker",
            threadId: "thr_delegated",
            body: "Status changed to In Progress · dispatched to Test worker",
          }),
          expect.objectContaining({
            kind: "system",
            authorName: "Tasks",
            presetName: "Test worker",
            threadId: "thr_delegated",
            body: "Dispatched to Test worker",
          }),
        ]),
      );
      expect(harness.realtimeSignals).toEqual([
        { channel: "threads:changed", payload: { taskId: task.id } },
        {
          channel: "tasks:changed",
          payload: { taskId: task.id, projectId: project.id },
        },
        { channel: "comments:changed", payload: { taskId: task.id } },
      ]);

      await harness.dispose();
    },
  );

  it("corrects the attached row when a delegated thread becomes active immediately", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks",
      sdk: {
        threads: {
          spawn: async () => ({ id: "thr_fast" }),
          get: async () => makeThreadResponse({ id: "thr_fast", status: "active" }),
        },
      },
    });
    const store = createStore(bb);
    const project = store.tasks.createProject({
      name: "Fast delegation",
      prefix: "FAST",
      color: "blue",
      linkedBbProjectId: "proj_bb",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Transition during spawn",
    });
    registerDelegation(bb, store);
    const preset = createTestPreset(store);

    await harness.callRpc("delegate", {
      taskId: task.id,
      presetId: preset.id,
    });

    expect(harness.sdk.callsTo("threads.get")).toEqual([[{ threadId: "thr_fast" }]]);
    expect(store.tasks.listTaskThreads(task.id)).toEqual([
      expect.objectContaining({
        threadId: "thr_fast",
        liveStatus: "working",
      }),
    ]);

    await harness.dispose();
  });

  it("bounds delegated thread titles by display width", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks",
      sdk: {
        threads: {
          spawn: async () => ({ id: "thr_wide_title" }),
          get: async () => makeThreadResponse({ id: "thr_wide_title", status: "starting" }),
        },
      },
    });
    const store = createStore(bb);
    const project = store.tasks.createProject({
      name: "Tasks plugin",
      prefix: "TASK",
      color: "blue",
      linkedBbProjectId: "proj_bb",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "调".repeat(100),
    });
    registerDelegation(bb, store);
    const preset = createTestPreset(store);

    await harness.callRpc("delegate", {
      taskId: task.id,
      presetId: preset.id,
    });

    const title = `TASK-1 · ${"调".repeat(55)}`;
    expect(harness.sdk.callsTo("threads.spawn")).toEqual([[expect.objectContaining({ title })]]);
    expect(displayWidth(title)).toBeLessThanOrEqual(120);

    await harness.dispose();
  });

  it("spawns a new worktree from the configured branch on the configured machine", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks",
      sdk: {
        threads: {
          spawn: async () => ({ id: "thr_worktree" }),
          get: async () => makeThreadResponse({ id: "thr_worktree", status: "starting" }),
        },
      },
    });
    const store = createStore(bb);
    const project = store.tasks.createProject({
      name: "Worktree delegation",
      prefix: "WT",
      color: "blue",
      linkedBbProjectId: "proj_demo",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Use a fresh checkout",
    });
    registerDelegation(bb, store);
    const preset = createTestPreset(store, {
      environmentKind: "new-worktree",
      baseBranch: "release/next",
      machineId: "host_remote",
    });

    await harness.callRpc("delegate", {
      taskId: task.id,
      presetId: preset.id,
    });

    expect(harness.sdk.callsTo("threads.spawn")).toEqual([
      [
        expect.objectContaining({
          environment: {
            type: "host",
            hostId: "host_remote",
            workspace: {
              type: "managed-worktree",
              baseBranch: { kind: "named", name: "release/next" },
            },
          },
        }),
      ],
    ]);
    expect(harness.sdk.callsTo("system.config")).toEqual([]);

    await harness.dispose();
  });

  it("resolves the default machine and default branch for a worktree preset", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks",
      sdk: {
        system: {
          config: async () => ({ primaryHostId: "host_primary" }),
        },
        threads: {
          spawn: async () => ({ id: "thr_default_worktree" }),
          get: async () =>
            makeThreadResponse({
              id: "thr_default_worktree",
              status: "starting",
            }),
        },
      },
    });
    const store = createStore(bb);
    const project = store.tasks.createProject({
      name: "Default worktree target",
      prefix: "DWT",
      color: "blue",
      linkedBbProjectId: "proj_demo",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Use default worktree target",
    });
    registerDelegation(bb, store);
    const preset = createTestPreset(store, {
      environmentKind: "new-worktree",
    });

    await harness.callRpc("delegate", {
      taskId: task.id,
      presetId: preset.id,
    });

    expect(harness.sdk.callsTo("system.config")).toEqual([[]]);
    expect(harness.sdk.callsTo("threads.spawn")).toEqual([
      [
        expect.objectContaining({
          environment: {
            type: "host",
            hostId: "host_primary",
            workspace: {
              type: "managed-worktree",
              baseBranch: { kind: "default" },
            },
          },
        }),
      ],
    ]);

    await harness.dispose();
  });

  it("maps a rejected worktree target to a friendly typed delegation error", async () => {
    const spawnError = Object.assign(new Error("HTTP 404: Host not found"), {
      code: "host_not_found",
      status: 404,
    });
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks",
      sdk: {
        threads: {
          spawn: async () => {
            throw spawnError;
          },
        },
      },
    });
    const store = createStore(bb);
    const project = store.tasks.createProject({
      name: "Invalid target",
      prefix: "BAD",
      color: "blue",
      linkedBbProjectId: "proj_demo",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Reject bad machine",
    });
    registerDelegation(bb, store);
    const preset = createTestPreset(store, {
      environmentKind: "new-worktree",
      baseBranch: "missing-branch",
      machineId: "host_missing",
    });

    await expect(
      harness.callRpc("delegate", {
        taskId: task.id,
        presetId: preset.id,
      }),
    ).rejects.toMatchObject({
      code: "handler_error",
      message: "Could not create a worktree on host_missing from missing-branch: Host not found",
    });

    await harness.dispose();
  });

  it("fails before spawning when the task project is not linked to bb", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks",
      sdk: { threads: { spawn: async () => ({ id: "thr_never" }) } },
    });
    const store = createStore(bb);
    const project = store.tasks.createProject({
      name: "Unlinked",
      prefix: "UNL",
      color: "blue",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Cannot delegate yet",
    });
    registerDelegation(bb, store);
    const preset = createTestPreset(store);

    await expect(
      harness.callRpc("delegate", { taskId: task.id, presetId: preset.id }),
    ).rejects.toMatchObject({
      code: "handler_error",
      message: 'Task project "Unlinked" is not linked to a bb project',
    });
    expect(harness.sdk.callsTo("threads.spawn")).toEqual([]);

    await harness.dispose();
  });

  it("self-attaches an existing thread through taskThreadsAttach", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks",
      sdk: {
        threads: {
          get: async () => ({
            id: "thr_existing",
            title: "𠮷".repeat(100),
            titleFallback: null,
            status: "active",
          }),
        },
      },
    });
    const store = createStore(bb);
    const project = store.tasks.createProject({
      name: "Manual",
      prefix: "MAN",
      color: "blue",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Attach current worker",
    });
    registerDelegation(bb, store);

    await expect(
      harness.callRpc("taskThreadsAttach", {
        taskId: task.id,
        threadId: "thr_existing",
      }),
    ).resolves.toEqual({ threadId: "thr_existing" });
    expect(harness.sdk.callsTo("threads.get")).toEqual([[{ threadId: "thr_existing" }]]);
    expect(store.tasks.listTaskThreads(task.id)).toEqual([
      expect.objectContaining({
        threadId: "thr_existing",
        presetName: "Attached",
        title: "𠮷".repeat(60),
        liveStatus: "working",
      }),
    ]);
    expect(harness.realtimeSignals).toEqual([
      { channel: "threads:changed", payload: { taskId: task.id } },
      {
        channel: "tasks:changed",
        payload: { taskId: task.id, projectId: project.id },
      },
    ]);

    await harness.dispose();
  });
});

describe("task thread detach", () => {
  it("removes a completed task link on explicit request without changing status or stopping threads", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks",
      sdk: {
        threads: {
          get: async ({ threadId }: { threadId: string }) => ({
            id: threadId,
            title: `Worker ${threadId}`,
            titleFallback: null,
            status: threadId === "thr_dead" ? "error" : "idle",
          }),
        },
      },
    });
    const store = createStore(bb);
    const project = store.tasks.createProject({
      name: "Manual",
      prefix: "MAN",
      color: "blue",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Respawned work",
    });
    const otherTask = store.tasks.createTask({
      projectId: project.id,
      title: "Other work",
    });
    registerDelegation(bb, store);
    registerTasksApi(bb, store);

    await harness.callRpc("taskThreadsAttach", {
      taskId: task.id,
      threadId: "thr_dead",
    });
    await harness.callRpc("taskThreadsAttach", {
      taskId: task.id,
      threadId: "thr_live",
    });
    await harness.callRpc("taskThreadsAttach", {
      taskId: otherTask.id,
      threadId: "thr_dead",
    });
    expect(
      await harness.behavior.callRpc("updateTask", {
        taskId: task.id,
        status: "done",
        authorName: "User",
      }),
    ).toMatchObject({ ok: true, task: { status: "done" } });
    const completedTask = store.tasks.getTask(task.id);
    const commentsBeforeDetach = store.tasks.listComments(task.id);
    const sdkCallsBeforeDetach = [...harness.inspection.sdk.calls];
    harness.realtimeSignals.length = 0;

    await expect(
      harness.callRpc("taskThreadsDetach", {
        taskId: task.id,
        threadId: "thr_dead",
      }),
    ).resolves.toEqual({ threadId: "thr_dead" });

    expect(store.tasks.getTask(task.id)).toEqual(completedTask);
    expect(store.tasks.getTask(task.id)?.status).toBe("done");
    expect(store.tasks.listComments(task.id)).toEqual(commentsBeforeDetach);
    expect(harness.inspection.sdk.calls).toEqual(sdkCallsBeforeDetach);
    const linked = tasksRpcContract.getTasksForThread.output.parse(
      await harness.behavior.callRpc("getTasksForThread", { threadId: "thr_dead" }),
    );
    expect(linked.tasks.map((task) => task.id)).toEqual([otherTask.id]);

    expect(store.tasks.listTaskThreads(task.id).map((thread) => thread.threadId)).toEqual([
      "thr_live",
    ]);
    expect(store.tasks.listTaskThreads(otherTask.id).map((thread) => thread.threadId)).toEqual([
      "thr_dead",
    ]);
    expect(harness.realtimeSignals).toEqual([
      { channel: "threads:changed", payload: { taskId: task.id } },
      {
        channel: "tasks:changed",
        payload: { taskId: task.id, projectId: project.id },
      },
    ]);

    await expect(
      harness.callRpc("taskThreadsDetach", {
        taskId: task.id,
        threadId: "thr_dead",
      }),
    ).rejects.toThrow(`Thread thr_dead is not attached to ${task.key}`);

    await harness.dispose();
  });
});

describe("delegation seed prompt", () => {
  it("keeps links in the ordinary attached-worker prompt", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
    try {
      const { tasks } = createStore(bb);
      const project = tasks.createProject({ name: "Links", prefix: "LINK", color: "blue" });
      const task = tasks.createTask({ projectId: project.id, title: "Keep worker link" });
      const prompt = buildSeedPrompt({
        task,
        project,
        subtasks: [],
        blockers: [],
        attachments: [],
        presetInstructions: "",
      });
      const report = prompt.split("## Report-back contract\n\n")[1]?.split("\n\n## ")[0] ?? "";
      expectTaskLinkRules(report);
      expect(report).toContain("Your thread is already attached");
      expect(prompt).not.toContain("tasks_report");
      expect(prompt).not.toContain("Local attachment can still be pending");
    } finally {
      await harness.lifecycle.dispose();
    }
  });

  it.each([false, true])("includes the reporting rules with subtasks=%s", async (withSubtasks) => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
    try {
      const { tasks } = createStore(bb);
      const project = tasks.createProject({ name: "Reports", prefix: "RPT", color: "blue" });
      const task = tasks.createTask({ projectId: project.id, title: "Report work" });
      const subtasks = withSubtasks
        ? [tasks.createTask({ projectId: project.id, title: "Child", parentTaskId: task.id })]
        : [];
      const prompt = buildSeedPrompt({
        task,
        project,
        subtasks,
        blockers: [],
        attachments: [],
        presetInstructions: "Keep the preset.",
        extraInstructions: "Keep the request.",
      });
      const report = prompt.split("## Report-back contract\n\n")[1]?.split("\n\n## ")[0] ?? "";
      expectReportingRules(report);
      expect(report).toContain(`bb tasks show ${task.key} --json`);
      expect(report).toContain("Tasks references/reporting.md");
      expect(report).toContain("already attached");
      expect(prompt).toContain("## Preset instructions\n\nKeep the preset.");
      expect(prompt).toContain("## Additional instructions\n\nKeep the request.");
    } finally {
      await harness.dispose();
    }
  });

  it("captures task context and the short report-back contract", () => {
    const project: Project = {
      id: "01J00000000000000000000001",
      name: "Tasks plugin",
      prefix: "TASK",
      nextTaskNumber: 4,
      color: "blue",
      folderId: null,
      linkedBbProjectId: "proj_tasks",
      createdAt: "2026-07-15T17:00:00.000Z",
    };
    const task: Task = {
      id: "01J00000000000000000000002",
      projectId: project.id,
      number: 1,
      key: "TASK-1",
      title: "Delegate work",
      description: "Implement **preset-driven** delegation.\n\nKeep the prompt useful.",
      status: "todo",
      priority: "high",
      dueDate: null,
      parentTaskId: null,
      position: 1_024,
      createdAt: "2026-07-15T17:01:00.000Z",
      updatedAt: "2026-07-15T17:01:00.000Z",
    };
    const subtask: Task = {
      ...task,
      id: "01J00000000000000000000003",
      number: 2,
      key: "TASK-2",
      title: "Add focused tests",
      status: "in_progress",
      parentTaskId: task.id,
    };

    expect(
      buildSeedPrompt({
        task,
        project,
        subtasks: [subtask],
        blockers: [
          { ...subtask, key: "TASK-3", title: "Design schema", status: "todo" },
          { ...subtask, key: "TASK-4", title: "Pick library", status: "done" },
        ],
        attachments: [
          {
            id: "01J00000000000000000000006",
            fileName: "delegation-notes.md",
          },
        ],
        presetInstructions: "Prefer focused changes.",
        extraInstructions: "Run the backend gates.",
      }),
    ).toMatchInlineSnapshot(`
      "# TASK-1 · Delegate work

      ## Description

      Implement **preset-driven** delegation.

      Keep the prompt useful.

      ## Project context

      - Name: Tasks plugin
      - Linked bb project: proj_tasks

      ## Blocked by

      - TASK-3 · Design schema (todo)
      - TASK-4 · Pick library (done)

      ## Sub-tasks

      - TASK-2 · Add focused tests (in_progress)

      ## Attachments

      - delegation-notes.md · 01J00000000000000000000006
        Fetch with: bb tasks attachment get 01J00000000000000000000006 --out <path>

      ## Report-back contract

      Work on TASK-1 within scope, acceptance criteria and project instructions. Your thread is already attached.
      Read current requirements/blockers: bb tasks show TASK-1 --json. Report read failures, not assumed state. Fetch relevant attachments. Wait for explicit approval if blockers are not done/canceled.
      Comment only for review readiness, completion, failure, blockers or user decisions. State result, relevant checks including unrun/blocked checks, material limits and evidence link; distinguish reported/verified checks. See Tasks references/reporting.md for posting.
      Use in_review while review remains; done only after all gates. Keep task-to-thread links through all work changes. Detach only on explicit user request. Detaching does not stop the thread or change status. Links grant no ownership or reporting authority.

      ## Preset instructions

      Prefer focused changes.

      ## Additional instructions

      Run the backend gates.
      "
    `);
  });
});
