// @vitest-environment jsdom
import { writeFile } from "node:fs/promises";
import { cpus, platform, arch } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cleanup, waitFor } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { expect, it, vi } from "vitest";
import { createStore, registerTasksApi } from "../../api/index.js";
import { tasksRpcContract, type TaskActivityEntry } from "../../shared/contract.js";
import { TasksRefreshProvider } from "../../shell/refresh.js";
import { TaskActivity } from "../../views/activity/task-activity.js";

interface ActivityFixture {
  activity: {
    comments: {
      authorKind: string;
      body: string;
      createdAt: string;
      attachments: { name: string; mimeType: string; content: string }[];
    }[];
  };
}
function distribution(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    samples: samples.length,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    worstMs: sorted.at(-1),
  };
}

it("measures the owned 50-comment fixture with real storage, activity RPC and editors", async () => {
  // Reuse BBP-60's Node-only fixture without adding it to the application bundle.
  const { createFixture } = (await import(
    pathToFileURL(resolve("scripts/navigation-benchmark/fixture.mjs")).href
  )) as {
    createFixture: (owner: string) => ActivityFixture;
  };
  const fixture = createFixture("bbp60-activity-read");
  const { bb, harness } = createFakePluginHost({
    pluginId: "tasks",
    sdk: {
      threads: {
        get: async ({ threadId }) =>
          makeThreadResponse({ id: threadId, title: "Review worker", providerId: "codex" }),
      },
      providers: { list: async () => [{ id: "codex", displayName: "Codex", logoUrl: null }] },
    },
  });
  const store = createStore(bb);
  registerTasksApi(bb, store);
  const project = store.tasks.createProject({
    name: "Owned activity fixture",
    prefix: "BENCH",
    color: "blue",
  });
  const task = store.tasks.createTask({ projectId: project.id, title: "Heavy activity" });
  try {
    for (const row of fixture.activity.comments) {
      const comment = store.tasks.createComment({
        taskId: task.id,
        kind: row.authorKind === "agent" ? "agent" : "user",
        authorName: row.authorKind === "agent" ? "Worker" : "You",
        threadId: row.authorKind === "agent" ? "thr_worker" : null,
        body: row.body,
      });
      bb.storage
        .database()
        .prepare("UPDATE comments SET created_at = ? WHERE id = ?")
        .run(row.createdAt, comment.id);
      for (const file of row.attachments)
        store.tasks.createAttachment({
          commentId: comment.id,
          fileName: file.name,
          mime: file.mimeType,
          sizeBytes: Buffer.byteLength(file.content),
          blobPath: `owned/${comment.id}`,
          isImage: false,
        });
    }
    const load = async () =>
      tasksRpcContract.getTaskActivity.output.parse(
        await harness.callRpc("getTaskActivity", { taskId: task.id }),
      );
    const legacyLoad = async () => {
      const { comments } = tasksRpcContract.listComments.output.parse(
        await harness.callRpc("listComments", { taskId: task.id }),
      );
      return Promise.all(
        comments.map(async (comment) => ({
          comment,
          attachments: tasksRpcContract.listAttachments.output.parse(
            await harness.callRpc("listAttachments", { commentId: comment.id }),
          ).attachments,
        })),
      );
    };
    for (let i = 0; i < 5; i += 1) {
      await load();
      await legacyLoad();
    }
    const currentTimes: number[] = [];
    const legacyTimes: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      let start = performance.now();
      const current = await load();
      currentTimes.push(performance.now() - start);
      start = performance.now();
      const legacy = await legacyLoad();
      legacyTimes.push(performance.now() - start);
      expect(current.entries).toEqual(legacy);
    }
    const prepare = vi.spyOn(bb.storage.database(), "prepare");
    const result = await load();
    const currentAttachmentQueries = prepare.mock.calls.filter(([sql]) =>
      /FROM attachments/i.test(sql),
    ).length;
    prepare.mockClear();
    await legacyLoad();
    const legacyAttachmentQueries = prepare.mock.calls.filter(([sql]) =>
      /FROM attachments/i.test(sql),
    ).length;
    prepare.mockRestore();
    expect(currentAttachmentQueries).toBe(1);
    expect(legacyAttachmentQueries).toBe(50);
    expect(result.entries).toHaveLength(50);
    expect(result.entries.flatMap((entry) => entry.attachments)).toHaveLength(10);

    const frontendTimes: number[] = [];
    const frontendReads: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      let reads = 0;
      let legacyReads = 0;
      const Root = () => (
        <TasksRefreshProvider>
          <TaskActivity taskId={task.id} />
        </TasksRefreshProvider>
      );
      const start = performance.now();
      const slot = renderSlot(
        { component: Root },
        {},
        {
          rpc: {
            getTaskActivity: async () => {
              reads += 1;
              return load();
            },
            listComments: () => {
              legacyReads += 1;
              return { comments: [] };
            },
            listAttachments: () => {
              legacyReads += 1;
              return { attachments: [] };
            },
            listTasks: () => ({ tasks: [] }),
            searchThreads: () => ({ threads: [] }),
          },
        },
      );
      await waitFor(() => expect(slot.container.querySelectorAll(".tiptap")).toHaveLength(51), {
        interval: 1,
      });
      expect(slot.getByRole("heading", { name: "Review 50" })).toBeTruthy();
      expect(slot.queryAllByRole("link", { name: /review-\d+\.txt/ })).toHaveLength(10);
      expect(slot.queryByRole("alert")).toBeNull();
      frontendTimes.push(performance.now() - start);
      frontendReads.push(reads);
      expect(reads).toBe(1);
      expect(legacyReads).toBe(0);
      cleanup();
    }
    const report = {
      environment: {
        node: process.version,
        platform: platform(),
        arch: arch(),
        cpu: cpus()[0]?.model,
      },
      fixture: { owner: "bbp60-activity-read", comments: 50, files: 10 },
      method:
        "In-memory SDK host and SQLite. API timing includes contract parsing and mocked live thread/provider reads. Current UI timing is jsdom mount to all 51 real Tiptap editors plus 10 file links; includes test query overhead, not browser paint or transport. No host activation or navigation speed claim.",
      activityRead: distribution(currentTimes),
      legacyLoader: distribution(legacyTimes),
      frontendMount: distribution(frontendTimes),
      frontendReads,
      requests: {
        currentActivity: 1,
        currentPerCommentAttachments: 0,
        legacyComments: 1,
        legacyPerCommentAttachments: 50,
      },
      attachmentQueries: { current: currentAttachmentQueries, legacy: legacyAttachmentQueries },
      responseBytes: Buffer.byteLength(JSON.stringify(result)),
    };
    if (process.env.BBP66_ACTIVITY_REPORT)
      await writeFile(process.env.BBP66_ACTIVITY_REPORT, JSON.stringify(report, null, 2) + "\n");
    // Keep the output type in the public contract rather than a benchmark-specific shape.
    const entries: TaskActivityEntry[] = result.entries;
    expect(entries.map((entry) => entry.comment.body)).toEqual(
      fixture.activity.comments.map((comment) => comment.body),
    );
  } finally {
    cleanup();
    await harness.dispose();
  }
});
