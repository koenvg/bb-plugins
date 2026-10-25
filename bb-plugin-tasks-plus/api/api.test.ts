import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import { registerAttachments } from "../attachments";
import { attachmentDownloadUrl } from "../shared/attachments";
import { tasksRpcContract } from "../shared/contract";
import { createStore, registerTasksApi } from ".";
import { mockPrStatusRpc } from "../test-fixtures.js";

describe("Tasks RPC domain API", () => {
  it("correlates each successful update reply with its event and does not publish failures", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
    const store = createStore(bb);
    registerTasksApi(bb, store);
    const project = store.tasks.createProject({
      name: "Correlation",
      prefix: "COR",
      color: "blue",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Correlated",
      status: "todo",
    });
    const ids = new Set<string>();
    for (const status of ["in_progress", "done"] as const) {
      const result = tasksRpcContract.updateTask.output.parse(
        await harness.callRpc("updateTask", { taskId: task.id, status }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Update failed");
      expect(result.changeId).toEqual(expect.any(String));
      ids.add(result.changeId!);
      expect(harness.realtimeSignals.at(-1)).toEqual({
        channel: "tasks:changed",
        payload: { taskId: task.id, projectId: project.id, changeId: result.changeId },
      });
    }
    expect(ids.size).toBe(2);
    const signals = harness.realtimeSignals.length;
    await expect(
      harness.callRpc("updateTask", { taskId: task.id, parentTaskId: task.id }),
    ).resolves.toMatchObject({ ok: false });
    expect(harness.realtimeSignals).toHaveLength(signals);
    await harness.lifecycle.dispose();
  });

  it("counts unfinished top-level tasks once across projects", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
    const store = createStore(bb);
    registerTasksApi(bb, store);
    const mixed = store.tasks.createProject({
      name: "Mixed",
      prefix: "MIX",
      color: "blue",
    });
    const other = store.tasks.createProject({
      name: "Other",
      prefix: "OTH",
      color: "blue",
    });
    const empty = store.tasks.createProject({
      name: "Empty",
      prefix: "EMP",
      color: "blue",
    });
    for (const status of [
      "backlog",
      "todo",
      "in_progress",
      "in_review",
      "done",
      "canceled",
    ] as const) {
      const task = store.tasks.createTask({
        projectId: mixed.id,
        title: status,
        status,
      });
      const subtask = store.tasks.createTask({
        projectId: mixed.id,
        parentTaskId: task.id,
        title: `Unfinished subtask of ${status}`,
        status: "todo",
      });
      store.tasks.upsertTaskThread({
        taskId: subtask.id,
        threadId: `thr_subtask_${status}`,
        presetName: "Default",
        title: "Subtask worker",
        liveStatus: "working",
      });
      if (status === "todo" || status === "done" || status === "canceled") {
        store.tasks.upsertTaskThread({
          taskId: task.id,
          threadId: `thr_${status}`,
          presetName: "Default",
          title: "Worker",
          liveStatus: "working",
        });
      }
      if (status === "todo") {
        store.tasks.upsertTaskThread({
          taskId: task.id,
          threadId: "thr_second_todo_worker",
          presetName: "Default",
          title: "Second worker",
          liveStatus: "starting",
        });
      }
    }
    store.tasks.createTask({
      projectId: other.id,
      title: "Other project's unfinished task",
      status: "todo",
    });

    await expect(harness.behavior.callRpc("sidebarSummary", null)).resolves.toEqual({
      projects: [
        { projectId: empty.id, taskCount: 0, activeAgentCount: 0 },
        { projectId: mixed.id, taskCount: 4, activeAgentCount: 4 },
        { projectId: other.id, taskCount: 1, activeAgentCount: 0 },
      ],
    });
    await harness.lifecycle.dispose();
  });

  it.each(["done", "canceled"] as const)(
    "keeps a zero count and agent activity for a project with only %s tasks",
    async (status) => {
      const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
      const store = createStore(bb);
      registerTasksApi(bb, store);
      const project = store.tasks.createProject({
        name: "Finished",
        prefix: "FIN",
        color: "blue",
      });
      const task = store.tasks.createTask({
        projectId: project.id,
        title: "Finished parent",
        status,
      });
      store.tasks.createTask({
        projectId: project.id,
        parentTaskId: task.id,
        title: "Unfinished subtask",
        status: "todo",
      });
      store.tasks.upsertTaskThread({
        taskId: task.id,
        threadId: "thr_working",
        presetName: "Default",
        title: "Still working",
        liveStatus: "working",
      });

      await expect(harness.behavior.callRpc("sidebarSummary", null)).resolves.toEqual({
        projects: [{ projectId: project.id, taskCount: 0, activeAgentCount: 1 }],
      });
      await harness.lifecycle.dispose();
    },
  );

  it.each(["updateTask", "boardMove"] as const)(
    "refreshes summary counts after completing, canceling, and reopening through %s",
    async (method) => {
      const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
      harness.sdk.stub("threads.get", async ({ threadId }) =>
        makeThreadResponse({ id: threadId, environmentId: null }),
      );
      const store = createStore(bb);
      registerTasksApi(bb, store);
      const project = store.tasks.createProject({
        name: "Transitions",
        prefix: "TRN",
        color: "blue",
      });
      const task = store.tasks.createTask({
        projectId: project.id,
        title: "Changing status",
        status: "todo",
      });
      store.tasks.upsertTaskThread({
        taskId: task.id,
        threadId: "thr_working",
        presetName: "Default",
        title: "Still working",
        liveStatus: "working",
      });

      await expect(harness.behavior.callRpc("sidebarSummary", null)).resolves.toEqual({
        projects: [{ projectId: project.id, taskCount: 1, activeAgentCount: 1 }],
      });
      for (const [status, taskCount] of [
        ["done", 0],
        ["todo", 1],
        ["canceled", 0],
        ["in_review", 1],
      ] as const) {
        const signalsBefore = harness.inspection.realtimeSignals.length;
        await expect(
          harness.behavior.callRpc(method, { taskId: task.id, status }),
        ).resolves.toMatchObject({ ok: true, task: { status } });
        await expect(harness.behavior.callRpc("sidebarSummary", null)).resolves.toEqual({
          projects: [{ projectId: project.id, taskCount, activeAgentCount: 1 }],
        });
        await expect(
          harness.behavior.callRpc("listTasks", { projectId: project.id }),
        ).resolves.toMatchObject({ tasks: [{ id: task.id, status }] });
        expect(harness.inspection.realtimeSignals.slice(signalsBefore)).toContainEqual({
          channel: "tasks:changed",
          payload: {
            taskId: task.id,
            projectId: project.id,
            ...(method === "updateTask" ? { changeId: expect.any(String) } : {}),
          },
        });
      }
      await harness.lifecycle.dispose();
    },
  );

  it("deletes through the typed RPC policy and rejects saved-description references", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
    const store = createStore(bb);
    registerAttachments(bb, store.tasks);
    registerTasksApi(bb, store);
    const project = store.tasks.createProject({
      name: "Attachments",
      prefix: "ATT",
      color: "blue",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Referenced image",
    });
    const uploaded = await harness.fetchHttp(
      "POST",
      `/attachments/upload?taskId=${task.id}&fileName=diagram.png&mime=image%2Fpng`,
      { body: "image", headers: { "content-type": "image/png" } },
    );
    const { attachmentId } = (await uploaded.json()) as {
      attachmentId: string;
    };
    store.tasks.updateTask(task.id, {
      description: `![diagram](${attachmentDownloadUrl(attachmentId)})`,
    });
    const signalsBeforeConflict = harness.realtimeSignals.length;

    const conflict = tasksRpcContract.deleteAttachment.output.parse(
      await harness.callRpc("deleteAttachment", { attachmentId }),
    );
    expect(conflict).toEqual({
      ok: false,
      error: {
        code: "attachment_referenced",
        message:
          'Attachment "diagram.png" is used in the task description. Remove it from the description before deleting the attachment.',
      },
    });
    expect(store.tasks.getAttachment(attachmentId)).toBeDefined();
    expect(harness.realtimeSignals).toHaveLength(signalsBeforeConflict);

    const deleted = tasksRpcContract.deleteAttachment.output.parse(
      await harness.callRpc("deleteAttachment", {
        attachmentId,
        removeDescriptionReferences: true,
      }),
    );
    expect(deleted).toMatchObject({
      ok: true,
      deleted: true,
      attachment: { id: attachmentId },
    });
    expect(store.tasks.getAttachment(attachmentId)).toBeUndefined();
    expect(store.tasks.getTask(task.id)?.description).toBe("");
    expect(harness.realtimeSignals.at(-1)).toEqual({
      channel: "tasks:changed",
      payload: { taskId: task.id, projectId: project.id, resource: "attachments" },
    });

    await expect(harness.callRpc("deleteAttachment", { attachmentId })).resolves.toEqual({
      ok: true,
      deleted: false,
      attachment: null,
    });
    await harness.dispose();
  });

  it("lists bb workspace projects as id/name options", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks",
      sdk: {
        projects: {
          list: async () => [
            { id: "proj_personal", name: "Personal", extra: "dropped" },
            { id: "proj_bb", name: "bb" },
          ],
        },
      },
    });
    registerTasksApi(bb, createStore(bb));

    const result = tasksRpcContract.listBbProjects.output.parse(
      await harness.callRpc("listBbProjects", null),
    );
    expect(result.bbProjects).toEqual([
      { id: "proj_personal", name: "Personal" },
      { id: "proj_bb", name: "bb" },
    ]);
    expect(harness.sdk.callsTo("projects.list")).toEqual([[{ includePersonal: true }]]);
    await harness.dispose();
  });

  it("lists machines as id/name options from the BB SDK", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks",
      sdk: {
        hosts: {
          list: async () => [
            {
              id: "host_primary",
              name: "Sawyer Air",
              status: "connected",
            },
            {
              id: "host_remote",
              name: "Build box",
              status: "disconnected",
            },
          ],
        },
      },
    });
    registerTasksApi(bb, createStore(bb));

    await expect(harness.callRpc("listMachines", {})).resolves.toEqual({
      machines: [
        { id: "host_primary", name: "Sawyer Air" },
        { id: "host_remote", name: "Build box" },
      ],
    });
    expect(harness.sdk.callsTo("hosts.list")).toEqual([[]]);

    await harness.dispose();
  });

  it("searches threads and returns recent threads in updated order", async () => {
    const thread = (
      id: string,
      title: string | null,
      titleFallback: string | null,
      updatedAt: number,
      status: string,
    ) => ({ id, title, titleFallback, updatedAt, status });
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks",
      sdk: {
        threads: {
          search: async () => ({
            active: {
              results: [
                {
                  thread: thread("thr_old", "Old match", null, 10, "idle"),
                },
                {
                  thread: thread("thr_new", null, "New fallback", 30, "active"),
                },
              ],
            },
            archived: {
              results: [
                {
                  thread: thread("thr_middle", "Middle match", null, 20, "error"),
                },
              ],
            },
          }),
          list: async () => [
            thread("thr_recent_old", "Recent old", null, 40, "idle"),
            thread("thr_recent_new", null, "Recent new", 50, "starting"),
          ],
        },
      },
    });
    registerTasksApi(bb, createStore(bb));

    await expect(harness.callRpc("searchThreads", { query: "match", limit: 2 })).resolves.toEqual({
      threads: [
        { id: "thr_new", title: "New fallback", status: "active" },
        { id: "thr_middle", title: "Middle match", status: "error" },
      ],
    });
    await expect(harness.callRpc("searchThreads", { query: "" })).resolves.toEqual({
      threads: [
        { id: "thr_recent_new", title: "Recent new", status: "starting" },
        { id: "thr_recent_old", title: "Recent old", status: "idle" },
      ],
    });
    expect(harness.sdk.callsTo("threads.search")).toEqual([
      [{ query: "match", limitPerGroup: "10" }],
    ]);
    expect(harness.sdk.callsTo("threads.list")).toEqual([[{ limit: 10 }]]);
    await harness.dispose();
  });

  it("removes task and comment attachment blobs when deleting a task", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
    const store = createStore(bb);
    registerTasksApi(bb, store);
    registerAttachments(bb, store.tasks);
    const project = store.tasks.createProject({
      name: "Cleanup",
      prefix: "CLN",
      color: "blue",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Delete blobs",
    });

    try {
      const taskUpload = await harness.fetchHttp(
        "POST",
        `/attachments/upload?taskId=${task.id}&fileName=task.txt&mime=text%2Fplain`,
        { body: "task blob", headers: { "content-type": "text/plain" } },
      );
      const commentUpload = await harness.fetchHttp(
        "POST",
        `/attachments/upload?taskId=${task.id}&fileName=comment.txt&mime=text%2Fplain`,
        { body: "comment blob", headers: { "content-type": "text/plain" } },
      );
      const taskAttachmentId = ((await taskUpload.json()) as { attachmentId: string }).attachmentId;
      const retainedAttachmentId = ((await commentUpload.json()) as { attachmentId: string })
        .attachmentId;
      const taskAttachment = store.tasks.getAttachment(taskAttachmentId);
      const retainedAttachment = store.tasks.getAttachment(retainedAttachmentId);
      if (!taskAttachment || !retainedAttachment) {
        throw new Error("attachment rows were not created");
      }
      const database = bb.storage
        .database()
        .prepare<[], { name: string; file: string }>("PRAGMA database_list")
        .all()
        .find((entry) => entry.name === "main");
      if (!database) throw new Error("test database path is missing");
      const blobDirectories = [taskAttachment, retainedAttachment].map((attachment) =>
        dirname(join(dirname(database.file), attachment.blobPath)),
      );

      await expect(harness.callRpc("deleteTask", { taskId: task.id })).resolves.toEqual({
        deleted: true,
      });
      for (const blobDirectory of blobDirectories) {
        await expect(stat(blobDirectory)).rejects.toMatchObject({
          code: "ENOENT",
        });
      }
    } finally {
      await harness.dispose();
    }
  });

  it("removes attachment blobs when force-deleting a project", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
    const store = createStore(bb);
    registerTasksApi(bb, store);
    registerAttachments(bb, store.tasks);
    const project = store.tasks.createProject({
      name: "Project cleanup",
      prefix: "PRJ",
      color: "blue",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Delete project blobs",
    });

    try {
      const upload = await harness.fetchHttp(
        "POST",
        `/attachments/upload?taskId=${task.id}&fileName=project.txt&mime=text%2Fplain`,
        { body: "project blob", headers: { "content-type": "text/plain" } },
      );
      const attachmentId = ((await upload.json()) as { attachmentId: string }).attachmentId;
      const attachment = store.tasks.getAttachment(attachmentId);
      if (!attachment) throw new Error("attachment row was not created");
      const database = bb.storage
        .database()
        .prepare<[], { name: string; file: string }>("PRAGMA database_list")
        .all()
        .find((entry) => entry.name === "main");
      if (!database) throw new Error("test database path is missing");
      const blobDirectory = dirname(join(dirname(database.file), attachment.blobPath));

      await expect(
        harness.callRpc("deleteProject", {
          projectId: project.id,
          force: true,
        }),
      ).resolves.toEqual({ ok: true, deleted: true });
      await expect(stat(blobDirectory)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await harness.dispose();
    }
  });

  it("runs the project and task flow with comments, filtering, summary SQL, and invalidations", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
    const store = createStore(bb);
    registerTasksApi(bb, store);

    const projectResult = tasksRpcContract.createProject.output.parse(
      await harness.callRpc("createProject", {
        name: "Plugin",
        prefix: "PLUG",
        color: "blue",
      }),
    );
    const project = projectResult.project;
    const labelResult = tasksRpcContract.createLabel.output.parse(
      await harness.callRpc("createLabel", {
        projectId: project.id,
        name: "Backend",
        color: "green",
      }),
    );

    const createResult = tasksRpcContract.createTask.output.parse(
      await harness.callRpc("createTask", {
        projectId: project.id,
        title: "Ship domain API",
      }),
    );
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) throw new Error(createResult.error.message);

    const updateResult = tasksRpcContract.updateTask.output.parse(
      await harness.callRpc("updateTask", {
        taskId: createResult.task.id,
        status: "in_review",
        priority: "high",
        dueDate: "2026-07-20",
        labelIds: [labelResult.label.id],
      }),
    );
    expect(updateResult).toMatchObject({
      ok: true,
      task: { status: "in_review" },
    });
    expect(
      bb.storage.database().prepare("SELECT name FROM sqlite_master WHERE name = 'comments'").all(),
    ).toEqual([]);

    const moveResult = tasksRpcContract.boardMove.output.parse(
      await harness.callRpc("boardMove", {
        taskId: createResult.task.id,
        status: "done",
      }),
    );
    expect(moveResult).toMatchObject({ ok: true, task: { status: "done" } });

    store.tasks.upsertTaskThread({
      taskId: createResult.task.id,
      threadId: "thr_worker",
      presetName: "Default",
      title: "Implement API",
      liveStatus: "working",
    });

    const listResult = tasksRpcContract.listTasks.output.parse(
      await harness.callRpc("listTasks", {
        projectId: project.id,
        statuses: ["done"],
      }),
    );
    expect(listResult.tasks).toEqual([
      expect.objectContaining({
        id: createResult.task.id,
        key: "PLUG-1",
        status: "done",
        labelIds: [labelResult.label.id],
      }),
    ]);

    const subtask = store.tasks.createTask({
      projectId: project.id,
      parentTaskId: createResult.task.id,
      title: "Nested implementation detail",
    });
    store.tasks.upsertTaskThread({
      taskId: subtask.id,
      threadId: "thr_subtask_worker",
      presetName: "Default",
      title: "Implement nested detail",
      liveStatus: "working",
    });
    store.tasks.createTask({
      projectId: project.id,
      title: "Open top-level follow-up",
      status: "todo",
    });
    store.tasks.createTask({
      projectId: project.id,
      title: "Canceled top-level follow-up",
      status: "canceled",
    });

    const openCount = tasksRpcContract.sidebarOpenTaskCount.output.parse(
      await harness.callRpc("sidebarOpenTaskCount", null),
    );
    expect(openCount).toEqual({ openTaskCount: 2 });

    const summary = tasksRpcContract.sidebarSummary.output.parse(
      await harness.callRpc("sidebarSummary", null),
    );
    expect(summary).toEqual({
      projects: [
        {
          projectId: project.id,
          taskCount: 1,
          activeAgentCount: 1,
        },
      ],
    });
    await expect(harness.callRpc("deleteProject", { projectId: project.id })).resolves.toEqual({
      ok: false,
      error: {
        code: "project_not_empty",
        message:
          "A project must be empty before it can be deleted; pass force: true to delete its tasks",
      },
    });
    expect(harness.realtimeSignals).toEqual(
      expect.arrayContaining([
        {
          channel: "projects:changed",
          payload: { projectId: project.id },
        },
        {
          channel: "tasks:changed",
          payload: { taskId: createResult.task.id, projectId: project.id },
        },
      ]),
    );

    await expect(
      harness.callRpc("updateProject", {
        projectId: project.id,
        prefix: "NEW",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });

    await harness.dispose();
  });

  it("resolves task keys case-insensitively and degrades bad keys to null", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
    const store = createStore(bb);
    registerTasksApi(bb, store);
    const project = store.tasks.createProject({
      name: "Plugin",
      prefix: "PLUG",
      color: "blue",
    });
    const label = store.tasks.createLabel({
      projectId: project.id,
      name: "Backend",
      color: "green",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Ship task embeds",
    });
    store.tasks.addTaskLabel(task.id, label.id);

    const found = tasksRpcContract.getTaskByKey.output.parse(
      await harness.callRpc("getTaskByKey", { taskKey: task.key }),
    );
    expect(found.task).toMatchObject({
      id: task.id,
      key: task.key,
      labelIds: [label.id],
    });

    const caseInsensitive = tasksRpcContract.getTaskByKey.output.parse(
      await harness.callRpc("getTaskByKey", {
        taskKey: task.key.toLowerCase(),
      }),
    );
    expect(caseInsensitive.task?.id).toBe(task.id);

    for (const taskKey of ["PLUG-999", "NOPE-1", "not a key", "PLUG-"]) {
      const missing = tasksRpcContract.getTaskByKey.output.parse(
        await harness.callRpc("getTaskByKey", { taskKey }),
      );
      expect(missing.task).toBeNull();
    }
  });

  it("returns the API tasks linked to a thread and an empty list for an unlinked thread", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
    const store = createStore(bb);
    registerTasksApi(bb, store);
    const project = store.tasks.createProject({
      name: "Header",
      prefix: "HDR",
      color: "blue",
    });
    const label = store.tasks.createLabel({
      projectId: project.id,
      name: "UI",
      color: "green",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Show the task chip",
      status: "in_review",
    });
    store.tasks.addTaskLabel(task.id, label.id);
    store.tasks.upsertTaskThread({
      taskId: task.id,
      threadId: "thr_header",
      presetName: "Default",
      title: "Header work",
      liveStatus: "working",
    });

    const linked = tasksRpcContract.getTasksForThread.output.parse(
      await harness.callRpc("getTasksForThread", { threadId: "thr_header" }),
    );
    expect(linked.tasks).toEqual([
      expect.objectContaining({
        id: task.id,
        key: task.key,
        status: "in_review",
        labelIds: [label.id],
      }),
    ]);

    const unlinked = tasksRpcContract.getTasksForThread.output.parse(
      await harness.callRpc("getTasksForThread", { threadId: "thr_none" }),
    );
    expect(unlinked.tasks).toEqual([]);
  });

  it("returns a typed error when a task would exceed one sub-task level", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
    registerTasksApi(bb, createStore(bb));

    const projectResult = tasksRpcContract.createProject.output.parse(
      await harness.callRpc("createProject", {
        name: "Depth",
        prefix: "DEP",
        color: "purple",
      }),
    );
    const parentResult = tasksRpcContract.createTask.output.parse(
      await harness.callRpc("createTask", {
        projectId: projectResult.project.id,
        title: "Parent",
      }),
    );
    if (!parentResult.ok) throw new Error(parentResult.error.message);
    const childResult = tasksRpcContract.createTask.output.parse(
      await harness.callRpc("createTask", {
        projectId: projectResult.project.id,
        title: "Child",
        parentTaskId: parentResult.task.id,
      }),
    );
    if (!childResult.ok) throw new Error(childResult.error.message);

    await expect(
      harness.callRpc("createTask", {
        projectId: projectResult.project.id,
        title: "Grandchild",
        parentTaskId: childResult.task.id,
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "subtask_depth_exceeded",
        message: "Tasks support at most one level of sub-tasks",
      },
    });

    await harness.dispose();
  });

  it("allows legacy built-in rows to be renamed and deleted", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
    const store = createStore(bb);
    registerTasksApi(bb, store);
    const preset = store.tasks.createPreset({
      name: "Sonnet · high",
      providerId: "claude-code",
      modelId: "claude-sonnet-5",
      reasoningLevel: "high",
      serviceTier: null,
      permissionMode: "full",
      environmentKind: "project-default",
      baseBranch: null,
      machineId: null,
      instructions: "",
      builtin: true,
    });

    const updated = await harness.callRpc("updatePreset", {
      presetId: preset.id,
      name: "Renamed",
      modelId: "claude-sonnet-6",
      permissionMode: "accept-edits",
    });
    expect(updated).toMatchObject({
      preset: {
        name: "Renamed",
        modelId: "claude-sonnet-6",
        permissionMode: "accept-edits",
        builtin: true,
      },
    });
    await expect(harness.callRpc("deletePreset", { presetId: preset.id })).resolves.toEqual({
      deleted: true,
    });
    expect(store.tasks.getPreset(preset.id)).toBeUndefined();

    await harness.dispose();
  });

  it("resolves task pull requests from environment metadata, deduped by URL", async () => {
    const pullRequestsByEnvironment: Record<string, PullRequestLookup> = {
      env_shared: {
        outcome: "available",
        pullRequest: makePullRequest({
          number: 12,
          url: "https://github.com/acme/bb/pull/12",
          state: "open",
          updatedAt: "2026-07-15T10:00:00.000Z",
        }),
      },
      env_merged: {
        outcome: "available",
        pullRequest: makePullRequest({
          number: 9,
          title: "Older merged work",
          url: "https://github.com/acme/bb/pull/9",
          state: "merged",
          updatedAt: "2026-07-16T09:00:00.000Z",
        }),
      },
      env_no_pr: { outcome: "absent" },
    };
    const environmentByThread: Record<string, string | null> = {
      thr_writer00: "env_shared",
      thr_reviewer0: "env_shared",
      thr_merger000: "env_merged",
      thr_no_env000: null,
      thr_no_pr0000: "env_no_pr",
    };
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks",
      sdk: {
        threads: {
          get: async ({ threadId }: { threadId: string }) => {
            if (threadId === "thr_deleted00") {
              throw new Error("thread_not_found");
            }
            return makeThreadResponse({
              id: threadId,
              environmentId: environmentByThread[threadId] ?? null,
            });
          },
        },
        plugins: {
          callRpc: mockPrStatusRpc(
            async ({ environmentId }) => pullRequestsByEnvironment[environmentId]!,
          ),
        },
      },
    });
    const store = createStore(bb);
    registerTasksApi(bb, store);
    const project = store.tasks.createProject({
      name: "PRs",
      prefix: "PR",
      color: "blue",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Ship it",
    });
    for (const threadId of [...Object.keys(environmentByThread), "thr_deleted00"]) {
      store.tasks.upsertTaskThread({
        taskId: task.id,
        threadId,
        presetName: "Default",
        title: threadId,
        liveStatus: "working",
      });
    }

    const result = tasksRpcContract.listTaskPullRequests.output.parse(
      await harness.callRpc("listTaskPullRequests", { taskId: task.id }),
    );

    expect(
      result.pullRequests.map((pullRequest) => ({
        ...pullRequest,
        threadIds: [...pullRequest.threadIds].sort(),
      })),
    ).toEqual([
      {
        url: "https://github.com/acme/bb/pull/9",
        number: 9,
        title: "Older merged work",
        state: "merged",
        updatedAt: "2026-07-16T09:00:00.000Z",
        threadIds: ["thr_merger000"],
      },
      {
        url: "https://github.com/acme/bb/pull/12",
        number: 12,
        title: "Fix the pill",
        state: "open",
        updatedAt: "2026-07-15T10:00:00.000Z",
        threadIds: ["thr_reviewer0", "thr_writer00"],
      },
    ]);
    expect(result.unavailableThreadIds).toEqual(["thr_deleted00"]);
    expect(
      harness.sdk
        .callsTo("plugins.callRpc")
        .map(([args]) => (args as { input: { keys: string[] } }).input.keys[0])
        .sort(),
    ).toEqual(["env_merged", "env_no_pr", "env_shared"]);

    await harness.dispose();
  });

  it("separates unavailable lookups (auth failure, crash) from genuine absence", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks",
      sdk: {
        threads: {
          get: async ({ threadId }: { threadId: string }) =>
            makeThreadResponse({
              id: threadId,
              environmentId:
                threadId === "thr_absent000"
                  ? "env_absent"
                  : threadId === "thr_crash0000"
                    ? "env_crash"
                    : "env_no_auth",
            }),
        },
        plugins: {
          callRpc: mockPrStatusRpc(
            async ({ environmentId }: { environmentId: string }): Promise<PullRequestLookup> => {
              if (environmentId === "env_absent") return { outcome: "absent" };
              if (environmentId === "env_crash") {
                throw new Error("host offline");
              }
              return {
                outcome: "unavailable",
                message: "gh pr view failed: authentication required",
              };
            },
          ),
        },
      },
    });
    const store = createStore(bb);
    registerTasksApi(bb, store);
    const project = store.tasks.createProject({
      name: "PRs",
      prefix: "PR",
      color: "blue",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Ship it",
    });
    for (const threadId of ["thr_no_auth00", "thr_no_auth01", "thr_absent000", "thr_crash0000"]) {
      store.tasks.upsertTaskThread({
        taskId: task.id,
        threadId,
        presetName: "Default",
        title: threadId,
        liveStatus: "working",
      });
    }

    const result = tasksRpcContract.listTaskPullRequests.output.parse(
      await harness.callRpc("listTaskPullRequests", { taskId: task.id }),
    );
    expect(result.pullRequests).toEqual([]);
    expect([...result.unavailableThreadIds].sort()).toEqual([
      "thr_crash0000",
      "thr_no_auth00",
      "thr_no_auth01",
    ]);

    await harness.dispose();
  });

  it("overlaps distinct environment lookups while deduplicating shared ones", async () => {
    const resolvers = new Map<string, (lookup: PullRequestLookup) => void>();
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks",
      sdk: {
        threads: {
          get: async ({ threadId }: { threadId: string }) =>
            makeThreadResponse({
              id: threadId,
              environmentId: threadId === "thr_beta00000" ? "env_b" : "env_a",
            }),
        },
        plugins: {
          callRpc: mockPrStatusRpc(
            ({ environmentId }) =>
              new Promise<PullRequestLookup>((resolve) => {
                resolvers.set(environmentId, resolve);
              }),
          ),
        },
      },
    });
    const store = createStore(bb);
    registerTasksApi(bb, store);
    const project = store.tasks.createProject({
      name: "PRs",
      prefix: "PR",
      color: "blue",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Ship it",
    });
    for (const threadId of ["thr_alpha0000", "thr_alpha0001", "thr_beta00000"]) {
      store.tasks.upsertTaskThread({
        taskId: task.id,
        threadId,
        presetName: "Default",
        title: threadId,
        liveStatus: "working",
      });
    }

    const resultPromise = harness.callRpc("listTaskPullRequests", {
      taskId: task.id,
    });
    await vi.waitFor(() => {
      expect([...resolvers.keys()].sort()).toEqual(["env_a", "env_b"]);
    });
    expect(harness.sdk.callsTo("plugins.callRpc")).toHaveLength(2);

    resolvers.get("env_a")!({
      outcome: "available",
      pullRequest: makePullRequest({
        number: 21,
        url: "https://github.com/acme/bb/pull/21",
      }),
    });
    resolvers.get("env_b")!({ outcome: "absent" });

    const result = tasksRpcContract.listTaskPullRequests.output.parse(await resultPromise);
    expect(result.pullRequests).toHaveLength(1);
    expect(result.pullRequests[0]).toMatchObject({ number: 21 });
    expect([...result.pullRequests[0]!.threadIds].sort()).toEqual([
      "thr_alpha0000",
      "thr_alpha0001",
    ]);
    expect(harness.sdk.callsTo("plugins.callRpc")).toHaveLength(2);

    await harness.dispose();
  });

  it("keeps the freshest payload when two environments share a PR URL", async () => {
    const lookupByEnvironment: Record<string, PullRequestLookup> = {
      env_stale: {
        outcome: "available",
        pullRequest: makePullRequest({
          number: 30,
          title: "Before merge",
          state: "open",
          url: "https://github.com/acme/bb/pull/30",
          updatedAt: "2026-07-15T08:00:00.000Z",
        }),
      },
      env_fresh: {
        outcome: "available",
        pullRequest: makePullRequest({
          number: 30,
          title: "After merge",
          state: "merged",
          url: "https://github.com/acme/bb/pull/30",
          updatedAt: "2026-07-16T12:00:00.000Z",
        }),
      },
    };
    const { bb, harness } = createFakePluginHost({
      pluginId: "tasks",
      sdk: {
        threads: {
          get: async ({ threadId }: { threadId: string }) =>
            makeThreadResponse({
              id: threadId,
              environmentId: threadId === "thr_stale0000" ? "env_stale" : "env_fresh",
            }),
        },
        plugins: {
          callRpc: mockPrStatusRpc(
            async ({ environmentId }) => lookupByEnvironment[environmentId]!,
          ),
        },
      },
    });
    const store = createStore(bb);
    registerTasksApi(bb, store);
    const project = store.tasks.createProject({
      name: "PRs",
      prefix: "PR",
      color: "blue",
    });
    const task = store.tasks.createTask({
      projectId: project.id,
      title: "Ship it",
    });
    for (const threadId of ["thr_stale0000", "thr_fresh0000"]) {
      store.tasks.upsertTaskThread({
        taskId: task.id,
        threadId,
        presetName: "Default",
        title: threadId,
        liveStatus: "working",
      });
    }

    const result = tasksRpcContract.listTaskPullRequests.output.parse(
      await harness.callRpc("listTaskPullRequests", { taskId: task.id }),
    );
    expect(
      result.pullRequests.map((pullRequest) => ({
        ...pullRequest,
        threadIds: [...pullRequest.threadIds].sort(),
      })),
    ).toEqual([
      {
        url: "https://github.com/acme/bb/pull/30",
        number: 30,
        title: "After merge",
        state: "merged",
        updatedAt: "2026-07-16T12:00:00.000Z",
        threadIds: ["thr_fresh0000", "thr_stale0000"],
      },
    ]);

    await harness.dispose();
  });
});

type PullRequestLookup =
  | { outcome: "available"; pullRequest: ReturnType<typeof makePullRequest> }
  | { outcome: "absent" }
  | { outcome: "unavailable"; message: string };

function makePullRequest(
  overrides: Partial<{
    number: number;
    title: string;
    state: "open" | "draft" | "merged" | "closed";
    url: string;
    updatedAt: string;
  }> = {},
) {
  return {
    number: 12,
    title: "Fix the pill",
    state: "open" as const,
    url: "https://github.com/acme/bb/pull/12",
    baseRefName: "main",
    headRefName: "bb/fix-the-pill",
    updatedAt: "2026-07-15T10:00:00.000Z",
    checks: {
      state: "passing" as const,
      totalCount: 1,
      passedCount: 1,
      failedCount: 0,
      pendingCount: 0,
    },
    review: { state: "none" as const, reviewRequestCount: 0 },
    mergeability: {
      state: "mergeable" as const,
      mergeStateStatus: null,
      mergeable: null,
    },
    attention: "none" as const,
    ...overrides,
  };
}
