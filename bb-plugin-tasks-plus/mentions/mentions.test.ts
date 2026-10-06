import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";

import { createStore } from "../api";
import { registerMentions } from ".";
import {
  createAgentContextFixture,
  measureContext,
  mentionWrapper,
  wordCount,
} from "../agent-context-test-support";

function setup() {
  const { bb, harness } = createFakePluginHost({ pluginId: "tasks" });
  const store = createStore(bb);
  registerMentions(bb, store);
  const provider = harness.registrations.mentionProviders[0];
  if (!provider) throw new Error("task mention provider was not registered");
  return { bb, harness, provider, store };
}

describe("@task mention provider", () => {
  it("searches partial keys and title words, ranks the composer's linked project first, and caps results", async () => {
    const { bb, harness, provider, store } = setup();
    try {
      const linked = store.tasks.createProject({
        name: "Linked project",
        prefix: "TSK",
        color: "blue",
        linkedBbProjectId: "proj_linked",
      });
      const other = store.tasks.createProject({
        name: "Other project",
        prefix: "OPS",
        color: "red",
      });
      const linkedTask = store.tasks.createTask({
        projectId: linked.id,
        title: "Ship keyboard navigation",
        status: "in_progress",
      });
      const otherTask = store.tasks.createTask({
        projectId: other.id,
        title: "Ship keyboard shortcuts",
        status: "todo",
      });
      bb.storage
        .database()
        .prepare<[string, string]>("UPDATE tasks SET updated_at = ? WHERE id = ?")
        .run("2026-07-15T18:00:00.000Z", linkedTask.id);
      bb.storage
        .database()
        .prepare<[string, string]>("UPDATE tasks SET updated_at = ? WHERE id = ?")
        .run("2026-07-15T19:00:00.000Z", otherTask.id);

      expect(
        await provider.search({
          trigger: "@",
          query: "tsk-1",
          projectId: null,
          threadId: null,
        }),
      ).toEqual([
        expect.objectContaining({
          id: linkedTask.id,
          title: "TSK-1 · Ship keyboard navigation",
          subtitle: "Linked project · In Progress",
        }),
      ]);
      expect(
        await provider.search({
          trigger: "@",
          query: "1",
          projectId: null,
          threadId: null,
        }),
      ).toHaveLength(2);

      const recentTitleMatches = await provider.search({
        trigger: "@",
        query: "keyboard",
        projectId: null,
        threadId: null,
      });
      expect(recentTitleMatches.map((item) => item.id)).toEqual([otherTask.id, linkedTask.id]);

      const linkedTitleMatches = await provider.search({
        trigger: "@",
        query: "keyboard",
        projectId: "proj_linked",
        threadId: "thr_composer",
      });
      expect(linkedTitleMatches.map((item) => item.id)).toEqual([linkedTask.id, otherTask.id]);

      for (let index = 0; index < 12; index += 1) {
        store.tasks.createTask({
          projectId: other.id,
          title: `Recent task ${index}`,
        });
      }
      expect(
        await provider.search({
          trigger: "@",
          query: "",
          projectId: null,
          threadId: null,
        }),
      ).toHaveLength(10);
    } finally {
      await harness.dispose();
    }
  });

  it("resolves neutral context without fetching history or assigning task work", async () => {
    const fixture = createAgentContextFixture();
    const { harness, provider, store, task } = fixture;
    const reads = [
      vi.spyOn(store.tasks, "getProject"),
      vi.spyOn(store.tasks, "listLabelsForTask"),
      vi.spyOn(store.tasks, "listSubtasks"),
      vi.spyOn(store.tasks, "listComments"),
      vi.spyOn(store.tasks, "listTaskThreads"),
    ];
    try {
      const { context } = await provider.resolve(task.id);
      const wrapper = mentionWrapper(context, fixture);
      measureContext("mention", context, wrapper);
      expect(context).toContain(`# ${task.key} · ${task.title}`);
      expect(context).toContain(task.description);
      expect
        .soft(context.includes(`bb tasks show ${task.key} --json`), "current detail pointer")
        .toBe(true);
      expect.soft(wordCount(wrapper), "authored wrapper budget").toBeLessThanOrEqual(60);
      for (const excluded of [
        "Task details",
        "Sub-tasks",
        "Attachments",
        "Last 5 comments",
        "Attached threads",
        "Action contract",
        "Subtask sentinel",
        "Label sentinel",
        "task-sentinel.md",
        "old-comment-sentinel.md",
        "Comment sentinel",
        "thr_prior_sentinel",
        "bb tasks attach",
        "bb tasks comment",
        "bb tasks update",
      ]) {
        expect.soft(context.includes(excluded), `no ${excluded} context`).toBe(false);
      }
      for (const read of reads) expect.soft(read).not.toHaveBeenCalled();
    } finally {
      reads.forEach((read) => read.mockRestore());
      await harness.dispose();
    }
  });

  it("rejects an unknown task id", async () => {
    const { harness, provider } = setup();
    try {
      expect(() => provider.resolve("missing-task-id")).toThrow("Task not found: missing-task-id");
    } finally {
      await harness.dispose();
    }
  });
});
