import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import { createStore, registerTasksApi } from "./index.js";
import { tasksRpcContract } from "../shared/contract.js";

function setup() {
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks",
    sdk: {
      threads: {
        get: async ({ threadId }) => {
          if (threadId === "thr_missing") throw new Error("thread_not_found");
          if (threadId === "thr_unavailable") throw new Error("offline");
          return makeThreadResponse({ id: threadId, title: "Worker", providerId: "codex" });
        },
      },
      providers: { list: async () => [{ id: "codex", displayName: "Codex", logoUrl: null }] },
    },
  });
  const store = createStore(bb);
  registerTasksApi(bb, store);
  const project = store.tasks.createProject({ name: "Activity", prefix: "ACT", color: "blue" });
  const task = store.tasks.createTask({ projectId: project.id, title: "Activity" });
  return { bb, harness, store, task, project };
}

describe("task activity read", () => {
  it.each([0, 1, 50])(
    "pairs %i ordered comments with only their metadata in one query",
    async (count) => {
      const { bb, harness, store, task, project } = setup();
      try {
        const comments = Array.from({ length: count }, (_, index) =>
          store.tasks.createComment({
            taskId: task.id,
            kind: index % 2 ? "agent" : "user",
            authorName: index % 2 ? "Worker" : "You",
            presetName: index % 2 ? "Reviewer" : null,
            threadId: index % 2 ? "thr_worker" : null,
            body: `Review ${index}`,
            notifiedCount: index % 2 ? 0 : 1,
          }),
        );
        for (const comment of comments.filter((_, index) => index % 5 === 0)) {
          store.tasks.createAttachment({
            commentId: comment.id,
            fileName: `${comment.id}.txt`,
            mime: "text/plain",
            sizeBytes: 10,
            blobPath: `private/${comment.id}`,
            isImage: false,
          });
        }
        const other = store.tasks.createTask({ projectId: project.id, title: "Other" });
        const foreign = store.tasks.createComment({
          taskId: other.id,
          kind: "user",
          authorName: "You",
          body: "Secret",
        });
        store.tasks.createAttachment({
          commentId: foreign.id,
          fileName: "foreign.txt",
          mime: "text/plain",
          sizeBytes: 5,
          blobPath: "private/foreign",
          isImage: false,
        });
        store.tasks.createAttachment({
          taskId: task.id,
          fileName: "description.txt",
          mime: "text/plain",
          sizeBytes: 5,
          blobPath: "private/description",
          isImage: false,
        });
        // Make insertion order, not generated id order, decide equal-time comments.
        bb.storage
          .database()
          .prepare("UPDATE comments SET created_at = ? WHERE task_id = ?")
          .run("2026-10-01T10:00:00.000Z", task.id);
        const prepare = vi.spyOn(bb.storage.database(), "prepare");
        const oldRead = vi.spyOn(store.tasks, "listAttachmentsForComment");
        const result = tasksRpcContract.getTaskActivity.output.parse(
          await harness.callRpc("getTaskActivity", { taskId: task.id }),
        );
        const attachmentQueries = prepare.mock.calls
          .map(([sql]) => sql)
          .filter((sql) => /FROM attachments/i.test(sql));
        expect(attachmentQueries).toHaveLength(1);
        expect(attachmentQueries[0]).toMatch(/JOIN comments/i);
        expect(attachmentQueries[0]).not.toMatch(/blob_path|SELECT \*/i);
        expect(oldRead).not.toHaveBeenCalled();
        expect(result.entries.map((entry) => entry.comment.id)).toEqual(
          comments.map((comment) => comment.id),
        );
        for (const [index, entry] of result.entries.entries()) {
          expect(entry.attachments).toHaveLength(index % 5 === 0 ? 1 : 0);
          for (const attachment of entry.attachments) {
            expect(attachment.commentId).toBe(entry.comment.id);
            expect(attachment.taskId).toBeNull();
            expect(Object.keys(attachment).sort()).toEqual(
              [
                "id",
                "taskId",
                "commentId",
                "fileName",
                "mime",
                "sizeBytes",
                "isImage",
                "createdAt",
              ].sort(),
            );
          }
        }
        expect(JSON.stringify(result)).not.toMatch(/private\/|foreign.txt|description.txt/);
        prepare.mockRestore();
        const legacy = tasksRpcContract.listComments.output.parse(
          await harness.callRpc("listComments", { taskId: task.id }),
        );
        expect(result.entries.map((entry) => entry.comment)).toEqual(legacy.comments);
        if (comments[0]) {
          const legacyAttachments = tasksRpcContract.listAttachments.output.parse(
            await harness.callRpc("listAttachments", { commentId: comments[0].id }),
          );
          expect(result.entries[0]?.attachments).toEqual(legacyAttachments.attachments);
        }
      } finally {
        await harness.dispose();
      }
    },
  );

  it("preserves system events and live missing/unavailable responder information", async () => {
    const { harness, store, task } = setup();
    try {
      for (const threadId of ["thr_worker", "thr_missing", "thr_unavailable", null]) {
        store.tasks.createComment({
          taskId: task.id,
          kind: "agent",
          authorName: "Worker",
          threadId,
          body: threadId ?? "Legacy",
        });
      }
      const system = store.tasks.createComment({
        taskId: task.id,
        kind: "system",
        authorName: "Tasks",
        body: "Status changed",
      });
      store.tasks.createAttachment({
        commentId: system.id,
        fileName: "system.txt",
        mime: "text/plain",
        sizeBytes: 1,
        blobPath: "private/system",
        isImage: false,
      });
      const result = tasksRpcContract.getTaskActivity.output.parse(
        await harness.callRpc("getTaskActivity", { taskId: task.id }),
      );
      expect(result.entries[0]?.comment).toMatchObject({
        threadTitle: "Worker",
        provider: { id: "codex", name: "Codex" },
      });
      for (const entry of result.entries.slice(1)) {
        expect(entry.comment.threadTitle).toBeNull();
        expect(entry.comment.provider).toBeNull();
      }
      expect(result.entries.at(-1)).toMatchObject({
        comment: { id: system.id, kind: "system" },
        attachments: [],
      });
    } finally {
      await harness.dispose();
    }
  });

  it("rejects a metadata failure instead of returning attachment-free entries", async () => {
    const { harness, store, task } = setup();
    try {
      vi.spyOn(store.tasks, "listActivityAttachments").mockImplementation(() => {
        throw new Error("Metadata unavailable");
      });
      await expect(harness.callRpc("getTaskActivity", { taskId: task.id })).rejects.toThrow(
        "Metadata unavailable",
      );
    } finally {
      await harness.dispose();
    }
  });
});
