import { dirname, join } from "node:path";
import { stat } from "node:fs/promises";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import { createStore, registerTasksApi } from "./api";
import { registerAttachments, saveAttachmentFromBytes } from "./attachments";
import { registerTasksCli } from "./cli";
import { registerDelegation } from "./delegate";

async function setup(commentCount = 100) {
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks",
    sdk: {
      threads: {
        spawn: async () => ({ id: "thr_attachments" }),
        get: async () => makeThreadResponse({ id: "thr_attachments", status: "starting" }),
      },
      providers: { list: async () => [] },
    },
  });
  const store = createStore(bb);
  registerTasksApi(bb, store);
  registerAttachments(bb, store.tasks);
  registerTasksCli(bb, store, { name: "Tasks", version: "0.1.2" });
  registerDelegation(bb, store);
  const project = store.tasks.createProject({
    name: "Attachments",
    prefix: "ATT",
    color: "blue",
    linkedBbProjectId: "proj_attachments",
  });
  const task = store.tasks.createTask({ projectId: project.id, title: "Complete files" });
  const other = store.tasks.createTask({ projectId: project.id, title: "Other task" });
  const foreignProject = store.tasks.createProject({
    name: "Foreign",
    prefix: "EXT",
    color: "red",
  });
  const foreign = store.tasks.createTask({ projectId: foreignProject.id, title: "Foreign task" });
  const preset = store.tasks.createPreset({
    name: "Worker",
    providerId: "claude-code",
    modelId: "claude-sonnet-5",
    reasoningLevel: "high",
    serviceTier: "fast",
    permissionMode: "full",
    environmentKind: "project-default",
    baseBranch: null,
    machineId: null,
    instructions: "",
    builtin: false,
  });
  const add = async (owner: { taskId: string } | { commentId: string }, fileName: string) =>
    saveAttachmentFromBytes(store.tasks, Buffer.from(fileName), {
      ...owner,
      fileName,
      mime: "text/plain",
    });
  const comments = Array.from({ length: commentCount }, (_, index) =>
    store.tasks.createComment({
      id: String(commentCount - index).padStart(26, "0"),
      taskId: task.id,
      kind: index % 3 === 0 ? "system" : index % 3 === 1 ? "user" : "agent",
      authorName: "Author",
      body: `Comment ${index}`,
    }),
  );
  // Equal-time comments must retain insertion order, not comment id order.
  bb.storage
    .database()
    .prepare("UPDATE comments SET created_at = ? WHERE task_id = ?")
    .run("2026-10-01T00:00:00.000Z", task.id);
  for (const [index, comment] of comments.entries()) {
    if (index < 3 || index === commentCount - 1) {
      await add({ commentId: comment.id }, `comment-${index}.txt`);
      await add({ commentId: comment.id }, `comment-${index}-second.txt`);
    }
  }
  await add({ taskId: task.id }, "task.txt");
  await add({ taskId: task.id }, "task-second.txt");
  const excluded = [];
  for (const excludedTask of [other, foreign]) {
    const comment = store.tasks.createComment({
      taskId: excludedTask.id,
      kind: "system",
      authorName: "Tasks",
      body: "Other files",
    });
    excluded.push(await add({ taskId: excludedTask.id }, `${excludedTask.key}-task.txt`));
    excluded.push(await add({ commentId: comment.id }, `${excludedTask.key}-comment.txt`));
  }
  const expected = [
    ...store.tasks.listAttachmentsForTask(task.id),
    ...store.tasks
      .listComments(task.id)
      .flatMap((comment) => store.tasks.listAttachmentsForComment(comment.id)),
  ];
  const metadata = expected.map(({ blobPath: _blobPath, ...attachment }) => attachment);
  return { bb, harness, store, project, task, other, preset, expected, metadata, excluded };
}

function attachmentQueries(prepare: { mock: { calls: unknown[][] } }) {
  return prepare.mock.calls
    .map(([sql]) => String(sql))
    .filter((sql) => /FROM attachments/i.test(sql));
}

