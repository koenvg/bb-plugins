import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import { createStore } from "../api";
import type { Comment, Project, Task } from "../db";
import { displayWidth } from "../shared/text-measure";
import { delegationRpcContract } from "./contract";
import { buildSeedPrompt, registerDelegation } from ".";
import { expectReportingRules } from "../reporting-test-support";

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
        prompt: expect.stringContaining("40-80 words"),
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
  it("detaches an attached thread through taskThreadsDetach and invalidates", async () => {
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
    harness.realtimeSignals.length = 0;

    await expect(
      harness.callRpc("taskThreadsDetach", {
        taskId: task.id,
        threadId: "thr_dead",
      }),
    ).resolves.toEqual({ threadId: "thr_dead" });

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
        recentComments: [],
        presetInstructions: "Keep the preset.",
        extraInstructions: "Keep the request.",
      });
      const report = prompt.split("## Report-back contract\n\n")[1]?.split("\n\n## ")[0] ?? "";
      expectReportingRules(report);
      expect(report).toContain(`bb tasks comment ${task.key} --body`);
      expect(report).toContain("Tasks skill");
      expect(report).toContain("already attached");
      expect(prompt).toContain("## Preset instructions\n\nKeep the preset.");
      expect(prompt).toContain("## Additional instructions\n\nKeep the request.");
    } finally {
      await harness.dispose();
    }
  });

  it("captures task context and the complete report-back contract", () => {
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
    const comments: Comment[] = [
      {
        id: "01J00000000000000000000004",
        taskId: task.id,
        kind: "user",
        authorName: "Sawyer",
        presetName: null,
        threadId: null,
        body: "Preserve the existing domain path.",
        notifiedCount: 0,
        createdAt: "2026-07-15T17:02:00.000Z",
      },
      {
        id: "01J00000000000000000000005",
        taskId: task.id,
        kind: "agent",
        authorName: "Worker",
        presetName: "Sonnet · high",
        threadId: "thr_prior",
        body: "The schema study is complete.",
        notifiedCount: 0,
        createdAt: "2026-07-15T17:03:00.000Z",
      },
    ];

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
        recentComments: comments,
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

      ## Recent comments

      ### Sawyer · user · 2026-07-15T17:02:00.000Z

      Preserve the existing domain path.

      ### Worker · agent · 2026-07-15T17:03:00.000Z

      The schema study is complete.

      ## Report-back contract

      You are working on task TASK-1. Your thread is already attached. Use bb tasks comment TASK-1 --body ... for updates and attach result artifacts. Use bb tasks update TASK-1 --status in_review when required review remains; use done only when completion criteria are met.
      At meaningful milestones, write one short result or current-state sentence, a blank line, and up to three flat Markdown bullets. Use plain language, real newlines, and one idea per bullet. Aim for 40-80 words; shorter updates are valid. Combine related changes and omit unchanged updates or command-by-command pings.
      Keep material limits visible even if the update must be longer. State the outcome, next step, and any blocker or exact decision needed and its effect. Briefly state relevant checks, including unrun or blocked checks; distinguish worker-reported results from checks you verified.
      Keep logs, file lists, full commit hashes, internal IDs, and detailed handoff evidence in the attached thread or an artifact. Link to the detail with supported task/thread, PR, or attachment links. Preserve exact commits and baselines in handoffs.
      An epic reports overall progress, current work, and the next dependency or decision; summarize a child result's effect rather than copying its report. A subtask reports its own result, checks, and remaining work.
      Only the agent already responsible for a parent refreshes its summary when handling a child completion, blocker change, or decision. Read current task state before posting. Treat unavailable or conflicting state as unknown. Count only done children as done. Child done counts do not prove epic acceptance; name remaining integration or acceptance work.
      Use only already authorized handoff routes. These rules add no polling, wakeups, coordinator, or permission to dispatch, restructure tasks, or approve work. --notify still targets the latest responding agent, not necessarily the parent. Leave historical comments, descriptions, presets, and previously delivered prompts unchanged.
      See the Tasks skill Reporting section for examples and safe multiline posting. This guidance uses the existing CLI and requires no orchestration run; it is not a server-enforced comment limit.
      Follow task TASK-1, its linked specifications, acceptance criteria and applicable project instructions. Report explicit outcomes with native tasks_report using taskId 01J00000000000000000000002: completed, review_ready, blocked, failed or needs_decision. Use a stable retry key, a bounded summary, an explicit question for needs_decision, typed result/evidence references and baseline references. Keep the returned report/comment IDs in your final output. Reports can be made during an active turn; idle activity is not task completion. Reporting does not change task status. Set status explicitly with bb tasks update TASK-1 --status in_review or --status done only when your ticket gates are met. For CLI/RPC reporting, issue a private file with native tasks_report_context; never print or attach its contents. CLI thread IDs are not report authority. If native reporting is unavailable, state the transport blocker and use an ordinary Tasks comment without claiming a durable report. Your thread is attached to the task.

      ## Preset instructions

      Prefer focused changes.

      ## Additional instructions

      Run the backend gates.
      "
    `);
  });
});
