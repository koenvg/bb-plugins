// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TasksRefreshProvider } from "../../shell/refresh.js";
import { makeTask, rpcInput } from "../../test-fixtures.js";
import { TaskActivity } from "./task-activity.js";
import type { Attachment, DisplayComment } from "../../shared/contract.js";

// Keep the real query and RPC transport. Editors have their own integration tests.
vi.mock("../../shell/data.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../shell/data.js")>()),
  useMentionItems: () => [],
}));
vi.mock("../../editor/tasks-editor.js", () => ({
  TasksEditor: ({
    value,
    readOnly,
    onChange,
    onSubmit,
  }: {
    value: string;
    readOnly?: boolean;
    onChange: (value: string) => void;
    onSubmit?: () => void;
  }) =>
    readOnly ? (
      <p>{value}</p>
    ) : (
      <textarea
        aria-label="Comment body"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onSubmit?.();
          }
        }}
      />
    ),
}));

afterEach(cleanup);
const task = makeTask({ description: "Description stays visible" });
function entries(count: number, taskId = task.id) {
  return Array.from({ length: count }, (_, index) => {
    const comment: DisplayComment = {
      id: `comment-${index}`,
      taskId,
      kind: index % 2 ? "agent" : "user",
      authorName: index % 2 ? "Worker" : "You",
      presetName: index % 2 ? "Reviewer" : null,
      threadId: index % 2 ? "thr_worker" : null,
      threadTitle: index % 2 ? "Worker thread" : null,
      provider: null,
      body: `${taskId} review ${index}`,
      notifiedCount: 0,
      createdAt: "2026-10-01T10:00:00.000Z",
    };
    const attachments: Attachment[] =
      index % 5
        ? []
        : [
            {
              id: `file-${index}`,
              taskId: null,
              commentId: comment.id,
              fileName: `review-${index}.txt`,
              mime: "text/plain",
              sizeBytes: 1024,
              isImage: false,
              createdAt: comment.createdAt,
            },
          ];
    return { comment, attachments };
  });
}
function Root({ taskId = task.id }: { taskId?: string }) {
  return (
    <TasksRefreshProvider>
      <h1>{task.title}</h1>
      <p>{task.description}</p>
      <TaskActivity taskId={taskId} />
    </TasksRefreshProvider>
  );
}
function setup(read: (taskId: string) => unknown) {
  const activity = vi.fn((raw: unknown) => read(rpcInput(raw).taskId as string));
  const comments = vi.fn(() => ({ comments: [] }));
  const attachments = vi.fn(() => ({ attachments: [] }));
  const createComment = vi.fn((raw: unknown) => ({
    comment: { ...entries(1)[0]!.comment, body: rpcInput(raw).body as string },
  }));
  const slot = renderSlot(
    { component: Root },
    {},
    {
      rpc: {
        getTaskActivity: activity,
        listComments: comments,
        listAttachments: attachments,
        createComment,
      },
    },
  );
  return { slot, activity, comments, attachments, createComment };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("activity caller", () => {
  it.each([0, 1, 50])(
    "loads %i comments with one frontend activity read and no attachment fan-out",
    async (count) => {
      const result = entries(count);
      const { slot, activity, comments, attachments } = setup(() => ({ entries: result }));
      await waitFor(() =>
        count === 0
          ? expect(slot.getByText("No activity yet.")).toBeTruthy()
          : expect(slot.getByText(result.at(-1)!.comment.body)).toBeTruthy(),
      );
      expect(activity).toHaveBeenCalledTimes(1);
      expect(comments).not.toHaveBeenCalled();
      expect(attachments).not.toHaveBeenCalled();
      const links = slot.queryAllByRole("link", { name: /review-\d+\.txt/ });
      expect(links).toHaveLength(Math.ceil(count / 5));
      links.forEach((link, index) => {
        expect(link.getAttribute("href")).toBe(
          `/api/v1/plugins/tasks-plus/http/attachments/download?attachmentId=file-${index * 5}`,
        );
        expect(link.getAttribute("download")).toBe(`review-${index * 5}.txt`);
        const card = link.parentElement!.parentElement!.parentElement!.parentElement!;
        expect(within(card).getByText(result[index * 5]!.comment.body)).toBeTruthy();
      });
      if (count === 50)
        expect(
          slot.getByRole("switch", { name: "Notify Worker thread" }).getAttribute("aria-disabled"),
        ).toBe("false");
    },
  );

  it("shows loading and retryable failure without blocking the basic task presentation", async () => {
    const pending = deferred<{ entries: ReturnType<typeof entries> }>();
    let reads = 0;
    const { slot, activity } = setup(() =>
      ++reads === 1 ? pending.promise : { entries: entries(1) },
    );
    expect(slot.getByRole("heading", { name: task.title })).toBeTruthy();
    expect(slot.getByText(task.description)).toBeTruthy();
    expect(slot.getByRole("status").textContent).toBe("Loading activity…");
    expect(slot.queryByText("No activity yet.")).toBeNull();
    await act(async () => pending.reject(new Error("Metadata unavailable")));
    expect(slot.getByRole("alert").textContent).toContain("Metadata unavailable");
    expect(slot.queryByText("No activity yet.")).toBeNull();
    fireEvent.click(slot.getByRole("button", { name: "Retry activity" }));
    await waitFor(() => expect(slot.getByText(entries(1)[0]!.comment.body)).toBeTruthy());
    expect(activity).toHaveBeenCalledTimes(2);
  });

  it("marks retained activity after refresh failure without changing the retained notification target", async () => {
    let fail = false;
    const { slot, activity } = setup(() =>
      fail ? Promise.reject(new Error("Offline")) : { entries: entries(2) },
    );
    await waitFor(() =>
      expect(slot.getByRole("switch", { name: "Notify Worker thread" })).toBeTruthy(),
    );
    fail = true;
    await act(async () => slot.behavior.emitRealtime("comments:changed", { taskId: task.id }));
    await waitFor(() => expect(slot.getByRole("alert").textContent).toContain("Offline"));
    expect(slot.getByText("Showing previously loaded activity.")).toBeTruthy();
    expect(slot.getByText(entries(2)[1]!.comment.body)).toBeTruthy();
    expect(slot.getByRole("switch").getAttribute("aria-disabled")).toBe("false");
    fail = false;
    fireEvent.click(slot.getByRole("button", { name: "Retry activity" }));
    await waitFor(() => expect(slot.queryByRole("alert")).toBeNull());
    expect(activity).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["pending", "button", "on"],
    ["pending", "keyboard", "on"],
    ["failed", "button", "on"],
    ["failed", "keyboard", "on"],
    ["pending", "button", "off"],
    ["pending", "keyboard", "off"],
    ["failed", "button", "off"],
    ["failed", "keyboard", "off"],
    ["pending", "button", "unavailable"],
    ["pending", "keyboard", "unavailable"],
    ["failed", "button", "unavailable"],
    ["failed", "keyboard", "unavailable"],
  ] as const)(
    "preserves notification choice during %s refresh via %s, choice=%s",
    async (state, method, choice) => {
      const result = entries(2);
      if (choice === "unavailable") result[1]!.comment.threadTitle = null;
      const pending = deferred<{ entries: ReturnType<typeof entries> }>();
      let refreshing = false;
      const { slot, createComment } = setup(() =>
        refreshing ? pending.promise : { entries: result },
      );
      await waitFor(() => expect(slot.getByText(result[1]!.comment.body)).toBeTruthy());
      const toggle = slot.getByRole("switch");
      if (choice === "off") fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-checked")).toBe(choice === "on" ? "true" : "false");
      fireEvent.change(slot.getByRole("textbox", { name: "Comment body" }), {
        target: { value: "Please continue" },
      });
      refreshing = true;
      await act(async () => slot.behavior.emitRealtime("comments:changed", { taskId: task.id }));
      if (state === "failed") {
        await act(async () => pending.reject(new Error("Offline")));
        expect(slot.getByRole("alert").textContent).toContain("Offline");
      } else {
        expect(slot.getByRole("status").textContent).toBe("Loading activity…");
      }
      if (method === "button") fireEvent.click(slot.getByRole("button", { name: "Comment" }));
      else fireEvent.keyDown(slot.getByRole("textbox", { name: "Comment body" }), { key: "Enter" });
      await waitFor(() => expect(createComment).toHaveBeenCalledTimes(1));
      expect(rpcInput(createComment.mock.calls[0]![0])).toMatchObject({
        taskId: task.id,
        body: "Please continue",
        notify: choice === "on",
      });
      if (state === "pending") await act(async () => pending.resolve({ entries: result }));
    },
  );

  it("does not publish another task's activity when an earlier read finishes late", async () => {
    const pending = deferred<{ entries: ReturnType<typeof entries> }>();
    const { slot } = setup((id) =>
      id === task.id ? pending.promise : { entries: entries(1, "B") },
    );
    slot.lifecycle.rerender(<Root taskId="B" />);
    await waitFor(() => expect(slot.getByText("B review 0")).toBeTruthy());
    await act(async () => pending.resolve({ entries: entries(1) }));
    expect(slot.queryByText(entries(1)[0]!.comment.body)).toBeNull();
    expect(slot.getByText("B review 0")).toBeTruthy();
  });
});
