// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import type { ReactNode } from "react";
import type { DiffLineAnnotation, FileDiffMetadata } from "@pierre/diffs";
import type {
  ActionResult,
  ReplyResult,
  ReviewResult,
  rpcContract,
  SendToAgentResult,
  SubmitReviewResult,
} from "../contract";
import { parsePrFiles } from "../core/pr-files";
import type { ListedCommentDraft } from "../core/review-drafts";
import { parseReviewThreads } from "../core/review-threads";
import { placeThreads, type ThreadPlacement } from "../core/thread-placement";
import { postIntent } from "./command-intents";
import prFiles from "../test/fixtures/pr-1-files.json";
import threadedPrFiles from "../test/fixtures/pr-25259-files.json";
import reviewThreads from "../test/fixtures/pr-25259-review-threads.json";

vi.mock("@pierre/diffs/react", () => ({
  FileDiff: ({
    fileDiff,
    lineAnnotations = [],
    renderAnnotation,
  }: {
    fileDiff: FileDiffMetadata;
    lineAnnotations?: DiffLineAnnotation<unknown>[];
    renderAnnotation?: (annotation: DiffLineAnnotation<unknown>) => ReactNode;
  }) => (
    <div data-testid="file-diff" data-path={fileDiff.name} data-type={fileDiff.type}>
      {lineAnnotations.map((annotation, index) => (
        <div
          key={index}
          data-testid="line-annotation"
          data-side={annotation.side}
          data-line={annotation.lineNumber}
        >
          {renderAnnotation?.(annotation)}
        </div>
      ))}
    </div>
  ),
}));

class VisibleAtOnce {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal("IntersectionObserver", VisibleAtOnce);
});

const app = await loadPluginApp(() => import("../app"));
const reviewTab = app.threadPanelActions.find((action) => action.id === "review")!;

afterEach(cleanup);

const noThreads: ThreadPlacement = { placed: [], outdated: [] };
const noReviewDrafts = {
  head: { prNodeId: "PR_1", oid: "def456", state: "OPEN", viewerIsAuthor: false },
  commentDrafts: [],
  summaryDraft: null,
} satisfies Partial<ReviewResult>;
const recorded = {
  kind: "ok",
  files: parsePrFiles(prFiles),
  threads: noThreads,
  drafts: {},
  ...noReviewDrafts,
} satisfies ReviewResult;

const threadedFiles = parsePrFiles(threadedPrFiles);
const threaded = {
  kind: "ok",
  files: threadedFiles,
  threads: placeThreads(threadedFiles, parseReviewThreads([reviewThreads])),
  drafts: {},
  ...noReviewDrafts,
} satisfies ReviewResult;

interface RpcHandlers {
  sendToAgent?: () => SendToAgentResult | Promise<SendToAgentResult>;
  reply?: () => ReplyResult | Promise<ReplyResult>;
  setResolved?: () => ActionResult | Promise<ActionResult>;
  saveDraft?: () => ActionResult | Promise<ActionResult>;
  discardDraft?: () => ActionResult | Promise<ActionResult>;
  saveCommentDraft?: () => ActionResult | Promise<ActionResult>;
  deleteCommentDraft?: () => ActionResult | Promise<ActionResult>;
  saveSummaryDraft?: () => ActionResult | Promise<ActionResult>;
  submitReview?: () => SubmitReviewResult | Promise<SubmitReviewResult>;
}

let summaryListener: BroadcastChannel | undefined;

function listenForSummaries(): unknown[] {
  const signals: unknown[] = [];
  summaryListener = new BroadcastChannel("github-insight.summary-written");
  summaryListener.onmessage = (event) => signals.push(event.data);
  return signals;
}

function stopListening() {
  summaryListener?.close();
  summaryListener = undefined;
}

const quietly = () => new Promise((resolve) => setTimeout(resolve, 20));

function renderTab(...results: ReviewResult[]) {
  return renderTabWith({}, ...results);
}

function renderTabSending(sendToAgent: () => SendToAgentResult | Promise<SendToAgentResult>, ...results: ReviewResult[]) {
  return renderTabWith({ sendToAgent }, ...results);
}

function renderTabWith(handlers: RpcHandlers, ...results: ReviewResult[]) {
  let call = 0;
  const getReview = () => results[Math.min(call++, results.length - 1)]!;
  return renderSlot<PluginThreadPanelProps, typeof rpcContract>(
    reviewTab,
    { threadId: "thr_1", params: null },
    {
      rpc: {
        getReview,
        sendToAgent: handlers.sendToAgent ?? (() => ({ kind: "sent", delivery: "sent", threadCount: 1 })),
        getInsight: () => ({ kind: "no_pr" }),
        refresh: () => ({ kind: "no_pr" }),
        reply: handlers.reply ?? (() => ({ kind: "posted", pendingReviewUrl: null, resolveError: null })),
        setResolved: handlers.setResolved ?? (() => ({ kind: "ok" })),
        saveDraft: handlers.saveDraft ?? (() => ({ kind: "ok" })),
        discardDraft: handlers.discardDraft ?? (() => ({ kind: "ok" })),
        saveCommentDraft: handlers.saveCommentDraft ?? (() => ({ kind: "ok" })),
        deleteCommentDraft: handlers.deleteCommentDraft ?? (() => ({ kind: "ok" })),
        saveSummaryDraft: handlers.saveSummaryDraft ?? (() => ({ kind: "ok" })),
        submitReview: handlers.submitReview ?? (() => ({ kind: "submitted" })),
        getReviewQueue: () => ({ kind: "error", message: "unused", lastGood: null }),
        refreshReviewQueue: () => ({ kind: "error", message: "unused", lastGood: null }),
        startReview: () => ({ threadId: "unused" }),
        archiveReview: () => ({ kind: "error", message: "unused" }),
        runMergeAction: () => ({ kind: "error", message: "unused" }),
      },
    },
  );
}

function methods(slot: ReturnType<typeof renderTab>) {
  return slot.inspection.rpcCalls.map((call) => call.method);
}

function callsTo(slot: ReturnType<typeof renderTab>, method: string) {
  return slot.inspection.rpcCalls.filter((call) => call.method === method).map((call) => call.input);
}

