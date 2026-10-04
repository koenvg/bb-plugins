// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import type { ReactNode } from "react";
import type { DiffLineAnnotation, FileDiffMetadata, SelectedLineRange } from "@pierre/diffs";
import type { rpcContract } from "../contract";
import type { ChangedFile, ChangesResult, PatchesResult, SendFeedbackResult } from "../core/changes";

vi.mock("@pierre/diffs/react", () => ({
  FileDiff: ({
    fileDiff,
    options,
    lineAnnotations = [],
    renderAnnotation,
    renderHeaderMetadata,
  }: {
    fileDiff: FileDiffMetadata;
    options: { diffStyle?: string; onGutterUtilityClick?: (range: SelectedLineRange) => void };
    lineAnnotations?: DiffLineAnnotation<unknown>[];
    renderAnnotation?: (annotation: DiffLineAnnotation<unknown>) => ReactNode;
    renderHeaderMetadata?: () => ReactNode;
  }) => (
    <div data-testid="file-diff" data-path={fileDiff.name} data-diff-style={options.diffStyle}>
      <span>{fileDiff.prevName}</span>
      {renderHeaderMetadata?.()}
      {(["additions", "deletions"] as const).flatMap((side) =>
        [1, 2, 3].map((line) => (
          <button
            key={`${side}${line}`}
            type="button"
            onClick={() => options.onGutterUtilityClick?.({ start: line, end: line, side })}
          >
            + {side} {line}
          </button>
        )),
      )}
      {lineAnnotations.map((annotation, index) => (
        <div key={index} data-testid="line-annotation" data-side={annotation.side} data-line={annotation.lineNumber}>
          {renderAnnotation?.(annotation)}
        </div>
      ))}
    </div>
  ),
}));

class VisibleAtOnce {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal("IntersectionObserver", VisibleAtOnce);
});

afterEach(cleanup);

const app = await loadPluginApp(() => import("../app"));
const changesTab = app.threadPanelActions.find((action) => action.id === "changes")!;

const PATCH_A = "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,3 +1,3 @@\n keep\n-old\n+new\n keep\n";
const PATCH_RENAME =
  "diff --git a/src/old.ts b/src/new.ts\nsimilarity index 90%\nrename from src/old.ts\nrename to src/new.ts\n--- a/src/old.ts\n+++ b/src/new.ts\n@@ -1 +1 @@\n-x\n+y\n";

const ALL_QUERY = { target: "all", mergeBaseBranch: "origin/main" } as const;

function file(path: string, overrides: Partial<ChangedFile> = {}): ChangedFile {
  return { path, previousPath: null, additions: 1, deletions: 1, binary: false, loadMode: "auto", ...overrides };
}

function changes(files: ChangedFile[], extra: Partial<Extract<ChangesResult, { kind: "ok" }>> = {}): ChangesResult {
  return { kind: "ok", query: ALL_QUERY, files, patches: {}, commits: [], ...extra };
}

const A_ONLY = changes([file("src/a.ts", { additions: 34, deletions: 5 })]);

let nextThread = 0;

interface Handlers {
  getChanges?: (input: unknown) => ChangesResult | Promise<ChangesResult>;
  getPatches?: (input: { paths: string[] }) => PatchesResult | Promise<PatchesResult>;
  sendFeedback?: (input: { text: string }) => SendFeedbackResult | Promise<SendFeedbackResult>;
}

function renderTab(handlers: Handlers = {}, threadId = `thr_${++nextThread}`) {
  const slot = renderSlot<PluginThreadPanelProps, typeof rpcContract>(
    changesTab,
    { threadId, params: null },
    {
      rpc: {
        getChanges: handlers.getChanges ?? (() => A_ONLY),
        getPatches:
          handlers.getPatches ??
          (({ paths }) => ({
            kind: "ok",
            patches: Object.fromEntries(paths.map((path) => [path, path === "src/new.ts" ? PATCH_RENAME : PATCH_A])),
          })),
        sendFeedback: handlers.sendFeedback ?? (() => ({ kind: "sent", delivery: "sent" })),
      },
    },
  );
  return Object.assign(slot, { threadId });
}

