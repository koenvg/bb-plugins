import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import { createStore, registerTasksApi } from ".";
import { registerTasksCli } from "../cli";
import { registerAttachments, saveAttachmentFromBytes } from "../attachments";
import { attachmentDownloadUrl } from "../shared/attachments";
import { tasksRpcContract } from "../shared/contract";

describe("removed comment operations", () => {
  it("omits RPCs and CLI discovery and rejects old operations without side effects", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks-plus" });
    const store = createStore(bb);
    registerTasksApi(bb, store);
    registerTasksCli(bb, store, { name: "Tasks", version: "0.1.2" });
    try {
      const project = store.tasks.createProject({ name: "Removal", prefix: "REM", color: "blue" });
      const task = store.tasks.createTask({ projectId: project.id, title: "Retained task" });
      const before = store.tasks.getTask(task.id);
      for (const method of ["createComment", "listComments", "getTaskActivity"]) {
        expect(tasksRpcContract).not.toHaveProperty(method);
        await expect(
          harness.callRpc(method, { taskId: task.id, body: "Old body", notify: true }),
        ).rejects.toThrow();
      }
      for (const method of ["updateTask", "boardMove"]) {
        await expect(
          harness.callRpc(method, { taskId: task.id, status: "in_progress", authorName: "Legacy" }),
        ).rejects.toThrow();
      }
      const old = await harness.runCli(["comment", task.key, "--body", "Old body", "--notify"]);
      expect(old.exitCode).not.toBe(0);
      const help = await harness.runCli(["--help"]);
      expect(help.exitCode).toBe(0);
      expect(help.stdout).not.toMatch(/\bcomments?\b/i);
      const detail = await harness.runCli(["show", task.key, "--json"]);
      expect(JSON.parse(detail.stdout)).not.toHaveProperty("comments");
      expect(store.tasks.getTask(task.id)).toEqual(before);
      expect(store.tasks.listTaskThreads(task.id)).toEqual([]);
      expect(harness.realtimeSignals).toEqual([]);
      expect(harness.sdk.callsTo("threads.send")).toEqual([]);
      expect(harness.sdk.callsTo("threads.spawn")).toEqual([]);
    } finally {
      await harness.dispose();
    }
  });

  it("rejects comment selectors in RPC, HTTP and CLI before file side effects", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "tasks-plus" });
    const store = createStore(bb);
    registerTasksApi(bb, store);
    registerAttachments(bb, store.tasks);
    registerTasksCli(bb, store, { name: "Tasks", version: "0.1.2" });
    try {
      const project = store.tasks.createProject({ name: "Removal", prefix: "REM", color: "blue" });
      const task = store.tasks.createTask({ projectId: project.id, title: "Owner" });
      const other = store.tasks.createTask({ projectId: project.id, title: "Other" });
      const file = await saveAttachmentFromBytes(store.tasks, Buffer.from("retained bytes"), {
        taskId: task.id,
        fileName: "retained.txt",
        mime: "text/plain",
      });
      harness.realtimeSignals.length = 0;
      const legacyId = "01HZZZZZZZZZZZZZZZZZZZZZC1";
      for (const input of [{ commentId: legacyId }, { taskId: task.id, commentId: legacyId }]) {
        await expect(harness.callRpc("listAttachments", input)).rejects.toThrow();
      }
      await expect(
        harness.callRpc("deleteAttachment", { attachmentId: file.id, commentId: legacyId }),
      ).rejects.toThrow();
      for (const selector of ["query", "header"] as const) {
        const query = selector === "query" ? "&commentId=" : "";
        const headers: Record<string, string> = selector === "header" ? { "x-comment-id": "" } : {};
        const upload = await harness.fetchHttp(
          "POST",
          `/attachments/upload?taskId=${task.id}&fileName=bad.txt${query}`,
          { body: "invalid", headers },
        );
        expect(upload.status).toBe(400);
        const removal = await harness.fetchHttp(
          "DELETE",
          `/attachments/delete?attachmentId=${file.id}${query}`,
          { headers },
        );
        expect(removal.status).toBe(400);
        const download = await harness.fetchHttp(
          "GET",
          `/attachments/download?attachmentId=${file.id}${query}`,
          { headers },
        );
        expect(download.status).toBe(400);
      }
      const oldOwner = await harness.runCli([
        "attachment",
        "add",
        legacyId,
        "--file",
        "/not-read.txt",
      ]);
      expect(oldOwner.exitCode).not.toBe(0);
      const oldOption = await harness.runCli([
        "attachment",
        "add",
        task.key,
        "--comment-id",
        legacyId,
        "--file",
        "/not-read.txt",
      ]);
      expect(oldOption.exitCode).not.toBe(0);
      expect(store.tasks.listAttachmentsForTask(task.id)).toEqual([file]);
      expect(store.tasks.listAttachmentsForTask(other.id)).toEqual([]);
      expect(harness.realtimeSignals).toEqual([]);
      expect(harness.sdk.callsTo("threads.send")).toEqual([]);
      const download = await harness.fetchHttp(
        "GET",
        attachmentDownloadUrl(file.id).split("/http")[1]!,
      );
      expect(download.status).toBe(200);
      expect(await download.text()).toBe("retained bytes");
    } finally {
      await harness.dispose();
    }
  });
  it.each(["legacy.md", "LEGACY.MD", "legacy.MarkDown", "LEGACY.MARKDOWN"])(
    "keeps migrated comment file %s readable and downloadable by its original saved ID",
    async (fileName) => {
      const { bb, harness } = createFakePluginHost({ pluginId: "tasks-plus" });
      const db = bb.storage.database();
      const schema = await readFile(
        new URL("../test-fixtures/pre-comment-removal.sql", import.meta.url),
        "utf8",
      );
      db.exec(schema);
      const taskId = "01HZZZZZZZZZZZZZZZZZZZZZT1";
      const fileId = "01HZZZZZZZZZZZZZZZZZZZZZA1";
      const text =
        "\uFEFF---\r\ntitle: legacy\r\n---\r\n\r\n# Legacy\r\n\r\n```text\r\n\tcode  \r\n```\r\n";
      const bytes = Buffer.from(text);
      db.exec(`INSERT INTO projects (id, name, prefix, color, created_at)
        VALUES ('01HZZZZZZZZZZZZZZZZZZZZZP1', 'Legacy', 'LEG', 'blue', 'created');
        INSERT INTO tasks (id, project_id, number, title, status, priority, position, created_at, updated_at)
        VALUES ('${taskId}', '01HZZZZZZZZZZZZZZZZZZZZZP1', 1, 'Retained', 'todo', 'none', 0, 'created', 'updated');
        INSERT INTO comments (id, task_id, kind, author_name, body, created_at)
        VALUES ('comment', '${taskId}', 'user', 'Operator', 'Removed body', 'created');
        INSERT INTO attachments VALUES
        ('${fileId}', NULL, 'comment', '${fileName}', 'application/octet-stream', ${bytes.length}, 'legacy.blob', 0, 'created');`);
      const database = db
        .prepare<[], { name: string; file: string }>("PRAGMA database_list")
        .all()
        .find((entry) => entry.name === "main")!;
      await writeFile(join(dirname(database.file), "legacy.blob"), bytes);
      try {
        const url = attachmentDownloadUrl(fileId).split("/http")[1]!;
        const store = createStore(bb);
        registerTasksApi(bb, store);
        const route = vi.spyOn(bb.http, "route");
        registerAttachments(bb, store.tasks);
        expect(route.mock.calls.find((call) => call[1] === "/attachments/preview")?.[3]).toEqual({
          auth: "local",
        });
        expect(db.prepare("SELECT version FROM schema_version WHERE version = 12").get()).toEqual({
          version: 12,
        });
        expect(
          db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%comment%'").all(),
        ).toEqual([]);
        expect(
          db
            .prepare<[], { name: string }>("PRAGMA table_info(attachments)")
            .all()
            .map((column) => column.name),
        ).not.toContain("comment_id");
        expect(db.prepare("SELECT * FROM attachments").get()).toEqual({
          id: fileId,
          task_id: taskId,
          file_name: fileName,
          mime: "application/octet-stream",
          size_bytes: bytes.length,
          blob_path: "legacy.blob",
          is_image: 0,
          created_at: "created",
        });
        const list = await harness.callRpc("listAttachments", { taskId });
        expect(list).toEqual({
          attachments: [
            {
              id: fileId,
              taskId,
              fileName,
              mime: "application/octet-stream",
              sizeBytes: bytes.length,
              isImage: false,
              createdAt: "created",
            },
          ],
        });
        expect(store.tasks.getAttachment(fileId)).not.toHaveProperty("commentId");
        const preview = await harness.fetchHttp(
          "GET",
          `/attachments/preview?attachmentId=${fileId}`,
        );
        expect(preview.status).toBe(200);
        expect(await preview.json()).toEqual({
          attachmentId: fileId,
          fileName,
          byteSize: bytes.length,
          text,
        });
        const response = await harness.fetchHttp("GET", url);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/octet-stream");
        expect(response.headers.get("content-disposition")).toBe(
          `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`,
        );
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
        expect(harness.sdk.callsTo("threads.send")).toEqual([]);
        expect(harness.sdk.callsTo("threads.spawn")).toEqual([]);
      } finally {
        vi.restoreAllMocks();
        await harness.dispose();
      }
    },
  );
});
