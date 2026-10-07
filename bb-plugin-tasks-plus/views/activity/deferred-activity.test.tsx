// @vitest-environment jsdom
import { createRef } from "react";
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import { TaskActivity, type TaskActivityHandle } from "./task-activity.js";
import { CommentDraftsProvider } from "./comment-drafts.js";
import { TasksRefreshProvider } from "../../shell/refresh.js";
import { PaneVisibilityContext } from "../../lib/pane-visibility.js";
import type { TaskActivityEntry } from "../../shared/contract.js";

const { editors } = vi.hoisted(() => ({ editors: [] as Editor[] }));
vi.mock("@tiptap/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tiptap/core")>();
  return {
    ...actual,
    Editor: class extends actual.Editor {
      constructor(...args: ConstructorParameters<typeof actual.Editor>) {
        super(...args);
        editors.push(this);
      }
    },
  };
});
vi.mock("../../shell/data.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../shell/data.js")>()),
  useMentionItems: () => [],
}));

class VisibilityObserver {
  static instances: VisibilityObserver[] = [];
  target: Element | null = null;
  disconnected = false;
  constructor(private callback: IntersectionObserverCallback) {
    VisibilityObserver.instances.push(this);
  }
  observe(target: Element) {
    this.target = target;
  }
  disconnect() {
    this.disconnected = true;
  }
  enter(isIntersecting = true) {
    this.callback(
      [{ target: this.target, isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

beforeEach(() => {
  editors.length = 0;
  VisibilityObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", VisibilityObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function entries(taskId: string): TaskActivityEntry[] {
  return Array.from({ length: 3 }, (_, index) => ({
    comment: {
      id: `${taskId}-${index}`,
      taskId,
      kind: index === 0 ? "system" : index === 1 ? "user" : "agent",
      authorName: "Worker",
      presetName: null,
      threadId: index === 2 ? "thr_worker" : null,
      threadTitle: index === 2 ? "Worker thread" : null,
      provider: null,
      body: `${taskId} comment ${index}`,
      notifiedCount: 0,
      createdAt: "2026-10-01T10:00:00.000Z",
    },
    attachments:
      index === 1
        ? [
            {
              id: `${taskId}-file`,
              taskId: null,
              commentId: `${taskId}-1`,
              fileName: `${taskId}.txt`,
              mime: "text/plain",
              sizeBytes: 1,
              isImage: false,
              createdAt: "2026-10-01T10:00:00.000Z",
            },
          ]
        : [],
  }));
}

function setup(read = (taskId: string): unknown => ({ entries: entries(taskId) })) {
  const activity = createRef<TaskActivityHandle>();
  const reads = vi.fn((input: unknown) => read((input as { taskId: string }).taskId));
  const send = vi.fn();
  const Root = ({ taskId = "A", visible = true }: { taskId?: string; visible?: boolean }) => (
    <TasksRefreshProvider>
      <CommentDraftsProvider>
        <h1>{taskId} description</h1>
        <PaneVisibilityContext.Provider value={visible}>
          <TaskActivity taskId={taskId} ref={activity} />
        </PaneVisibilityContext.Provider>
      </CommentDraftsProvider>
    </TasksRefreshProvider>
  );
  const slot = renderSlot(
    { component: Root },
    {},
    { rpc: { getTaskActivity: reads, createComment: send } },
  );
  return {
    slot,
    activity,
    reads,
    send,
    switchTo: (taskId: string, visible = true) =>
      slot.lifecycle.rerender(<Root taskId={taskId} visible={visible} />),
  };
}

it("reads below-fold activity without constructing editors, then exposes the complete feed on intersection", async () => {
  const { slot, reads } = setup();
  await waitFor(() => expect(reads).toHaveBeenCalledTimes(1));
  expect(editors).toHaveLength(0);
  expect(slot.getByRole("status").textContent).toContain("scroll here");
  expect(slot.getByRole("button", { name: "Show activity" })).toBeTruthy();
  const observer = VisibilityObserver.instances[0]!;
  act(() => observer.enter(false));
  expect(editors).toHaveLength(0);
  slot.getByRole("button", { name: "Show activity" }).focus();
  act(() => observer.enter());
  await waitFor(() => expect(editors).toHaveLength(3));
  expect(document.activeElement).toBe(slot.getByRole("region", { name: "Activity" }));
  expect(slot.getByText("A comment 0")).toBeTruthy();
  expect(slot.getByText("A comment 2")).toBeTruthy();
  expect(slot.getByRole("link", { name: /A.txt/ })).toBeTruthy();
  expect(observer.disconnected).toBe(true);
  act(() => observer.enter(false));
  expect(editors.every((editor) => !editor.isDestroyed)).toBe(true);
  expect(reads).toHaveBeenCalledTimes(1);
});

it("keeps keyboard activation available without an observer and moves focus off the removed button", async () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  const { slot } = setup();
  const button = slot.getByRole("button", { name: "Show activity" });
  button.focus();
  // Native Enter/Space dispatch a click for a button; jsdom does not synthesize it.
  fireEvent.click(button, { detail: 0 });
  await waitFor(() => expect(editors).toHaveLength(3));
  expect(document.activeElement).toBe(slot.getByRole("region", { name: "Activity" }));
  expect(slot.getByText("A comment 1")).toBeTruthy();
});

it("activates and focuses the composer even while its activity read is pending, with retry on failure", async () => {
  const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
  let reject!: (cause: Error) => void;
  const pending = new Promise((_, fail) => {
    reject = fail;
  });
  const { slot, activity, reads, send } = setup(() => pending);
  act(() => activity.current!.focusComposer());
  await waitFor(() => expect(editors).toHaveLength(1));
  await waitFor(() => expect(document.activeElement).toBe(editors[0]!.view.dom));
  expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: "nearest" });
  expect(scroll.mock.contexts[0]).toBe(editors[0]!.view.dom);
  scroll.mockClear();
  expect(slot.getByRole("status").textContent).toBe("Loading activity…");
  await act(async () => reject(new Error("Offline")));
  expect(slot.getByRole("alert").textContent).toContain("Offline");
  expect(slot.getByRole("button", { name: "Retry activity" })).toBeTruthy();
  act(() => activity.current!.focusComposer());
  expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: "nearest" });
  expect(scroll.mock.contexts[0]).toBe(editors[0]!.view.dom);
  expect(editors).toHaveLength(1);
  expect(reads).toHaveBeenCalledTimes(1);
  expect(send).not.toHaveBeenCalled();
});

it("destroys old editors but retains each task's draft and staged files across A-B-A", async () => {
  const upload = vi.fn();
  vi.stubGlobal("fetch", upload);
  const { slot, activity, switchTo, send } = setup();
  act(() => activity.current!.focusComposer());
  await waitFor(() => expect(editors).toHaveLength(3));
  const aComposer = editors.find((editor) => editor.isEditable)!;
  act(() => {
    aComposer.commands.setContent("<p>Only A</p>", true);
  });
  fireEvent.change(slot.container.querySelector('input[type="file"]')!, {
    target: { files: [new File(["A"], "a.txt")] },
  });
  fireEvent.click(slot.getByRole("switch"));
  const oldObserver = VisibilityObserver.instances[0]!;
  switchTo("B");
  expect(editors.every((editor) => editor.isDestroyed)).toBe(true);
  expect(slot.queryByText("a.txt")).toBeNull();
  act(() => oldObserver.enter());
  expect(editors).toHaveLength(3);
  act(() => activity.current!.focusComposer());
  await waitFor(() => expect(editors).toHaveLength(6));
  const bComposer = editors.filter((editor) => editor.isEditable).at(-1)!;
  expect(bComposer.getText()).toBe("");
  act(() => {
    bComposer.commands.setContent("<p>Only B</p>", true);
  });
  switchTo("A");
  expect(bComposer.isDestroyed).toBe(true);
  expect(slot.queryByText("Only A")).toBeNull();
  act(() => activity.current!.focusComposer());
  await waitFor(() => expect(editors).toHaveLength(9));
  const restored = editors.filter((editor) => editor.isEditable).at(-1)!;
  expect(restored).not.toBe(aComposer);
  expect(restored.getText()).toBe("Only A");
  expect(slot.getByText("a.txt")).toBeTruthy();
  expect(slot.getByRole("switch").getAttribute("aria-checked")).toBe("false");
  expect(send).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
});

it("drops an unmounted task's pending focus without activating the replacement task", async () => {
  const { slot, activity, switchTo } = setup();
  act(() => {
    activity.current!.focusComposer();
    switchTo("B");
  });
  expect(editors).toHaveLength(0);
  expect(slot.getByRole("button", { name: "Show activity" })).toBeTruthy();
  expect(slot.queryByText("A comment 1")).toBeNull();
  act(() => activity.current!.focusComposer());
  await waitFor(() => expect(editors).toHaveLength(3));
  const composer = editors.find((editor) => editor.isEditable)!;
  await waitFor(() => expect(document.activeElement).toBe(composer.view.dom));
  expect(slot.getByText("B comment 1")).toBeTruthy();
});

it("does not activate parked content, and resumes observation when the pane returns", async () => {
  const { slot, switchTo } = setup();
  const oldObserver = VisibilityObserver.instances[0]!;
  switchTo("A", false);
  expect(oldObserver.disconnected).toBe(true);
  act(() => oldObserver.enter());
  expect(editors).toHaveLength(0);
  switchTo("A");
  act(() => VisibilityObserver.instances.at(-1)!.enter());
  await waitFor(() => expect(editors).toHaveLength(3));
  const composer = editors.find((editor) => editor.isEditable)!;
  act(() => {
    composer.commands.setContent("<p>Parked draft</p>", true);
  });
  switchTo("A", false);
  switchTo("A");
  expect(editors).toHaveLength(3);
  expect(composer.isDestroyed).toBe(false);
  expect(slot.getByText("Parked draft")).toBeTruthy();
});