type Slot = ReturnType<typeof renderTab>;

function callsTo(slot: Slot, method: string) {
  return slot.inspection.rpcCalls.filter((call) => call.method === method).map((call) => call.input);
}

async function addComment(slot: Slot, button: string, text: string) {
  fireEvent.click(await slot.findByRole("button", { name: button }));
  fireEvent.change(slot.getByRole("textbox", { name: "Comment" }), { target: { value: text } });
  fireEvent.click(slot.getByRole("button", { name: "Add to review" }));
}

describe("Changes tab", () => {
  it("is a flush thread panel action named Changes, not offered on root compose", () => {
    expect(changesTab).toMatchObject({ title: "Changes", layout: "flush" });
    expect(app.newThreadPanelActions ?? []).toEqual([]);
  });

  it("loads all changes of its thread and shows the summary", async () => {
    const slot = renderTab();

    expect((await slot.findByTestId("diff-summary")).textContent).toBe("1 file+34-5");
    expect((slot.getByRole("combobox", { name: "Diff target" }) as HTMLSelectElement).value).toBe("all");
    expect(callsTo(slot, "getChanges")).toEqual([{ threadId: slot.threadId, target: { kind: "all" } }]);
  });

  it("sums the counts of all files", async () => {
    const slot = renderTab({
      getChanges: () => changes([file("a.ts", { additions: 30, deletions: 4 }), file("b.ts", { additions: 4, deletions: 1 })]),
    });

    expect((await slot.findByTestId("diff-summary")).textContent).toBe("2 files+34-5");
  });

  it("shows Binary file and Diff too large instead of a diff", async () => {
    const slot = renderTab({
      getChanges: () => changes([file("logo.png", { binary: true }), file("big.json", { loadMode: "too_large" })]),
    });

    expect(await slot.findByText("Binary file")).toBeTruthy();
    expect(slot.getByText("Diff too large")).toBeTruthy();
    expect(callsTo(slot, "getPatches")).toEqual([]);
  });

  it("loads the patch of a file that comes into view", async () => {
    const slot = renderTab({ getChanges: () => changes([file("src/new.ts", { previousPath: "src/old.ts", loadMode: "on_demand" })]) });

    const diff = await slot.findByTestId("file-diff");

    expect(diff.dataset.path).toBe("src/new.ts");
    expect(within(diff).getByText("src/old.ts")).toBeTruthy();
    expect(callsTo(slot, "getPatches")).toEqual([{ threadId: slot.threadId, query: ALL_QUERY, paths: ["src/new.ts"] }]);
  });

  it("loads the patches of files that come into view together in one call", async () => {
    const slot = renderTab({ getChanges: () => changes([file("src/a.ts"), file("src/b.ts")]) });

    await waitFor(() => expect(slot.getAllByTestId("file-diff")).toHaveLength(2));

    expect(callsTo(slot, "getPatches")).toEqual([
      { threadId: slot.threadId, query: ALL_QUERY, paths: ["src/a.ts", "src/b.ts"] },
    ]);
  });

  it("keeps showing a diff while its refreshed patch loads", async () => {
    let patchCalls = 0;
    const slot = renderTab({
      getPatches: ({ paths }) =>
        patchCalls++ === 0
          ? { kind: "ok", patches: Object.fromEntries(paths.map((path) => [path, PATCH_A])) }
          : new Promise<PatchesResult>(() => {}),
    });
    await slot.findByTestId("file-diff");

    fireEvent.click(slot.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(patchCalls).toBe(2));
    expect(slot.getByTestId("file-diff")).toBeTruthy();
    expect(slot.queryByText("Loading diff…")).toBeNull();
  });

  it("uses an initial patch without asking for it again", async () => {
    const slot = renderTab({ getChanges: () => changes([file("src/a.ts")], { patches: { "src/a.ts": PATCH_A } }) });

    await slot.findByTestId("file-diff");

    expect(callsTo(slot, "getPatches")).toEqual([]);
  });

  it("loads one commit when the user picks it", async () => {
    const slot = renderTab({
      getChanges: () => changes([file("src/a.ts")], { commits: [{ sha: "abc1234def", shortSha: "abc1234", subject: "feat: a" }] }),
    });
    const picker = await slot.findByRole("combobox", { name: "Diff target" });
    await slot.findByRole("option", { name: "abc1234 feat: a" });

    fireEvent.change(picker, { target: { value: "commit:abc1234def" } });

    await waitFor(() =>
      expect(callsTo(slot, "getChanges").at(-1)).toEqual({
        threadId: slot.threadId,
        target: { kind: "commit", sha: "abc1234def" },
      }),
    );
  });

  it("switches every file to split view", async () => {
    const slot = renderTab();
    expect((await slot.findByTestId("file-diff")).dataset.diffStyle).toBe("unified");

    fireEvent.click(slot.getByRole("button", { name: "Split view" }));

    expect(slot.getByTestId("file-diff").dataset.diffStyle).toBe("split");
  });

  it("keeps the last diff visible while a refresh runs", async () => {
    let release: (result: ChangesResult) => void = () => {};
    let call = 0;
    const slot = renderTab({
      getChanges: () => (call++ === 0 ? A_ONLY : new Promise<ChangesResult>((resolve) => (release = resolve))),
    });
    await slot.findByTestId("file-diff");

    fireEvent.click(slot.getByRole("button", { name: "Refresh" }));

    expect(await slot.findByRole("button", { name: "Refreshing…" })).toBeTruthy();
    expect(slot.getByTestId("file-diff")).toBeTruthy();
    await act(async () => release(changes([])));
    expect(await slot.findByText("No changes")).toBeTruthy();
  });

  it("shows a load error with a retry button", async () => {
    let call = 0;
    const slot = renderTab({
      getChanges: () => (call++ === 0 ? { kind: "error", message: "permission denied" } : A_ONLY),
    });

    expect(await slot.findByText("permission denied")).toBeTruthy();
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));

    expect(await slot.findByTestId("file-diff")).toBeTruthy();
    expect(callsTo(slot, "getChanges")).toHaveLength(2);
  });

  it("tells the user when the thread has no git repository", async () => {
    const slot = renderTab({ getChanges: () => ({ kind: "no_git" }) });

    expect(await slot.findByText("No git repository for this thread")).toBeTruthy();
  });
});