describe("Review tab", () => {
  it("registers as the flush Review thread panel action", () => {
    expect(reviewTab).toMatchObject({ title: "Review", layout: "flush" });
  });

  it("asks for the review of its own thread", async () => {
    const slot = renderTab({ kind: "no_pr" });

    await slot.findByText("No pull request for this thread");
    expect(slot.inspection.rpcCalls).toEqual([
      expect.objectContaining({ method: "getReview", input: { threadId: "thr_1" } }),
    ]);
  });

  it("shows a diff for each file with a patch, in GitHub's order", async () => {
    const slot = renderTab(recorded);

    await slot.findAllByTestId("file-diff");
    expect(
      slot.getAllByTestId("file-diff").map((diff) => diff.getAttribute("data-path")),
    ).toEqual(["plugins/github-insight/app.tsx", "plugins/github-insight/core/pr-ref.ts"]);
    expect(slot.getAllByTestId("file-diff")[0]!.getAttribute("data-type")).toBe("new");
  });

  it("shows the path and 'Diff not available' for a file without a patch", async () => {
    const slot = renderTab(recorded);

    const row = (await slot.findByText("plugins/github-insight/package-lock.json")).closest(
      "section",
    )!;
    expect(within(row).getByText("Diff not available")).toBeTruthy();
  });

  it("says how many files changed", async () => {
    const slot = renderTab(recorded);

    expect(await slot.findByText("3 files changed")).toBeTruthy();
  });

  it("shows the gh error with a retry that loads again", async () => {
    const slot = renderTab({ kind: "error", message: "gh not logged in" }, recorded);

    const alert = await slot.findByRole("alert");
    expect(within(alert).getByText("gh not logged in")).toBeTruthy();
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));

    await slot.findByText("3 files changed");
    expect(slot.inspection.rpcCalls.map((call) => call.method)).toEqual([
      "getReview",
      "getReview",
    ]);
  });

  it("loads again on refresh and shows the new files", async () => {
    const slot = renderTab(recorded, { ...recorded, files: recorded.files.slice(0, 1) });

    await slot.findByText("3 files changed");
    fireEvent.click(slot.getByRole("button", { name: "Refresh" }));

    expect(await slot.findByText("1 file changed")).toBeTruthy();
  });

  it("shows the diff of a file that gets its patch on refresh", async () => {
    const withoutPatch = recorded.files.map((file) => ({ ...file, patch: null }));
    const slot = renderTab({ ...recorded, files: withoutPatch }, recorded);

    await slot.findAllByText("Diff not available");
    fireEvent.click(slot.getByRole("button", { name: "Refresh" }));

    expect(await slot.findAllByTestId("file-diff")).toHaveLength(2);
  });
});

