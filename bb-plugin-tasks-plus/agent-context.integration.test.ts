import { describe, expect, it } from "vitest";
import { createAgentContextFixture } from "./agent-context-test-support";

describe("task context and on-demand details", () => {
  it("keeps history, old comment files and links available without read or comment side effects", async () => {
    const {
      harness,
      store,
      provider,
      task,
      preset,
      extraInstructions,
      comments,
      taskAttachment,
      commentAttachment,
      blocker,
      subtask,
      label,
    } = createAgentContextFixture();
    try {
      const beforeMention = store.tasks.getTask(task.id);
      const linksBeforeMention = store.tasks.listTaskThreads(task.id);
      const { context } = await provider.resolve(task.id);
      expect(context).toContain(task.description);
      expect(context.includes(comments[0]!.body)).toBe(false);
      expect(store.tasks.getTask(task.id)).toEqual(beforeMention);
      expect(store.tasks.listTaskThreads(task.id)).toEqual(linksBeforeMention);
      expect(harness.sdk.callsTo("threads.spawn")).toEqual([]);

      await harness.callRpc("delegate", {
        taskId: task.id,
        presetId: preset.id,
        extraInstructions,
      });
      const taskAfterDispatch = store.tasks.getTask(task.id);
      const linksAfterDispatch = store.tasks.listTaskThreads(task.id);
      const commentsAfterDispatch = store.tasks.listComments(task.id);
      const read = await harness.runCli(["show", task.key, "--json"]);
      expect(read, read.stderr).toMatchObject({ exitCode: 0, stderr: "" });
      const detail = JSON.parse(read.stdout);
      expect(detail.task.description).toBe(task.description);
      expect(detail.comments).toMatchObject(commentsAfterDispatch);
      expect(detail.comments).toEqual(
        expect.arrayContaining(comments.map((comment) => expect.objectContaining(comment))),
      );
      expect(detail.attachments).toEqual(
        expect.arrayContaining(
          [taskAttachment, commentAttachment].map(({ id, fileName, taskId, commentId }) =>
            expect.objectContaining({ id, fileName, taskId, commentId }),
          ),
        ),
      );
      expect(detail.subtasks).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: subtask.id })]),
      );
      expect(detail.blockedBy).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: blocker.id })]),
      );
      expect(detail.labels).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: label.id })]),
      );
      expect(detail.taskThreads).toMatchObject(linksAfterDispatch);
      expect(store.tasks.getTask(task.id)).toEqual(taskAfterDispatch);
      expect(store.tasks.listTaskThreads(task.id)).toEqual(linksAfterDispatch);
      expect(harness.sdk.callsTo("threads.spawn")).toHaveLength(1);
      expect(harness.sdk.callsTo("threads.send")).toEqual([]);

      const body = "Review is blocked on required checks.";
      const posted = await harness.runCli(["comment", task.key, "--body", body, "--json"], {
        threadId: "thr_context",
      });
      expect(posted, posted.stderr).toMatchObject({ exitCode: 0, stderr: "" });
      expect(JSON.parse(posted.stdout).comment).toMatchObject({
        body,
        kind: "agent",
        threadId: "thr_context",
      });
      expect(store.tasks.getTask(task.id)).toEqual(taskAfterDispatch);
      expect(store.tasks.listTaskThreads(task.id)).toEqual(linksAfterDispatch);
      expect(harness.sdk.callsTo("threads.spawn")).toHaveLength(1);
      expect(harness.sdk.callsTo("threads.send")).toEqual([]);
    } finally {
      await harness.dispose();
    }
  });
});