describe("complete task attachment enumeration", () => {
  it.each([0, 1, 100])(
    "reads %i comments in one joined query with opt-in blob paths",
    async (count) => {
      const { bb, harness, store, task, expected, metadata } = await setup(count);
      try {
        const prepare = vi.spyOn(bb.storage.database(), "prepare");
        expect(store.tasks.listTaskAttachments(task.id)).toEqual(metadata);
        const queries = attachmentQueries(prepare);
        expect(queries).toHaveLength(1);
        expect(queries[0]).toMatch(/JOIN comments/i);
        expect(queries[0]).not.toMatch(/blob_path|SELECT \*/i);
        const plan = bb.storage
          .database()
          .prepare<[string, string], { detail: string }>(`EXPLAIN QUERY PLAN ${queries[0]}`)
          .all(task.id, task.id)
          .map((row) => row.detail)
          .join("\n");
        expect(plan).toContain("idx_attachments_task");
        expect(plan).toContain("idx_attachments_comment");
        prepare.mockClear();
        expect(store.tasks.listTaskAttachments(task.id, { includeBlobPath: true })).toEqual(
          expected,
        );
        expect(attachmentQueries(prepare)).toHaveLength(1);
        expect(attachmentQueries(prepare)[0]).toMatch(/blob_path/i);
        expect(store.tasks.listTaskAttachments("missing")).toEqual([]);
      } finally {
        await harness.dispose();
      }
    },
  );

  it.each(["attachment list", "show"])(
    "preserves %s output without per-comment attachment reads",
    async (command) => {
      const { bb, harness, store, task, metadata } = await setup();
      try {
        const prepare = vi.spyOn(bb.storage.database(), "prepare");
        const oldRead = vi.spyOn(store.tasks, "listAttachmentsForComment");
        const result = await harness.behavior.runCli([...command.split(" "), task.key, "--json"]);
        expect(result.exitCode).toBe(0);
        expect(JSON.parse(result.stdout).attachments).toEqual(metadata);
        expect(attachmentQueries(prepare)).toHaveLength(1);
        expect(attachmentQueries(prepare)[0]).not.toMatch(/blob_path|SELECT \*/i);
        expect(oldRead).not.toHaveBeenCalled();
      } finally {
        await harness.dispose();
      }
    },
  );

  it("preserves delegation attachment context including system-comment files", async () => {
    const { bb, harness, store, task, preset, expected, excluded } = await setup();
    try {
      const prepare = vi.spyOn(bb.storage.database(), "prepare");
      const oldRead = vi.spyOn(store.tasks, "listAttachmentsForComment");
      await harness.behavior.callRpc("delegate", { taskId: task.id, presetId: preset.id });
      const { prompt } = harness.inspection.sdk.callsTo("threads.spawn")[0]![0] as {
        prompt: string;
      };
      const section = prompt.split("## Attachments\n\n")[1]?.split("\n\n## ")[0];
      expect(section).toBe(
        expected
          .map(
            (attachment) =>
              `- ${attachment.fileName} · ${attachment.id}\n  Fetch with: bb tasks attachment get ${attachment.id} --out <path>`,
          )
          .join("\n"),
      );
      for (const attachment of excluded) expect(prompt).not.toContain(attachment.id);
      for (const attachment of expected) expect(prompt).not.toContain(attachment.blobPath);
      expect(attachmentQueries(prepare)).toHaveLength(1);
      expect(attachmentQueries(prepare)[0]).not.toMatch(/blob_path|SELECT \*/i);
      expect(oldRead).not.toHaveBeenCalled();
    } finally {
      await harness.dispose();
    }
  });

  it.each(["task", "project"])(
    "removes all %s blobs and leaves unrelated files intact",
    async (scope) => {
      const { bb, harness, store, task, project, expected, excluded } = await setup();
      try {
        const database = bb.storage
          .database()
          .prepare<[], { name: string; file: string }>("PRAGMA database_list")
          .all()
          .find((entry) => entry.name === "main")!;
        const removed = scope === "task" ? expected : [...expected, ...excluded.slice(0, 2)];
        const retained = scope === "task" ? excluded : excluded.slice(2);
        const prepare = vi.spyOn(bb.storage.database(), "prepare");
        const oldRead = vi.spyOn(store.tasks, "listAttachmentsForComment");
        const result =
          scope === "task"
            ? await harness.behavior.callRpc("deleteTask", { taskId: task.id })
            : await harness.behavior.callRpc("deleteProject", {
                projectId: project.id,
                force: true,
              });
        expect(result).toMatchObject({ deleted: true });
        expect(attachmentQueries(prepare)).toHaveLength(scope === "task" ? 1 : 2);
        expect(oldRead).not.toHaveBeenCalled();
        for (const attachment of removed) {
          expect(store.tasks.getAttachment(attachment.id)).toBeUndefined();
          await expect(
            stat(dirname(join(dirname(database.file), attachment.blobPath))),
          ).rejects.toMatchObject({ code: "ENOENT" });
        }
        for (const attachment of retained) {
          expect(store.tasks.getAttachment(attachment.id)).toEqual(attachment);
          expect((await stat(join(dirname(database.file), attachment.blobPath))).isFile()).toBe(
            true,
          );
        }
      } finally {
        await harness.dispose();
      }
    },
  );
});