describe("inline comments", () => {
  it("opens a new-side form from the + on an added line", async () => {
    const slot = renderTab();

    fireEvent.click(await slot.findByRole("button", { name: "+ additions 2" }));

    const annotation = slot.getByTestId("line-annotation");
    expect(annotation.dataset).toMatchObject({ side: "additions", line: "2" });
    expect(within(annotation).getByRole("textbox", { name: "Comment" })).toBeTruthy();
  });

  it("opens an old-side form from the + on a deleted line", async () => {
    const slot = renderTab();

    fireEvent.click(await slot.findByRole("button", { name: "+ deletions 2" }));

    expect(slot.getByTestId("line-annotation").dataset).toMatchObject({ side: "deletions", line: "2" });
  });

  it("puts a comment on a context line clicked in the old column on the new side", async () => {
    const slot = renderTab();

    fireEvent.click(await slot.findByRole("button", { name: "+ deletions 3" }));

    expect(slot.getByTestId("line-annotation").dataset).toMatchObject({ side: "additions", line: "3" });
  });

  it("shows an open form whose line left the diff under Not in this diff", async () => {
    let call = 0;
    const slot = renderTab({ getChanges: () => (call++ === 0 ? A_ONLY : changes([file("src/b.ts")])) });
    fireEvent.click(await slot.findByRole("button", { name: "+ additions 2" }));
    fireEvent.change(slot.getByRole("textbox", { name: "Comment" }), { target: { value: "keep me" } });

    fireEvent.click(slot.getByRole("button", { name: "Refresh" }));

    const section = await slot.findByRole("region", { name: "Not in this diff" });
    expect((within(section).getByRole("textbox", { name: "Comment" }) as HTMLTextAreaElement).value).toBe("keep me");
  });

  it("opens only one form per line and side", async () => {
    const slot = renderTab();
    const plus = await slot.findByRole("button", { name: "+ additions 2" });

    fireEvent.click(plus);
    fireEvent.click(plus);

    expect(slot.getAllByRole("textbox", { name: "Comment" })).toHaveLength(1);
  });

  it("keeps the form text after the tab unmounts and mounts again", async () => {
    const first = renderTab();
    fireEvent.click(await first.findByRole("button", { name: "+ additions 2" }));
    fireEvent.change(first.getByRole("textbox", { name: "Comment" }), { target: { value: "half a thought" } });
    first.unmount();

    const again = renderTab({}, first.threadId);

    expect(((await again.findByRole("textbox", { name: "Comment" })) as HTMLTextAreaElement).value).toBe("half a thought");
  });

  it("disables Add to review while the text is blank", async () => {
    const slot = renderTab();
    fireEvent.click(await slot.findByRole("button", { name: "+ additions 2" }));

    fireEvent.change(slot.getByRole("textbox", { name: "Comment" }), { target: { value: "   " } });

    expect((slot.getByRole("button", { name: "Add to review" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("adds the comment below its line and counts it", async () => {
    const slot = renderTab();

    await addComment(slot, "+ additions 2", "Null check missing");

    const card = slot.getByRole("article", { name: "Pending comment" });
    expect(within(card).getByText("Null check missing")).toBeTruthy();
    expect(slot.queryByRole("textbox", { name: "Comment" })).toBeNull();
    expect(slot.getByRole("button", { name: "Send feedback (1)" })).toBeTruthy();
  });

  it("adds the comment with Cmd+Enter", async () => {
    const slot = renderTab();
    fireEvent.click(await slot.findByRole("button", { name: "+ additions 2" }));
    const box = slot.getByRole("textbox", { name: "Comment" });
    fireEvent.change(box, { target: { value: "Typo" } });

    fireEvent.keyDown(box, { key: "Enter", metaKey: true });

    expect(slot.getByRole("button", { name: "Send feedback (1)" })).toBeTruthy();
  });

  it("cancels the form with Escape without adding a comment", async () => {
    const slot = renderTab();
    fireEvent.click(await slot.findByRole("button", { name: "+ additions 2" }));
    const box = slot.getByRole("textbox", { name: "Comment" });
    fireEvent.change(box, { target: { value: "never mind" } });

    fireEvent.keyDown(box, { key: "Escape" });

    expect(slot.queryByRole("textbox", { name: "Comment" })).toBeNull();
    expect(slot.getByRole("button", { name: "Send feedback (0)" })).toBeTruthy();
  });

  it("removes a pending comment", async () => {
    const slot = renderTab();
    await addComment(slot, "+ additions 2", "one");
    await addComment(slot, "+ additions 3", "two");

    fireEvent.click(within(slot.getAllByRole("article", { name: "Pending comment" })[0]!).getByRole("button", { name: "Remove" }));

    expect(slot.getAllByRole("article", { name: "Pending comment" })).toHaveLength(1);
    expect(slot.getByRole("button", { name: "Send feedback (1)" })).toBeTruthy();
  });

  it("keeps pending comments per thread", async () => {
    const first = renderTab();
    await addComment(first, "+ additions 2", "for thread one");
    first.unmount();

    const other = renderTab();
    expect(await other.findByRole("button", { name: "Send feedback (0)" })).toBeTruthy();
    other.unmount();

    const back = renderTab({}, first.threadId);
    expect(await back.findByRole("button", { name: "Send feedback (1)" })).toBeTruthy();
  });

  it("moves a comment whose line left the diff to Not in this diff", async () => {
    let call = 0;
    const slot = renderTab({
      getChanges: () => (call++ === 0 ? A_ONLY : changes([file("src/b.ts")])),
    });
    await addComment(slot, "+ additions 2", "Null check missing");

    fireEvent.click(slot.getByRole("button", { name: "Refresh" }));

    const section = await slot.findByRole("region", { name: "Not in this diff" });
    expect(within(section).getByText("src/a.ts:2")).toBeTruthy();
    expect(within(section).getByText("Null check missing")).toBeTruthy();
    expect(slot.getByRole("button", { name: "Send feedback (1)" })).toBeTruthy();
  });
});

describe("send feedback", () => {
  it("is disabled with no pending comments", async () => {
    const slot = renderTab();

    expect(((await slot.findByRole("button", { name: "Send feedback (0)" })) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends the edited prompt and clears the sent comments", async () => {
    const slot = renderTab();
    await addComment(slot, "+ additions 2", "Null check missing");
    await addComment(slot, "+ deletions 2", "Why remove this?");
    fireEvent.click(slot.getByRole("button", { name: "Send feedback (2)" }));
    const prompt = (await slot.findByRole("textbox", { name: "Review prompt" })) as HTMLTextAreaElement;
    expect(prompt.value).toContain("1. `src/a.ts:2` - Null check missing\n2. `src/a.ts:2 (deleted line)` - Why remove this?");

    fireEvent.change(prompt, { target: { value: `${prompt.value}\nAlso run the tests.` } });
    fireEvent.click(slot.getByRole("button", { name: "Send to agent" }));

    expect(await slot.findByText("Sent to agent")).toBeTruthy();
    expect((callsTo(slot, "sendFeedback")[0] as { text: string }).text).toMatch(/Also run the tests\.$/);
    expect(slot.queryByRole("article", { name: "Pending comment" })).toBeNull();
    expect(slot.getByRole("button", { name: "Send feedback (0)" })).toBeTruthy();
  });

  it("says when the message waits for the agent", async () => {
    const slot = renderTab({ sendFeedback: () => ({ kind: "sent", delivery: "queued" }) });
    await addComment(slot, "+ additions 2", "x");
    fireEvent.click(slot.getByRole("button", { name: "Send feedback (1)" }));

    fireEvent.click(await slot.findByRole("button", { name: "Send to agent" }));

    expect(await slot.findByText("Queued until the agent is idle")).toBeTruthy();
  });

  it("keeps the dialog and all comments when the send fails", async () => {
    const slot = renderTab({ sendFeedback: () => ({ kind: "error", message: "thread archived" }) });
    await addComment(slot, "+ additions 2", "x");
    fireEvent.click(slot.getByRole("button", { name: "Send feedback (1)" }));

    fireEvent.click(await slot.findByRole("button", { name: "Send to agent" }));

    expect(await slot.findByRole("alert")).toHaveProperty("textContent", "thread archived");
    expect(slot.getByRole("textbox", { name: "Review prompt" })).toBeTruthy();
    expect(slot.getByRole("button", { name: "Send feedback (1)", hidden: true })).toBeTruthy();
  });

  it("drops prompt edits and keeps the comments on Cancel", async () => {
    const slot = renderTab();
    await addComment(slot, "+ additions 2", "x");
    fireEvent.click(slot.getByRole("button", { name: "Send feedback (1)" }));
    fireEvent.change(await slot.findByRole("textbox", { name: "Review prompt" }), { target: { value: "edited" } });

    fireEvent.click(slot.getByRole("button", { name: "Cancel" }));
    fireEvent.click(slot.getByRole("button", { name: "Send feedback (1)" }));

    expect(((await slot.findByRole("textbox", { name: "Review prompt" })) as HTMLTextAreaElement).value).toContain("`src/a.ts:2` - x");
    expect(callsTo(slot, "sendFeedback")).toEqual([]);
  });
});