describe("Review tab threads", () => {
  const OPEN_THREAD = "There's no wait for the new row to mount";
  const REPLY = "Agreed, removed.";
  const RESOLVED_REPLY = "False positive.";

  function annotationWith(slot: ReturnType<typeof renderTab>, text: string) {
    return slot
      .getAllByTestId("line-annotation")
      .find((annotation) => annotation.textContent?.includes(text));
  }

  function withResolved(threadId: string): ReviewResult {
    const resolve = <T extends { id: string; resolved: boolean }>(thread: T) =>
      thread.id === threadId ? { ...thread, resolved: true } : thread;
    return {
      ...threaded,
      threads: {
        placed: threaded.threads.placed.map((placed) => ({ ...placed, thread: resolve(placed.thread) })),
        outdated: threaded.threads.outdated.map(resolve),
      },
    };
  }

  it("shows a thread below its line on the new side of its file", async () => {
    const slot = renderTab(threaded);

    await slot.findAllByTestId("line-annotation");
    const annotation = annotationWith(slot, OPEN_THREAD)!;
    expect(annotation.dataset).toMatchObject({ side: "additions", line: "46" });
    expect(annotation.closest("[data-testid=file-diff]")!.getAttribute("data-path")).toBe(
      "apps/shell/e2e/catalog/integrations/components/asset/generic-configuration/createDatabricksOutboundSyncConfigurationComponent.ts",
    );
  });

  it("shows each comment with its author, time, and Markdown body, in order", async () => {
    const slot = renderTab(threaded);

    await slot.findAllByTestId("line-annotation");
    const thread = within(annotationWith(slot, OPEN_THREAD)!);
    const bodies = thread.getAllByTestId("bb-markdown").map((body) => body.textContent);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatch(/^There's no wait/);
    expect(thread.getByText("a-bandziuk")).toBeTruthy();
    expect(thread.getByText("RuslanPleskunCollibra")).toBeTruthy();
    expect(
      thread.getAllByRole("time").map((time) => time.getAttribute("datetime")),
    ).toEqual(["2026-09-18T14:34:40.000Z", "2026-09-18T15:17:49.000Z"]);
  });

  it("shows an outdated thread at the top with its path, original line, and snippet", async () => {
    const slot = renderTab(threaded);

    const section = within(await slot.findByRole("region", { name: "Outdated" }));
    expect(
      section.getByText("apps/shell/e2e/catalog/integrations/components/helpers/clickWithScrollHelper.ts"),
    ).toBeTruthy();
    expect(section.getByText("Line 32")).toBeTruthy();
    const snippet = section.getByTestId("bb-diff");
    expect(snippet.textContent).toMatch(/^@@ -10,22 \+14,31 @@/);
    expect(snippet.getAttribute("data-path")).toBe(
      "apps/shell/e2e/catalog/integrations/components/helpers/clickWithScrollHelper.ts",
    );
    expect(section.getByText(REPLY, { exact: false })).toBeTruthy();
  });

  it("hides resolved threads", async () => {
    const slot = renderTab(withResolved("PRRT_kwDOHI7l-86jxula"));

    await slot.findAllByTestId("line-annotation");
    expect(annotationWith(slot, OPEN_THREAD)).toBeUndefined();
    expect(slot.queryByText(RESOLVED_REPLY, { exact: false })).toBeNull();
  });

  it("shows resolved threads collapsed when 'Show resolved' is on, and expands one", async () => {
    const slot = renderTab(withResolved("PRRT_kwDOHI7l-86jxula"));

    fireEvent.click(await slot.findByRole("checkbox", { name: "Show resolved" }));

    const collapsed = annotationWith(slot, "Resolved")!;
    expect(collapsed.dataset).toMatchObject({ side: "additions", line: "46" });
    expect(within(collapsed).queryByTestId("bb-markdown")).toBeNull();
    const toggle = within(collapsed).getByRole("button", { name: /a-bandziuk.*Resolved/ });
    fireEvent.click(toggle);
    expect(within(collapsed).getAllByTestId("bb-markdown")).toHaveLength(2);

    const outdated = within(slot.getByRole("region", { name: "Outdated" }));
    expect(outdated.getByRole("button", { name: /wiz-22f56a2082.*Resolved/ })).toBeTruthy();
  });

  it("counts open threads and outdated open threads", async () => {
    const slot = renderTab(threaded);

    expect(await slot.findByText("3 open")).toBeTruthy();
    expect(slot.getByText("1 outdated")).toBeTruthy();
  });

  it("leaves resolved threads out of the counts", async () => {
    const slot = renderTab(withResolved("PRRT_kwDOHI7l-86jx0SN"));

    expect(await slot.findByText("2 open")).toBeTruthy();
    expect(slot.getByText("0 outdated")).toBeTruthy();
  });

  it("links to GitHub when a thread has more comments than were loaded", async () => {
    const [first, ...rest] = threaded.threads.placed;
    const slot = renderTab({
      ...threaded,
      threads: { ...threaded.threads, placed: [{ ...first!, thread: { ...first!.thread, hasMoreComments: true } }, ...rest] },
    });

    const link = await slot.findByRole("link", { name: "More comments on GitHub" });
    expect(link.getAttribute("href")).toBe(first!.thread.comments.at(-1)!.url);
  });

  it("has no Outdated section when no outdated thread shows", async () => {
    const slot = renderTab(withResolved("PRRT_kwDOHI7l-86jx0SN"));

    await slot.findByText("2 open");
    expect(slot.queryByRole("region", { name: "Outdated" })).toBeNull();
  });
});

describe("Review tab drafts", () => {
  const PLACED = "PRRT_kwDOHI7l-86jxula";
  const OUTDATED = "PRRT_kwDOHI7l-86jx0SN";
  const draft = { body: "Renamed in abc123", updatedAt: 1, source: "agent" as const };

  function withDraft(reviewThreadId: string): ReviewResult {
    return { ...threaded, drafts: { [reviewThreadId]: draft } };
  }

  async function findDraft(slot: ReturnType<typeof renderTab>) {
    const section = await slot.findByRole("region", { name: "Draft from agent" });
    return { section, box: within(section).getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement };
  }

  it("puts the draft in the reply box below the comments of its thread, as 'Draft from agent'", async () => {
    const slot = renderTab(withDraft(PLACED));

    const { section, box } = await findDraft(slot);
    expect(box.value).toBe("Renamed in abc123");
    const card = section.closest("article")!;
    expect(card.textContent).toContain("There's no wait for the new row to mount");
    const lastComment = within(card).getAllByTestId("bb-markdown").at(-1)!;
    expect(lastComment.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the draft of an outdated thread", async () => {
    const slot = renderTab(withDraft(OUTDATED));

    const outdated = within(await slot.findByRole("region", { name: "Outdated" }));
    const section = outdated.getByRole("region", { name: "Draft from agent" });
    expect((within(section).getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement).value).toBe(
      "Renamed in abc123",
    );
  });

  it("shows the draft text as written, not as Markdown", async () => {
    const slot = renderTab({ ...threaded, drafts: { [PLACED]: { ...draft, body: "**bold**\nnext" } } });

    const { section, box } = await findDraft(slot);
    expect(within(section).queryByTestId("bb-markdown")).toBeNull();
    expect(box.value).toBe("**bold**\nnext");
  });

  it("shows a draft saved while the tab is open", async () => {
    const slot = renderTab(threaded, withDraft(PLACED));
    await slot.findByText("3 open");

    await slot.behavior.emitRealtime("review.updated", { threadId: "thr_1" });

    expect((await findDraft(slot)).box.value).toBe("Renamed in abc123");
  });

  it("ignores a review update of another thread", async () => {
    const slot = renderTab(threaded, withDraft(PLACED));
    await slot.findByText("3 open");

    await slot.behavior.emitRealtime("review.updated", { threadId: "thr_2" });

    expect(methods(slot)).toEqual(["getReview"]);
  });

  it("has 'Discard' only on a thread with a draft", async () => {
    const slot = renderTab(withDraft(PLACED));

    const card = within((await findDraft(slot)).section.closest("article")!);
    const discard = card.getByRole("button", { name: "Discard" });
    expect(slot.getAllByRole("button", { name: "Discard" })).toEqual([discard]);
  });

  it("posts the edited draft, saves the edit first, and drops the draft", async () => {
    const slot = renderTab(withDraft(PLACED), threaded);
    const { box } = await findDraft(slot);

    fireEvent.change(box, { target: { value: "Renamed in def456" } });
    fireEvent.click(within(box.closest("article")!).getByRole("button", { name: "Post" }));

    await waitFor(() => expect(slot.queryByRole("region", { name: "Draft from agent" })).toBeNull());
    expect(methods(slot)).toEqual(["getReview", "saveDraft", "reply", "getReview"]);
    expect(callsTo(slot, "reply")).toEqual([
      { threadId: "thr_1", reviewThreadId: PLACED, body: "Renamed in def456", resolve: false },
    ]);
  });

  it("posts and resolves the draft on 'Post + resolve'", async () => {
    const slot = renderTab(withDraft(PLACED), threaded);
    const { box } = await findDraft(slot);

    fireEvent.click(within(box.closest("article")!).getByRole("button", { name: "Post + resolve" }));

    await waitFor(() => expect(slot.queryByRole("region", { name: "Draft from agent" })).toBeNull());
    expect(callsTo(slot, "reply")).toEqual([
      { threadId: "thr_1", reviewThreadId: PLACED, body: "Renamed in abc123", resolve: true },
    ]);
  });

  it("discards the draft without a GitHub write, and loads the thread again", async () => {
    const slot = renderTab(withDraft(PLACED), threaded);
    const { box } = await findDraft(slot);
    const card = within(box.closest("article")!);

    fireEvent.click(card.getByRole("button", { name: "Discard" }));

    await waitFor(() => expect(slot.queryByRole("region", { name: "Draft from agent" })).toBeNull());
    expect((card.getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement).value).toBe("");
    await waitFor(() => expect(methods(slot)).toEqual(["getReview", "discardDraft", "getReview"]));
    expect(callsTo(slot, "discardDraft")).toEqual([{ threadId: "thr_1", reviewThreadId: PLACED }]);
  });

  it("does not announce a new summary after a discard", async () => {
    const signals = listenForSummaries();
    const slot = renderTab(withDraft(PLACED), threaded);
    const { box } = await findDraft(slot);

    fireEvent.click(within(box.closest("article")!).getByRole("button", { name: "Discard" }));

    await waitFor(() => expect(methods(slot)).toEqual(["getReview", "discardDraft", "getReview"]));
    await quietly();
    stopListening();
    expect(signals).toEqual([]);
  });

  it("keeps the draft and shows the error when the discard fails", async () => {
    const slot = renderTabWith({ discardDraft: () => ({ kind: "error", message: "No pull request for this thread" }) }, withDraft(PLACED));
    const { box } = await findDraft(slot);

    fireEvent.click(within(box.closest("article")!).getByRole("button", { name: "Discard" }));

    expect((await slot.findByRole("alert")).textContent).toBe("No pull request for this thread");
    expect((await findDraft(slot)).box.value).toBe("Renamed in abc123");
  });

  it("keeps the edited draft and shows the error when the post fails", async () => {
    const slot = renderTabWith({ reply: () => ({ kind: "post_failed", message: "gh not logged in" }) }, withDraft(PLACED));
    const { box } = await findDraft(slot);

    fireEvent.change(box, { target: { value: "Renamed in def456" } });
    fireEvent.click(within(box.closest("article")!).getByRole("button", { name: "Post" }));

    expect((await slot.findByRole("alert")).textContent).toBe("gh not logged in");
    expect((await findDraft(slot)).box.value).toBe("Renamed in def456");
    expect(methods(slot)).toEqual(["getReview", "saveDraft", "reply"]);
  });

  it("saves the last edit of a draft once the typing stops", async () => {
    const slot = renderTab(withDraft(PLACED));
    const { box } = await findDraft(slot);

    fireEvent.change(box, { target: { value: "Renamed" } });
    fireEvent.change(box, { target: { value: "Renamed in def456" } });

    await waitFor(() => expect(callsTo(slot, "saveDraft")).toHaveLength(1));
    expect(callsTo(slot, "saveDraft")).toEqual([
      { threadId: "thr_1", reviewThreadId: PLACED, body: "Renamed in def456" },
    ]);
  });

  it("saves an unsaved edit when the tab closes", async () => {
    const slot = renderTab(withDraft(PLACED));
    const { box } = await findDraft(slot);

    fireEvent.change(box, { target: { value: "Renamed in def456" } });
    slot.unmount();

    await waitFor(() =>
      expect(callsTo(slot, "saveDraft")).toEqual([
        { threadId: "thr_1", reviewThreadId: PLACED, body: "Renamed in def456" },
      ]),
    );
  });

  it("shows the error when an edit cannot be saved", async () => {
    const slot = renderTabWith({ saveDraft: () => ({ kind: "error", message: "No pull request for this thread" }) }, withDraft(PLACED));
    const { box } = await findDraft(slot);

    fireEvent.change(box, { target: { value: "Renamed in def456" } });

    expect((await slot.findByRole("alert")).textContent).toBe("No pull request for this thread");
  });

  it("saves an unsaved edit before it resolves the thread", async () => {
    const slot = renderTab(withDraft(PLACED));
    const { box } = await findDraft(slot);

    fireEvent.change(box, { target: { value: "Renamed in def456" } });
    fireEvent.click(within(box.closest("article")!).getByRole("button", { name: "Resolve" }));

    await waitFor(() => expect(methods(slot)).toEqual(["getReview", "saveDraft", "setResolved", "getReview"]));
  });

  it("does not save a reply on a thread without a draft", async () => {
    const slot = renderTab(withDraft(OUTDATED));
    const annotation = (await slot.findAllByTestId("line-annotation")).find((candidate) =>
      candidate.textContent?.includes("There's no wait"),
    )!;

    fireEvent.change(within(annotation).getByRole("textbox", { name: "Reply" }), { target: { value: "Half written" } });
    slot.unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(callsTo(slot, "saveDraft")).toEqual([]);
  });

  it("keeps the edited text when the tab loads the stored draft again", async () => {
    const slot = renderTab(withDraft(PLACED));
    const { box } = await findDraft(slot);

    fireEvent.change(box, { target: { value: "Renamed in def456" } });
    await slot.behavior.emitRealtime("review.updated", { threadId: "thr_1" });

    await waitFor(() => expect(methods(slot).filter((method) => method === "getReview")).toHaveLength(2));
    expect((await findDraft(slot)).box.value).toBe("Renamed in def456");
  });
});

describe("Review tab send to agent", () => {
  const PLACED = "PRRT_kwDOHI7l-86jxula";
  const OUTDATED = "PRRT_kwDOHI7l-86jx0SN";
  const PLACED_TEXT = "There's no wait for the new row to mount";

  function checkboxOf(slot: ReturnType<typeof renderTab>, text: string) {
    const card = slot.getAllByRole("article").find((article) => article.textContent?.includes(text))!;
    return within(card).getByRole("checkbox", { name: "Add to agent" }) as HTMLInputElement;
  }

  function outdatedCheckbox(slot: ReturnType<typeof renderTab>) {
    return within(slot.getByRole("region", { name: "Outdated" })).getByRole("checkbox", {
      name: "Add to agent",
    }) as HTMLInputElement;
  }

  async function selectTwo(slot: ReturnType<typeof renderTab>) {
    await slot.findAllByTestId("line-annotation");
    fireEvent.click(checkboxOf(slot, PLACED_TEXT));
    fireEvent.click(outdatedCheckbox(slot));
  }

  function sendCalls(slot: ReturnType<typeof renderTab>) {
    return slot.inspection.rpcCalls.filter((call) => call.method === "sendToAgent");
  }

  it("has a checkbox on each open thread and no send button before a selection", async () => {
    const slot = renderTab(threaded);

    await slot.findAllByTestId("line-annotation");
    expect(slot.getAllByRole("checkbox", { name: "Add to agent" })).toHaveLength(3);
    expect(slot.queryByRole("button", { name: /to agent/ })).toBeNull();
  });

  it("counts the selected threads", async () => {
    const slot = renderTab(threaded);

    await selectTwo(slot);
    expect((slot.getByRole("button", { name: "Send 2 to agent" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(outdatedCheckbox(slot));
    expect(slot.getByRole("button", { name: "Send 1 to agent" })).toBeTruthy();
  });

  it("has no checkbox on a resolved thread", async () => {
    const slot = renderTab(threaded);

    fireEvent.click(await slot.findByRole("checkbox", { name: "Show resolved" }));
    const resolved = within(slot.getByRole("region", { name: "Outdated" })).getByRole("button", {
      name: /wiz-22f56a2082.*Resolved/,
    });
    fireEvent.click(resolved);

    expect(within(resolved.closest("article")!).queryByRole("checkbox")).toBeNull();
    expect(slot.getAllByRole("checkbox", { name: "Add to agent" })).toHaveLength(3);
  });

  it("sends the selected threads of its own thread, then clears the selection", async () => {
    const slot = renderTabSending(() => ({ kind: "sent", delivery: "sent", threadCount: 2 }), threaded);
    await selectTwo(slot);

    fireEvent.click(slot.getByRole("button", { name: "Send 2 to agent" }));

    await waitFor(() => expect(slot.queryByRole("button", { name: /to agent/ })).toBeNull());
    expect(sendCalls(slot)).toEqual([
      expect.objectContaining({ input: { threadId: "thr_1", reviewThreadIds: [PLACED, OUTDATED] } }),
    ]);
    expect(checkboxOf(slot, PLACED_TEXT).checked).toBe(false);
    expect(slot.getByText("Sent to agent")).toBeTruthy();
  });

  it("says when the message waits for a busy agent", async () => {
    const slot = renderTabSending(() => ({ kind: "sent", delivery: "queued", threadCount: 2 }), threaded);
    await selectTwo(slot);

    fireEvent.click(slot.getByRole("button", { name: "Send 2 to agent" }));

    expect(await slot.findByText("Queued until the agent is idle")).toBeTruthy();
  });

  it("says how many threads were sent when some got resolved in the meantime", async () => {
    const slot = renderTabSending(() => ({ kind: "sent", delivery: "sent", threadCount: 1 }), threaded);
    await selectTwo(slot);

    fireEvent.click(slot.getByRole("button", { name: "Send 2 to agent" }));

    expect(await slot.findByText("Sent 1 of 2 to agent")).toBeTruthy();
  });

  it("keeps a thread selected during the send, which was not sent", async () => {
    let finish: (result: SendToAgentResult) => void = () => {};
    const slot = renderTabSending(() => new Promise((resolve) => (finish = resolve)), threaded);
    await slot.findAllByTestId("line-annotation");
    fireEvent.click(checkboxOf(slot, PLACED_TEXT));

    fireEvent.click(slot.getByRole("button", { name: "Send 1 to agent" }));
    fireEvent.click(outdatedCheckbox(slot));
    await act(async () => finish({ kind: "sent", delivery: "sent", threadCount: 1 }));

    expect(outdatedCheckbox(slot).checked).toBe(true);
    expect(checkboxOf(slot, PLACED_TEXT).checked).toBe(false);
  });

  it("shows the error and keeps the selection when the send fails", async () => {
    const slot = renderTabSending(() => ({ kind: "error", message: "gh not logged in" }), threaded);
    await selectTwo(slot);

    fireEvent.click(slot.getByRole("button", { name: "Send 2 to agent" }));

    const alert = await slot.findByRole("alert");
    expect(alert.textContent).toContain("gh not logged in");
    expect(slot.getByRole("button", { name: "Send 2 to agent" })).toBeTruthy();
    expect(checkboxOf(slot, PLACED_TEXT).checked).toBe(true);
  });

  it("shows the error and keeps the selection when the call throws", async () => {
    const slot = renderTabSending(() => {
      throw new Error("Thread is archived");
    }, threaded);
    await selectTwo(slot);

    fireEvent.click(slot.getByRole("button", { name: "Send 2 to agent" }));

    expect((await slot.findByRole("alert")).textContent).toContain("Thread is archived");
    expect(slot.getByRole("button", { name: "Send 2 to agent" })).toBeTruthy();
  });

  it("stops counting a selected thread that got resolved", async () => {
    const resolved = {
      ...threaded,
      threads: {
        ...threaded.threads,
        outdated: threaded.threads.outdated.map((thread) => ({ ...thread, resolved: true })),
      },
    };
    const slot = renderTab(threaded, resolved);
    await selectTwo(slot);

    await slot.behavior.emitRealtime("review.updated", { threadId: "thr_1" });

    expect(await slot.findByRole("button", { name: "Send 1 to agent" })).toBeTruthy();
  });
});

describe("Review tab thread actions", () => {
  const PLACED = "PRRT_kwDOHI7l-86jxula";
  const OPEN_THREAD = "There's no wait for the new row to mount";
  const REPLY = 'Fixed in "abc123"\nThanks';

  async function openCard(slot: ReturnType<typeof renderTab>) {
    await slot.findAllByTestId("line-annotation");
    const annotation = slot
      .getAllByTestId("line-annotation")
      .find((candidate) => candidate.textContent?.includes(OPEN_THREAD))!;
    return within(annotation.querySelector("article")!);
  }

  function typeReply(card: Awaited<ReturnType<typeof openCard>>, text = REPLY) {
    fireEvent.change(card.getByRole("textbox", { name: "Reply" }), { target: { value: text } });
  }

  function writeCalls(slot: ReturnType<typeof renderTab>) {
    return slot.inspection.rpcCalls.filter((call) => call.method !== "getReview");
  }

  function resolvedPlaced(): ReviewResult {
    return {
      ...threaded,
      threads: {
        ...threaded.threads,
        placed: threaded.threads.placed.map((placed) =>
          placed.thread.id === PLACED ? { ...placed, thread: { ...placed.thread, resolved: true } } : placed,
        ),
      },
    };
  }

  it("does not post an empty reply", async () => {
    const card = await openCard(renderTab(threaded));

    expect(card.getByRole("button", { name: "Post" }).hasAttribute("disabled")).toBe(true);
    typeReply(card, "   ");
    expect(card.getByRole("button", { name: "Post + resolve" }).hasAttribute("disabled")).toBe(true);
  });

  it("posts the reply, clears the box, and loads the thread again", async () => {
    const slot = renderTab(threaded);
    const card = await openCard(slot);

    typeReply(card);
    fireEvent.click(card.getByRole("button", { name: "Post" }));

    await waitFor(() => expect(slot.inspection.rpcCalls.map((call) => call.method)).toEqual(["getReview", "reply", "getReview"]));
    expect(writeCalls(slot)[0]!.input).toEqual({ threadId: "thr_1", reviewThreadId: PLACED, body: REPLY, resolve: false });
    expect((card.getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement).value).toBe("");
  });

  it("asks to post and resolve on 'Post + resolve'", async () => {
    const slot = renderTab(threaded);
    const card = await openCard(slot);

    typeReply(card);
    fireEvent.click(card.getByRole("button", { name: "Post + resolve" }));

    await waitFor(() => expect(writeCalls(slot)).toHaveLength(1));
    expect(writeCalls(slot)[0]!.input).toMatchObject({ reviewThreadId: PLACED, resolve: true });
  });

  it("shows the error and keeps the text when the post fails", async () => {
    const slot = renderTabWith({ reply: () => ({ kind: "post_failed", message: "gh not logged in" }) }, threaded);
    const card = await openCard(slot);

    typeReply(card);
    fireEvent.click(card.getByRole("button", { name: "Post" }));

    expect((await card.findByRole("alert")).textContent).toBe("gh not logged in");
    expect((card.getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement).value).toBe(REPLY);
    expect(slot.inspection.rpcCalls.map((call) => call.method)).toEqual(["getReview", "reply"]);
  });

  it("keeps the text when the reply call itself fails", async () => {
    const slot = renderTabWith({ reply: () => Promise.reject(new Error("host unreachable")) }, threaded);
    const card = await openCard(slot);

    typeReply(card);
    fireEvent.click(card.getByRole("button", { name: "Post" }));

    expect((await card.findByRole("alert")).textContent).toBe("host unreachable");
    expect((card.getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement).value).toBe(REPLY);
  });

  it("disables the box and the actions while a post runs", async () => {
    const slot = renderTabWith({ reply: () => new Promise<ReplyResult>(() => {}) }, threaded);
    const card = await openCard(slot);

    typeReply(card);
    fireEvent.click(card.getByRole("button", { name: "Post" }));

    await waitFor(() => expect(card.getByRole("textbox", { name: "Reply" }).hasAttribute("disabled")).toBe(true));
    for (const name of ["Post", "Post + resolve", "Resolve"]) {
      expect(card.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    }
  });

  it("shows the resolve error after the reply was posted", async () => {
    const slot = renderTabWith(
      { reply: () => ({ kind: "posted", pendingReviewUrl: null, resolveError: "rate limited" }) },
      threaded,
    );
    const card = await openCard(slot);

    typeReply(card);
    fireEvent.click(card.getByRole("button", { name: "Post + resolve" }));

    expect((await card.findByRole("alert")).textContent).toBe("rate limited");
    expect((card.getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement).value).toBe("");
    await waitFor(() => expect(slot.inspection.rpcCalls.map((call) => call.method)).toEqual(["getReview", "reply", "getReview"]));
  });

  it("says when the reply went into the user's pending review", async () => {
    const prUrl = "https://github.com/collibra/frontend/pull/25259";
    const slot = renderTabWith({ reply: () => ({ kind: "posted", pendingReviewUrl: prUrl, resolveError: null }) }, threaded);
    const card = await openCard(slot);

    typeReply(card);
    fireEvent.click(card.getByRole("button", { name: "Post" }));

    const notice = await card.findByText("Reply added to your pending review.", { exact: false });
    expect(within(notice).getByRole("link", { name: "Open the PR" }).getAttribute("href")).toBe(prUrl);
  });

  it("resolves the thread and loads again", async () => {
    const slot = renderTab(threaded, resolvedPlaced());
    const card = await openCard(slot);

    fireEvent.click(card.getByRole("button", { name: "Resolve" }));

    await waitFor(() => expect(slot.queryByText(OPEN_THREAD, { exact: false })).toBeNull());
    expect(writeCalls(slot).map((call) => call.input)).toEqual([
      { threadId: "thr_1", reviewThreadId: PLACED, resolved: true },
    ]);
  });

  it("shows the error when the resolve fails", async () => {
    const slot = renderTabWith({ setResolved: () => ({ kind: "error", message: "rate limited" }) }, threaded);
    const card = await openCard(slot);

    fireEvent.click(card.getByRole("button", { name: "Resolve" }));

    expect((await card.findByRole("alert")).textContent).toBe("rate limited");
    expect(slot.inspection.rpcCalls.map((call) => call.method)).toEqual(["getReview", "setResolved"]);
  });

  it("unresolves a resolved thread, which has no reply box", async () => {
    const slot = renderTab(resolvedPlaced());

    fireEvent.click(await slot.findByRole("checkbox", { name: "Show resolved" }));
    fireEvent.click(slot.getByRole("button", { name: /a-bandziuk.*Resolved/ }));
    const card = within(slot.getByRole("button", { name: /a-bandziuk.*Resolved/ }).closest("article")!);
    expect(card.queryByRole("textbox", { name: "Reply" })).toBeNull();
    fireEvent.click(card.getByRole("button", { name: "Unresolve" }));

    await waitFor(() => expect(writeCalls(slot).map((call) => call.input)).toEqual([
      { threadId: "thr_1", reviewThreadId: PLACED, resolved: false },
    ]));
  });

  describe("summary signal", () => {
    let signals: unknown[];

    afterEach(stopListening);

    async function noSignalAfter(slot: ReturnType<typeof renderTab>, calls: number) {
      await waitFor(() => expect(slot.inspection.rpcCalls).toHaveLength(calls));
      await quietly();
      expect(signals).toEqual([]);
    }

    it("announces the new summary after a resolve", async () => {
      signals = listenForSummaries();
      const card = await openCard(renderTab(threaded, resolvedPlaced()));

      fireEvent.click(card.getByRole("button", { name: "Resolve" }));

      await waitFor(() => expect(signals).toEqual([{ threadId: "thr_1" }]));
    });

    it("announces the new summary after an unresolve", async () => {
      signals = listenForSummaries();
      const slot = renderTab(resolvedPlaced());
      fireEvent.click(await slot.findByRole("checkbox", { name: "Show resolved" }));
      fireEvent.click(slot.getByRole("button", { name: /a-bandziuk.*Resolved/ }));
      const card = within(slot.getByRole("button", { name: /a-bandziuk.*Resolved/ }).closest("article")!);

      fireEvent.click(card.getByRole("button", { name: "Unresolve" }));

      await waitFor(() => expect(signals).toEqual([{ threadId: "thr_1" }]));
    });

    it("announces the new summary after a post and resolve", async () => {
      signals = listenForSummaries();
      const card = await openCard(renderTab(threaded));

      typeReply(card);
      fireEvent.click(card.getByRole("button", { name: "Post + resolve" }));

      await waitFor(() => expect(signals).toEqual([{ threadId: "thr_1" }]));
    });

    it("does not announce after a post without resolve", async () => {
      signals = listenForSummaries();
      const slot = renderTab(threaded);
      const card = await openCard(slot);

      typeReply(card);
      fireEvent.click(card.getByRole("button", { name: "Post" }));

      await noSignalAfter(slot, 3);
    });

    it("does not announce when the resolve fails", async () => {
      signals = listenForSummaries();
      const slot = renderTabWith({ setResolved: () => ({ kind: "error", message: "rate limited" }) }, threaded);
      const card = await openCard(slot);

      fireEvent.click(card.getByRole("button", { name: "Resolve" }));

      await noSignalAfter(slot, 2);
    });

    it("does not announce when the resolve after a post fails", async () => {
      signals = listenForSummaries();
      const slot = renderTabWith(
        { reply: () => ({ kind: "posted", pendingReviewUrl: null, resolveError: "rate limited" }) },
        threaded,
      );
      const card = await openCard(slot);

      typeReply(card);
      fireEvent.click(card.getByRole("button", { name: "Post + resolve" }));

      await noSignalAfter(slot, 3);
    });
  });

  it("keeps the reply text when a thread above it in the file gets resolved", async () => {
    const [first, second] = threaded.threads.placed;
    const sameFile = { ...second!, thread: { ...second!.thread, path: first!.thread.path } };
    const before: ReviewResult = { ...threaded, threads: { ...threaded.threads, placed: [first!, sameFile] } };
    const after: ReviewResult = {
      ...before,
      threads: { ...before.threads, placed: [{ ...first!, thread: { ...first!.thread, resolved: true } }, sameFile] },
    };
    const slot = renderTab(before, after);
    const card = await openCard(slot);
    typeReply(card, "Half written");

    await slot.behavior.emitRealtime("review.updated", { threadId: "thr_1" });

    await waitFor(() => expect(slot.getAllByTestId("line-annotation")).toHaveLength(1));
    const moved = within(slot.getByTestId("line-annotation"));
    expect((moved.getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement).value).toBe("Half written");
  });
});

const APP_TSX = "plugins/github-insight/app.tsx";

function commentDraft(id: string, overrides: Partial<ListedCommentDraft> = {}): ListedCommentDraft {
  return {
    id,
    path: APP_TSX,
    side: "RIGHT",
    line: 4,
    startLine: null,
    body: "Name the slot id",
    commitOid: "def456",
    updatedAt: 1,
    source: "agent",
    ...overrides,
  };
}

function withCommentDrafts(...commentDrafts: ListedCommentDraft[]): ReviewResult {
  return { ...recorded, commentDrafts };
}

async function findCommentDraft(slot: ReturnType<typeof renderTab>) {
  const card = await slot.findByRole("region", { name: "Draft from agent" });
  return { card, box: within(card).getByRole("textbox", { name: "Comment" }) as HTMLTextAreaElement };
}

describe("Review tab comment drafts", () => {
  it("shows a comment draft below its line on the new side, as 'Draft from agent'", async () => {
    const slot = renderTab(withCommentDrafts(commentDraft("c1")));

    const { card, box } = await findCommentDraft(slot);
    expect(box.value).toBe("Name the slot id");
    const annotation = card.closest("[data-testid=line-annotation]") as HTMLElement;
    expect(annotation.dataset).toMatchObject({ side: "additions", line: "4" });
    expect(annotation.closest("[data-testid=file-diff]")!.getAttribute("data-path")).toBe(APP_TSX);
  });

  it("shows a draft on the old side on the deletions side", async () => {
    const slot = renderTab(withCommentDrafts(commentDraft("c1", { side: "LEFT" })));

    const { card } = await findCommentDraft(slot);
    expect((card.closest("[data-testid=line-annotation]") as HTMLElement).dataset.side).toBe("deletions");
  });

  it("names the range of a draft on more than one line", async () => {
    const slot = renderTab(withCommentDrafts(commentDraft("c1", { startLine: 2 })));

    const { card } = await findCommentDraft(slot);
    expect(within(card).getByText("Lines 2-4")).toBeTruthy();
  });

  it("shows a comment draft saved while the tab is open", async () => {
    const slot = renderTab(recorded, withCommentDrafts(commentDraft("c1")));
    await slot.findByText("3 files changed");

    await slot.behavior.emitRealtime("review.updated", { threadId: "thr_1" });

    expect((await findCommentDraft(slot)).box.value).toBe("Name the slot id");
  });

  it("saves the last edit of a comment draft once the typing stops", async () => {
    const slot = renderTab(withCommentDrafts(commentDraft("c1")));
    const { box } = await findCommentDraft(slot);

    fireEvent.change(box, { target: { value: "Name" } });
    fireEvent.change(box, { target: { value: "Name the panel id" } });

    await waitFor(() => expect(callsTo(slot, "saveCommentDraft")).toHaveLength(1));
    expect(callsTo(slot, "saveCommentDraft")).toEqual([{ threadId: "thr_1", draftId: "c1", body: "Name the panel id" }]);
  });

  it("saves an unsaved comment edit when the tab closes", async () => {
    const slot = renderTab(withCommentDrafts(commentDraft("c1")));
    const { box } = await findCommentDraft(slot);

    fireEvent.change(box, { target: { value: "Name the panel id" } });
    slot.unmount();

    await waitFor(() =>
      expect(callsTo(slot, "saveCommentDraft")).toEqual([{ threadId: "thr_1", draftId: "c1", body: "Name the panel id" }]),
    );
  });

  it("keeps the edited comment when the tab loads the stored draft again", async () => {
    const slot = renderTab(withCommentDrafts(commentDraft("c1")));
    const { box } = await findCommentDraft(slot);

    fireEvent.change(box, { target: { value: "Name the panel id" } });
    await slot.behavior.emitRealtime("review.updated", { threadId: "thr_1" });

    await waitFor(() => expect(methods(slot).filter((method) => method === "getReview")).toHaveLength(2));
    expect((await findCommentDraft(slot)).box.value).toBe("Name the panel id");
  });

  it("deletes a comment draft without a GitHub write, and loads again", async () => {
    const slot = renderTab(withCommentDrafts(commentDraft("c1")), recorded);
    const { card } = await findCommentDraft(slot);

    fireEvent.click(within(card).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(slot.queryByRole("region", { name: "Draft from agent" })).toBeNull());
    expect(methods(slot)).toEqual(["getReview", "deleteCommentDraft", "getReview"]);
    expect(callsTo(slot, "deleteCommentDraft")).toEqual([{ threadId: "thr_1", draftId: "c1" }]);
  });

  it("keeps the comment draft and shows the error when the delete fails", async () => {
    const slot = renderTabWith(
      { deleteCommentDraft: () => ({ kind: "error", message: "No pull request for this thread" }) },
      withCommentDrafts(commentDraft("c1")),
    );
    const { card } = await findCommentDraft(slot);

    fireEvent.click(within(card).getByRole("button", { name: "Delete" }));

    expect((await within(card).findByRole("alert")).textContent).toBe("No pull request for this thread");
    expect((await findCommentDraft(slot)).box.value).toBe("Name the slot id");
  });

  it("shows the error when a comment edit cannot be saved", async () => {
    const slot = renderTabWith(
      { saveCommentDraft: () => ({ kind: "error", message: "Comment draft c1 is gone" }) },
      withCommentDrafts(commentDraft("c1")),
    );
    const { card, box } = await findCommentDraft(slot);

    fireEvent.change(box, { target: { value: "Name the panel id" } });

    expect((await within(card).findByRole("alert")).textContent).toBe("Comment draft c1 is gone");
  });
});

describe("Review tab drafts on an older commit", () => {
  const older = commentDraft("c1", { commitOid: "abc123", side: "LEFT", startLine: 2 });

  it("warns with both commits and lists the drafts above the files, not on their lines", async () => {
    const slot = renderTab(withCommentDrafts(older));

    const section = await slot.findByRole("region", { name: "Drafts on an older commit" });
    expect(within(section).getByText("PR has new commits since these drafts (abc123 -> def456)")).toBeTruthy();
    const card = within(section).getByRole("region", { name: "Draft from agent" });
    expect(within(card).getByText(APP_TSX)).toBeTruthy();
    expect(within(card).getByText("Old side")).toBeTruthy();
    expect(within(card).getByText("Lines 2-4")).toBeTruthy();
    expect((within(card).getByRole("textbox", { name: "Comment" }) as HTMLTextAreaElement).value).toBe("Name the slot id");
    const [firstDiff] = await slot.findAllByTestId("file-diff");
    expect(section.compareDocumentPosition(firstDiff!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(slot.queryAllByTestId("line-annotation")).toEqual([]);
  });

  it("has no older-commit section when all drafts are at the head", async () => {
    const slot = renderTab(withCommentDrafts(commentDraft("c1")));

    await findCommentDraft(slot);
    expect(slot.queryByRole("region", { name: "Drafts on an older commit" })).toBeNull();
  });
});

describe("Review tab submit panel", () => {
  const summary = { body: "Looks good overall", updatedAt: 5, source: "agent" as const };
  const ownPr = { ...recorded, head: { ...recorded.head, viewerIsAuthor: true } };
  const merged = {
    ...withCommentDrafts(commentDraft("c1")),
    head: { ...recorded.head, state: "MERGED" as const },
  };
  const withDraftsAndSummary = { ...withCommentDrafts(commentDraft("c1"), commentDraft("c2")), summaryDraft: summary };

  async function openPanel(slot: ReturnType<typeof renderTab>) {
    const toggle = await slot.findByRole("button", { name: "Submit review" });
    if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
    return within(slot.getByRole("region", { name: "Submit review" }));
  }

  function verdicts(panel: ReturnType<typeof within>) {
    return panel.getAllByRole("radio").map((radio: HTMLElement) => radio.closest("label")!.textContent);
  }

  function submitButton(panel: ReturnType<typeof within>) {
    return panel.getByRole("button", { name: "Submit" }) as HTMLButtonElement;
  }

  function summaryBox(panel: ReturnType<typeof within>) {
    return panel.getByRole("textbox", { name: "Summary" }) as HTMLTextAreaElement;
  }

  it("is closed when there are no drafts, and opens from the header", async () => {
    const slot = renderTab(recorded);

    const toggle = await slot.findByRole("button", { name: "Submit review" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(slot.queryByRole("region", { name: "Submit review" })).toBeNull();
    fireEvent.click(toggle);

    expect(slot.getByRole("region", { name: "Submit review" })).toBeTruthy();
  });

  it("is open with the summary draft and the number of comment drafts", async () => {
    const slot = renderTab(withDraftsAndSummary);

    const panel = await openPanel(slot);
    expect(slot.getByRole("button", { name: "Submit review" }).getAttribute("aria-expanded")).toBe("true");
    expect(summaryBox(panel).value).toBe("Looks good overall");
    expect(panel.getByText("2 comments")).toBeTruthy();
  });

  it("shows Comment, Approve, and Request changes on another person's PR", async () => {
    const slot = renderTab(recorded);

    expect(verdicts(await openPanel(slot))).toEqual(["Comment", "Approve", "Request changes"]);
  });

  it("shows only Comment on the user's own PR", async () => {
    const slot = renderTab(ownPr);

    expect(verdicts(await openPanel(slot))).toEqual(["Comment"]);
  });

  it("disables Request changes without a summary, with the reason", async () => {
    const slot = renderTab(withCommentDrafts(commentDraft("c1")));
    const panel = await openPanel(slot);

    fireEvent.click(panel.getByRole("radio", { name: "Request changes" }));

    expect(submitButton(panel).disabled).toBe(true);
    expect(panel.getByText("Add a summary to request changes")).toBeTruthy();
    fireEvent.change(summaryBox(panel), { target: { value: "Fix the null check" } });
    expect(submitButton(panel).disabled).toBe(false);
  });

  it("disables Comment with no summary and no comment drafts", async () => {
    const slot = renderTab(recorded);
    const panel = await openPanel(slot);

    expect(submitButton(panel).disabled).toBe(true);
    expect(panel.getByText("Add a summary or a comment")).toBeTruthy();
  });

  it("saves the summary once the typing stops", async () => {
    const slot = renderTab(recorded);
    const panel = await openPanel(slot);

    fireEvent.change(summaryBox(panel), { target: { value: "Looks" } });
    fireEvent.change(summaryBox(panel), { target: { value: "Looks good" } });

    await waitFor(() => expect(callsTo(slot, "saveSummaryDraft")).toEqual([{ threadId: "thr_1", body: "Looks good" }]));
  });

  it("keeps the typed summary when the panel closes and opens again", async () => {
    const slot = renderTab(recorded);
    const panel = await openPanel(slot);

    fireEvent.change(summaryBox(panel), { target: { value: "Looks good" } });
    fireEvent.click(slot.getByRole("button", { name: "Submit review" }));
    fireEvent.click(slot.getByRole("button", { name: "Submit review" }));

    expect(summaryBox(within(slot.getByRole("region", { name: "Submit review" }))).value).toBe("Looks good");
  });

  it("saves the edits first, submits the verdict and the summary, and shows no drafts after", async () => {
    const signals = listenForSummaries();
    const slot = renderTab(withDraftsAndSummary, recorded);
    const panel = await openPanel(slot);
    const box = within((await slot.findAllByRole("region", { name: "Draft from agent" }))[0]!).getByRole("textbox", { name: "Comment" });

    fireEvent.change(box, { target: { value: "Edited comment" } });
    fireEvent.change(summaryBox(panel), { target: { value: "Ship it" } });
    fireEvent.click(panel.getByRole("radio", { name: "Approve" }));
    fireEvent.click(submitButton(panel));

    expect(await panel.findByText("Review submitted")).toBeTruthy();
    await waitFor(() => expect(slot.queryByRole("region", { name: "Draft from agent" })).toBeNull());
    expect(summaryBox(panel).value).toBe("");
    expect(methods(slot)).toEqual(["getReview", "saveSummaryDraft", "saveCommentDraft", "submitReview", "getReview"]);
    expect(callsTo(slot, "submitReview")).toEqual([{ threadId: "thr_1", event: "APPROVE", body: "Ship it" }]);
    await waitFor(() => expect(signals).toEqual([{ threadId: "thr_1" }]));
    stopListening();
  });

  it("shows the GitHub error with a link to the PR and keeps the drafts and the summary", async () => {
    const slot = renderTabWith(
      {
        submitReview: () => ({
          kind: "error",
          message: "You have a pending review on GitHub. Submit or delete it there first.",
          url: "https://github.com/koenvangeert/bb-plugins/pull/1",
        }),
      },
      withDraftsAndSummary,
    );
    const panel = await openPanel(slot);

    fireEvent.click(submitButton(panel));

    const alert = await panel.findByRole("alert");
    expect(alert.textContent).toContain("You have a pending review on GitHub.");
    expect(within(alert).getByRole("link", { name: "Open the PR" }).getAttribute("href")).toBe(
      "https://github.com/koenvangeert/bb-plugins/pull/1",
    );
    expect(slot.getAllByRole("region", { name: "Draft from agent" })).toHaveLength(2);
    expect(summaryBox(panel).value).toBe("Looks good overall");
    expect(methods(slot)).toEqual(["getReview", "submitReview"]);
  });

  it("shows an error without a link when there is no PR url", async () => {
    const slot = renderTabWith(
      { submitReview: () => ({ kind: "error", message: "gh not logged in", url: null }) },
      withDraftsAndSummary,
    );
    const panel = await openPanel(slot);

    fireEvent.click(submitButton(panel));

    const alert = await panel.findByRole("alert");
    expect(alert.textContent).toBe("gh not logged in");
    expect(within(alert).queryByRole("link")).toBeNull();
  });

  it("shows the drafts of a merged PR and disables submit", async () => {
    const slot = renderTab(merged);
    const panel = await openPanel(slot);

    expect(await slot.findByRole("region", { name: "Draft from agent" })).toBeTruthy();
    expect(submitButton(panel).disabled).toBe(true);
    expect(panel.getByText("Pull request is merged")).toBeTruthy();
  });
});

describe("Review tab palette commands", () => {
  const submitRegion = (slot: ReturnType<typeof renderTab>) => slot.queryByRole("region", { name: "Submit review" });

  it("opens the submit panel once the review has loaded", async () => {
    postIntent("thr_1", "review", "submit");
    const slot = renderTab(recorded);

    expect(await slot.findByRole("region", { name: "Submit review" })).toBeTruthy();
    expect(callsTo(slot, "submitReview")).toEqual([]);
  });

  it("keeps an open panel open with the typed summary", async () => {
    const slot = renderTab(recorded);
    fireEvent.click(await slot.findByRole("button", { name: "Submit review" }));
    const summary = within(submitRegion(slot)!).getByRole("textbox", { name: "Summary" }) as HTMLTextAreaElement;
    fireEvent.change(summary, { target: { value: "Looks good" } });

    await act(async () => postIntent("thr_1", "review", "submit"));

    expect((within(submitRegion(slot)!).getByRole("textbox", { name: "Summary" }) as HTMLTextAreaElement).value).toBe(
      "Looks good",
    );
  });

  it("drops the request when the thread has no PR yet", async () => {
    postIntent("thr_1", "review", "submit");
    const slot = renderTab({ kind: "no_pr" }, recorded);
    await slot.findByText("No pull request for this thread");

    await slot.behavior.emitRealtime("review.updated", { threadId: "thr_1" });
    await slot.findByRole("button", { name: "Submit review" });
    await act(quietly);

    expect(submitRegion(slot)).toBeNull();
  });

  it("does not open the panel again when the tab mounts again", async () => {
    postIntent("thr_1", "review", "submit");
    const first = renderTab(recorded);
    await first.findByRole("region", { name: "Submit review" });
    first.unmount();

    const second = renderTab(recorded);
    await second.findByRole("button", { name: "Submit review" });
    await act(quietly);

    expect(submitRegion(second)).toBeNull();
  });
});
