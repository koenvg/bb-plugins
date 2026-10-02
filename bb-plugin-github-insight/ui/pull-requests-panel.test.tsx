// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { NewThreadComposerProps, PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import type {
  ActionResult,
  LinkedQueueList,
  LinkedQueuePr,
  LoadedReviewQueue,
  MyReview,
  ReviewQueueResult,
  ReviewQueueView,
  rpcContract,
} from "../contract";
import { buildReviewPrompt } from "../core/review-prompt";
import { isBuiltinIconName } from "../components/ui/icon";
import manifest from "../package.json";

const submitOutcomes: Promise<"cleared" | "kept">[] = [];

vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@get-bb/plugin-sdk/app")>();
  function DraftKeepingComposer(props: NewThreadComposerProps) {
    const Composer = actual.experimental_NewThreadComposer;
    return (
      <Composer
        {...props}
        onSubmit={(request) => {
          submitOutcomes.push(
            Promise.resolve()
              .then(() => props.onSubmit(request))
              .then(
                () => "cleared" as const,
                () => "kept" as const,
              ),
          );
        }}
      />
    );
  }
  return { ...actual, experimental_NewThreadComposer: DraftKeepingComposer };
});

const app = await loadPluginApp(() => import("../app"));
const panel = app.navPanels.find((registration) => registration.id === "pull-requests")!;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  submitOutcomes.length = 0;
});

function queuePr(overrides: Partial<LinkedQueuePr> = {}): LinkedQueuePr {
  return {
    repo: "acme/api",
    number: 15,
    title: "Add rate limits",
    author: "alice",
    createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    updatedAt: new Date().toISOString(),
    draft: false,
    ci: "passed",
    reviewDecision: "REVIEW_REQUIRED",
    headRefName: "rate-limits",
    url: "https://github.com/acme/api/pull/15",
    projectIds: ["prj_api", "prj_api_old"],
    threadId: null,
    ...overrides,
  };
}

function list(prs: LinkedQueuePr[], truncated = false): LinkedQueueList {
  const groups = [...new Set(prs.map((pr) => pr.repo))].map((repo) => ({
    repo,
    prs: prs.filter((pr) => pr.repo === repo),
  }));
  return { groups, truncated };
}

const LOADED_AT = Date.parse("2026-10-02T09:30:00Z");

function view(reviewRequests: LinkedQueuePr[], myReviews: MyReview[] = []): ReviewQueueView {
  return { myReviews, reviewRequests: list(reviewRequests), loadedAt: LOADED_AT };
}

function myReview(overrides: Partial<MyReview> = {}): MyReview {
  return {
    threadId: "thr_review",
    repo: "acme/api",
    number: 15,
    title: "Add rate limits",
    url: "https://github.com/acme/api/pull/15",
    status: "running",
    ...overrides,
  };
}

function ok(queueView: ReviewQueueView): LoadedReviewQueue {
  return { kind: "ok", ...queueView };
}

const unusedRpc = {
  getInsight: () => ({ kind: "no_pr" as const }),
  refresh: () => ({ kind: "no_pr" as const }),
  getReview: () => ({ kind: "no_pr" as const }),
  sendToAgent: () => ({ kind: "error" as const, message: "unused" }),
  reply: () => ({ kind: "post_failed" as const, message: "unused" }),
  setResolved: () => ({ kind: "error" as const, message: "unused" }),
  saveDraft: () => ({ kind: "error" as const, message: "unused" }),
  discardDraft: () => ({ kind: "error" as const, message: "unused" }),
  saveCommentDraft: () => ({ kind: "error" as const, message: "unused" }),
  deleteCommentDraft: () => ({ kind: "error" as const, message: "unused" }),
  saveSummaryDraft: () => ({ kind: "error" as const, message: "unused" }),
  submitReview: () => ({ kind: "error" as const, message: "unused", url: null }),
  runMergeAction: () => ({ kind: "error" as const, message: "unused" }),
};

type QueueHandler = () => ReviewQueueResult | Promise<ReviewQueueResult>;

interface PanelRpc {
  refreshReviewQueue: () => LoadedReviewQueue | Promise<LoadedReviewQueue>;
  startReview: () => { threadId: string } | Promise<{ threadId: string }>;
  archiveReview: () => ActionResult | Promise<ActionResult>;
}

function renderPanel(subPath: string, getReviewQueue: QueueHandler, rpc: Partial<PanelRpc> = {}) {
  return renderSlot<PluginNavPanelProps, typeof rpcContract>(
    panel,
    { subPath },
    {
      rpc: {
        ...unusedRpc,
        getReviewQueue,
        refreshReviewQueue: async () => {
          const result = await getReviewQueue();
          if (result.kind === "loading") throw new Error("unexpected loading");
          return result;
        },
        startReview: () => ({ threadId: "thr_new" }),
        archiveReview: () => ({ kind: "ok" }),
        ...rpc,
      },
    },
  );
}

async function findCard(slot: ReturnType<typeof renderPanel>, listName: string, name: string) {
  const section = await slot.findByRole("region", { name: listName });
  return within(section).getByRole("listitem", { name });
}

function rpcMethods(slot: ReturnType<typeof renderPanel>) {
  return slot.inspection.rpcCalls.map((call) => call.method);
}

describe("Pull Requests panel routes", () => {
  it("registers the Pull Requests nav panel", () => {
    expect(panel).toMatchObject({ title: "Pull Requests", path: "pull-requests" });
  });

  it("uses a bb icon name for the nav panel and the plugin branding, which bb shows in its place", () => {
    expect(isBuiltinIconName(panel.icon)).toBe(true);
    expect(manifest.bb.branding.icon).toBe(panel.icon);
  });

  it("leaves the panel title to the host header", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])));

    await findCard(slot, "Review requests", "acme/api#15");
    expect(slot.queryByRole("heading", { name: "Pull Requests" })).toBeNull();
  });

  it("renders the lists at the panel root", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])));

    expect(await slot.findByRole("region", { name: "Review requests" })).toBeTruthy();
    expect(slot.queryByTestId("bb-new-thread-composer")).toBeNull();
  });

  it("renders the composer for a review subpath", async () => {
    const slot = renderPanel("review/acme/api/15", () => ok(view([queuePr()])));

    expect(await slot.findByTestId("bb-new-thread-composer")).toBeTruthy();
    expect(slot.queryByRole("region", { name: "Review requests" })).toBeNull();
  });

  it("renders the lists for an unknown subpath", async () => {
    const slot = renderPanel("review/acme/api/not-a-number", () => ok(view([queuePr()])));

    expect(await slot.findByRole("region", { name: "Review requests" })).toBeTruthy();
  });
});

describe("Pull Requests lists", () => {
  it("shows the number of review requests in the list header", async () => {
    const slot = renderPanel("", () =>
      ok(view([queuePr(), queuePr({ number: 12 }), queuePr({ repo: "acme/web", number: 3 })])),
    );

    const reviews = await slot.findByRole("region", { name: "Review requests" });
    expect(within(reviews).getByTestId("queue-count").textContent).toBe("3");
  });

  it("shows the repo groups in server order", async () => {
    const slot = renderPanel("", () =>
      ok(view([queuePr(), queuePr({ repo: "acme/web", number: 3 })])),
    );

    const reviews = await slot.findByRole("region", { name: "Review requests" });
    expect(
      within(reviews)
        .getAllByTestId("queue-group")
        .map((heading) => heading.textContent),
    ).toEqual(["acme/api", "acme/web"]);
  });

  it("shows the number, title, author, and age on a card", async () => {
    const slot = renderPanel("", () =>
      ok(view([queuePr({ updatedAt: new Date(Date.now() - 2 * 3_600_000).toISOString() })])),
    );

    const card = await findCard(slot, "Review requests", "acme/api#15");
    expect(within(card).getByRole("heading").textContent).toBe("#15 Add rate limits");
    expect(within(card).getByText("alice")).toBeTruthy();
    expect(within(card).getByText("2 hours ago")).toBeTruthy();
    expect(within(card).queryByText("Draft")).toBeNull();
  });

  it("shows the repository on the group header and not on each card", async () => {
    const slot = renderPanel("", () => ok(view([queuePr(), queuePr({ number: 12 }), queuePr({ number: 9 })])));

    const reviews = await slot.findByRole("region", { name: "Review requests" });
    expect(within(reviews).getAllByText("acme/api")).toHaveLength(1);
    expect(within(reviews).getByTestId("queue-group").textContent).toBe("acme/api");
  });

  it("shows the time since the last update, not since creation", async () => {
    const slot = renderPanel("", () =>
      ok(
        view([
          queuePr({
            createdAt: new Date(Date.now() - 150 * 86_400_000).toISOString(),
            updatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
          }),
        ]),
      ),
    );

    const card = await findCard(slot, "Review requests", "acme/api#15");
    expect(within(card).getByText("2 days ago")).toBeTruthy();
  });

  it("puts the author, CI, review decision, and actions in one meta row", async () => {
    const slot = renderPanel("", () => ok(view([queuePr({ draft: true })])));

    const card = await findCard(slot, "Review requests", "acme/api#15");
    const meta = within(card).getByTestId("queue-meta");
    expect(within(meta).getByText("alice")).toBeTruthy();
    expect(within(meta).getByTestId("queue-ci")).toBeTruthy();
    expect(within(meta).getByTestId("queue-review-decision")).toBeTruthy();
    expect(within(meta).getByText("Draft")).toBeTruthy();
    expect(within(meta).getByRole("button", { name: "Review in thread" })).toBeTruthy();
    expect(within(meta).getByRole("link", { name: "Open on GitHub" })).toBeTruthy();
  });

  it("shows Draft on a draft card", async () => {
    const slot = renderPanel("", () => ok(view([queuePr({ draft: true, ci: "failed" })])));

    const card = await findCard(slot, "Review requests", "acme/api#15");
    expect(within(card).getByText("Draft")).toBeTruthy();
    expect(within(card).getByTestId("queue-ci").textContent).toBe("CI failed");
  });

  it.each([
    ["passed", "CI passed"],
    ["failed", "CI failed"],
    ["running", "CI running"],
    ["none", "No checks"],
  ] as const)("shows CI state %s", async (ci, text) => {
    const slot = renderPanel("", () => ok(view([queuePr({ ci })])));

    const card = await findCard(slot, "Review requests", "acme/api#15");
    expect(within(card).getByTestId("queue-ci").textContent).toBe(text);
  });

  it.each([
    ["APPROVED", "Approved"],
    ["CHANGES_REQUESTED", "Changes requested"],
    ["REVIEW_REQUIRED", "Review required"],
  ] as const)("shows review decision %s", async (reviewDecision, text) => {
    const slot = renderPanel("", () => ok(view([queuePr({ reviewDecision })])));

    const card = await findCard(slot, "Review requests", "acme/api#15");
    expect(within(card).getByTestId("queue-review-decision").textContent).toBe(text);
  });

  it("shows no review decision when GitHub has none", async () => {
    const slot = renderPanel("", () => ok(view([queuePr({ reviewDecision: null })])));

    const card = await findCard(slot, "Review requests", "acme/api#15");
    expect(within(card).queryByTestId("queue-review-decision")).toBeNull();
  });

  it("links every card to the PR on GitHub", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])));

    const review = await findCard(slot, "Review requests", "acme/api#15");
    expect(
      within(review).getByRole("link", { name: "Open on GitHub" }).getAttribute("href"),
    ).toBe("https://github.com/acme/api/pull/15");
  });

  it("says when a list holds only the first 50 PRs", async () => {
    const slot = renderPanel("", () => ok({ ...view([]), reviewRequests: list([queuePr()], true) }));

    const reviews = await slot.findByRole("region", { name: "Review requests" });
    expect(within(reviews).getByText("Showing first 50")).toBeTruthy();
  });

  it("says when a list is empty", async () => {
    const slot = renderPanel("", () => ok(view([])));

    const reviews = await slot.findByRole("region", { name: "Review requests" });
    expect(within(reviews).getByText("No review requests")).toBeTruthy();
    expect(within(reviews).getByTestId("queue-count").textContent).toBe("0");
  });

  it("keeps the old lists visible during a manual refresh", async () => {
    let finish: (result: LoadedReviewQueue) => void = () => {};
    const slot = renderPanel("", () => ok(view([queuePr()])), {
      refreshReviewQueue: () => new Promise((resolve) => (finish = resolve)),
    });

    await findCard(slot, "Review requests", "acme/api#15");
    fireEvent.click(slot.getByRole("button", { name: "Refresh" }));

    await slot.findByRole("button", { name: "Refreshing…" });
    expect(slot.getByText("Add rate limits")).toBeTruthy();
    await act(async () => finish(ok(view([queuePr({ title: "Add rate limits v2" })]))));
    await slot.findByText("Add rate limits v2");
    expect(rpcMethods(slot)).toEqual(["getReviewQueue", "refreshReviewQueue"]);
  });
});

describe("Pull Requests card actions", () => {
  it("offers Review in thread on a review request with a project", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])));

    const card = await findCard(slot, "Review requests", "acme/api#15");
    fireEvent.click(within(card).getByRole("button", { name: "Review in thread" }));

    expect(within(card).queryByRole("button", { name: "Open thread" })).toBeNull();
    expect(slot.inspection.navigateCalls).toEqual([
      {
        method: "toPluginPanel",
        path: "pull-requests",
        options: { subPath: "review/acme/api/15" },
      },
    ]);
  });

  it("shows the no project hint once on the group header and only Open on GitHub on its cards", async () => {
    const slot = renderPanel("", () =>
      ok(view([queuePr({ projectIds: [] }), queuePr({ number: 12, projectIds: [] })])),
    );

    const reviews = await slot.findByRole("region", { name: "Review requests" });
    expect(within(reviews).getAllByText("No bb project for this repository")).toHaveLength(1);
    for (const name of ["acme/api#15", "acme/api#12"]) {
      const card = within(reviews).getByRole("listitem", { name });
      expect(within(card).queryByText("No bb project for this repository")).toBeNull();
      expect(within(card).queryByRole("button")).toBeNull();
      expect(within(card).getByRole("link", { name: "Open on GitHub" })).toBeTruthy();
    }
  });

  it("shows no project hint on a group that has a project", async () => {
    const slot = renderPanel("", () =>
      ok(view([queuePr(), queuePr({ repo: "acme/web", number: 3, projectIds: [] })])),
    );

    const reviews = await slot.findByRole("region", { name: "Review requests" });
    expect(within(reviews).getAllByText("No bb project for this repository")).toHaveLength(1);
    expect(within(await findCard(slot, "Review requests", "acme/api#15")).getByRole("button", { name: "Review in thread" })).toBeTruthy();
  });

  it("offers Open thread on a review request with a linked thread", async () => {
    const slot = renderPanel("", () => ok(view([queuePr({ threadId: "thr_linked" })])));

    const card = await findCard(slot, "Review requests", "acme/api#15");
    expect(within(card).queryByRole("button", { name: "Review in thread" })).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Open thread" }));

    expect(slot.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "thr_linked" }]);
  });
});

describe("Pull Requests updates", () => {
  it("renders the stored view on mount without a refresh", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])));

    await findCard(slot, "Review requests", "acme/api#15");
    expect(rpcMethods(slot)).toEqual(["getReviewQueue"]);
  });

  it("shows loading until the first background load is published", async () => {
    const slot = renderPanel("", () => ({ kind: "loading" }));

    expect(await slot.findByText("Loading pull requests…")).toBeTruthy();
    await slot.behavior.emitRealtime("review-queue.updated", ok(view([queuePr()])));

    expect(await findCard(slot, "Review requests", "acme/api#15")).toBeTruthy();
    expect(slot.queryByText("Loading pull requests…")).toBeNull();
  });

  it("shows a published update without a call", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])));
    await findCard(slot, "Review requests", "acme/api#15");

    await slot.behavior.emitRealtime(
      "review-queue.updated",
      ok(view([queuePr(), queuePr({ number: 16, title: "Add caching" })])),
    );

    expect(await findCard(slot, "Review requests", "acme/api#16")).toBeTruthy();
    expect(rpcMethods(slot)).toEqual(["getReviewQueue"]);
  });

  it("ignores a malformed update", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])));
    await findCard(slot, "Review requests", "acme/api#15");

    await slot.behavior.emitRealtime("review-queue.updated", { kind: "ok" });

    expect(await findCard(slot, "Review requests", "acme/api#15")).toBeTruthy();
  });

  it("asks the server to refresh on Refresh", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])));
    await findCard(slot, "Review requests", "acme/api#15");

    fireEvent.click(slot.getByRole("button", { name: "Refresh" }));

    await slot.findByRole("button", { name: "Refresh" });
    expect(rpcMethods(slot)).toEqual(["getReviewQueue", "refreshReviewQueue"]);
  });

  it("makes no calls of its own while open", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const slot = renderPanel("", () => ok(view([queuePr()])));
    await findCard(slot, "Review requests", "acme/api#15");

    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));

    expect(rpcMethods(slot)).toEqual(["getReviewQueue"]);
  });

  it("puts Refresh and the update time on the My reviews header row", async () => {
    const slot = renderPanel("", () => ok({ ...view([queuePr()]), loadedAt: Date.now() - 3 * 60_000 }));

    const section = await slot.findByRole("region", { name: "My reviews" });
    const headerRow = within(section).getByRole("heading", { name: /My reviews/ }).parentElement!;
    expect(within(headerRow).getByRole("button", { name: "Refresh" })).toBeTruthy();
    expect(headerRow.textContent).toContain("Updated 3 minutes ago");
    expect(slot.getAllByRole("button", { name: "Refresh" })).toHaveLength(1);
  });
});

describe("Pull Requests errors", () => {
  const notLoggedIn: ReviewQueueResult = {
    kind: "error",
    message: "gh not logged in",
    lastGood: null,
  };

  it("shows the reason and a retry action without earlier data", async () => {
    let result: ReviewQueueResult = notLoggedIn;
    const slot = renderPanel("", () => result);

    const alert = await slot.findByRole("alert");
    expect(within(alert).getByText("gh not logged in")).toBeTruthy();
    expect(within(alert).queryByText(/last updated/i)).toBeNull();
    expect(slot.queryByRole("region", { name: "Review requests" })).toBeNull();

    result = ok(view([queuePr()]));
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));

    await findCard(slot, "Review requests", "acme/api#15");
    expect(slot.queryByRole("alert")).toBeNull();
  });

  it("keeps the last good lists with their load time", async () => {
    const slot = renderPanel("", () => ({ ...notLoggedIn, lastGood: view([queuePr()]) }));

    const alert = await slot.findByRole("alert");
    expect(within(alert).getByText("gh not logged in")).toBeTruthy();
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(
      within(alert).getByText(/last updated/i).querySelector("time")?.dateTime,
    ).toBe("2026-10-02T09:30:00.000Z");
    expect(await findCard(slot, "Review requests", "acme/api#15")).toBeTruthy();
  });

  it("keeps the lists of an earlier load when a refresh fails", async () => {
    let result: ReviewQueueResult = ok(view([queuePr()]));
    const slot = renderPanel("", () => result);
    await findCard(slot, "Review requests", "acme/api#15");

    result = notLoggedIn;
    fireEvent.click(slot.getByRole("button", { name: "Refresh" }));

    const alert = await slot.findByRole("alert");
    expect(within(alert).getByText("gh not logged in")).toBeTruthy();
    expect(within(alert).getByText(/last updated/i)).toBeTruthy();
    expect(slot.getByText("Add rate limits")).toBeTruthy();
  });

  it("shows the message of a rejected call", async () => {
    const slot = renderPanel("", () => {
      throw new Error("No host available");
    });

    const alert = await slot.findByRole("alert");
    expect(within(alert).getByText("No host available")).toBeTruthy();
  });
});

describe("Review composer", () => {
  it("seeds the composer with the project, a new worktree, the prompt, and a draft key", async () => {
    const pr = queuePr();
    const slot = renderPanel("review/acme/api/15", () => ok(view([pr])));

    const composer = await slot.findByTestId("bb-new-thread-composer");
    expect(composer.dataset.defaultProjectId).toBe("prj_api");
    expect(JSON.parse(composer.dataset.defaultEnvironment!)).toEqual({
      type: "host",
      workspace: { type: "managed-worktree", baseBranch: { kind: "default" } },
    });
    expect(composer.dataset.draftKey).toBe("github-insight:review:acme/api#15");
    expect(
      (within(composer).getByTestId("bb-new-thread-composer-input") as HTMLTextAreaElement).value,
    ).toBe(buildReviewPrompt(pr));
  });

  it("goes back to the lists without starting a thread", async () => {
    const slot = renderPanel("review/acme/api/15", () => ok(view([queuePr()])));

    await slot.findByTestId("bb-new-thread-composer");
    fireEvent.click(slot.getByRole("button", { name: "Back" }));

    expect(slot.inspection.navigateCalls).toEqual([
      { method: "toPluginPanel", path: "pull-requests", options: { subPath: "" } },
    ]);
    expect(rpcMethods(slot)).not.toContain("startReview");
  });

  it("starts the review and opens the new thread", async () => {
    const slot = renderPanel("review/acme/api/15", () => ok(view([queuePr()])));

    fireEvent.click(await slot.findByTestId("bb-new-thread-composer-submit"));

    expect(await submitOutcomes[0]).toBe("cleared");
    const start = slot.inspection.rpcCalls.find((call) => call.method === "startReview");
    expect(start?.input).toMatchObject({
      pr: {
        repo: "acme/api",
        number: 15,
        title: "Add rate limits",
        url: "https://github.com/acme/api/pull/15",
      },
      request: {
        projectId: "prj_api",
        environment: { type: "host", workspace: { type: "managed-worktree" } },
        input: [{ type: "text", text: buildReviewPrompt(queuePr()) }],
      },
    });
    expect(slot.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "thr_new" }]);
  });

  it("keeps the draft and shows the error when the start fails", async () => {
    const slot = renderPanel("review/acme/api/15", () => ok(view([queuePr()])), {
      startReview: () => {
        throw new Error("spawn failed");
      },
    });

    fireEvent.click(await slot.findByTestId("bb-new-thread-composer-submit"));

    expect(await submitOutcomes[0]).toBe("kept");
    const alert = await slot.findByRole("alert");
    expect(within(alert).getByText("spawn failed")).toBeTruthy();
    expect(slot.inspection.navigateCalls).toEqual([]);
  });

  it("keeps the first project when an update changes the project order", async () => {
    const slot = renderPanel("review/acme/api/15", () => ok(view([queuePr()])));
    expect((await slot.findByTestId("bb-new-thread-composer")).dataset.defaultProjectId).toBe("prj_api");

    await slot.behavior.emitRealtime(
      "review-queue.updated",
      ok(view([queuePr({ projectIds: ["prj_api_new", "prj_api"] })])),
    );

    expect(slot.getByTestId("bb-new-thread-composer").dataset.defaultProjectId).toBe("prj_api");
  });

  it("keeps the composer when an update drops the PR", async () => {
    const slot = renderPanel("review/acme/api/15", () => ok(view([queuePr()])));
    const composer = await slot.findByTestId("bb-new-thread-composer");

    await slot.behavior.emitRealtime("review-queue.updated", ok(view([])));

    expect(slot.getByTestId("bb-new-thread-composer")).toBe(composer);
    expect(slot.queryByText("This pull request is not in your review requests")).toBeNull();
  });

  it("seeds the composer from the new PR when the route changes", async () => {
    const other = queuePr({ number: 16, title: "Add caching" });
    const slot = renderPanel("review/acme/api/15", () => ok(view([queuePr(), other])));
    await slot.findByTestId("bb-new-thread-composer");

    const Panel = panel.component;
    slot.lifecycle.rerender(<Panel subPath="review/acme/api/16" />);

    const composer = slot.getByTestId("bb-new-thread-composer");
    expect(composer.dataset.draftKey).toBe("github-insight:review:acme/api#16");
    expect(
      (within(composer).getByTestId("bb-new-thread-composer-input") as HTMLTextAreaElement).value,
    ).toBe(buildReviewPrompt(other));
  });

  it("finds the PR when the subpath repo differs in case", async () => {
    const slot = renderPanel("review/Acme/API/15", () => ok(view([queuePr()])));

    expect(await slot.findByTestId("bb-new-thread-composer")).toBeTruthy();
  });

  it("says so when the PR is not in the review requests", async () => {
    const slot = renderPanel("review/acme/api/99", () => ok(view([queuePr()])));

    expect(await slot.findByText("This pull request is not in your review requests")).toBeTruthy();
    expect(slot.queryByTestId("bb-new-thread-composer")).toBeNull();
  });
});

describe("My reviews", () => {
  async function findReviewRow(slot: ReturnType<typeof renderPanel>, name: string) {
    const section = await slot.findByRole("region", { name: "My reviews" });
    return within(section).getByRole("listitem", { name });
  }

  it("shows My reviews above the review requests", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()], [myReview()])));

    await findReviewRow(slot, "acme/api#15");
    expect(slot.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual([
      "My reviews",
      "Review requests",
    ]);
  });

  it("shows the repo, number, title, status, and count of each review thread", async () => {
    const slot = renderPanel("", () =>
      ok(view([], [myReview(), myReview({ threadId: "thr_web", repo: "acme/web", number: 3, title: "Fix login" })])),
    );

    const row = await findReviewRow(slot, "acme/api#15");
    expect(within(row).getByText("acme/api")).toBeTruthy();
    expect(within(row).getByText("#15")).toBeTruthy();
    expect(within(row).getByText("Add rate limits")).toBeTruthy();
    expect(within(row).getByTestId("review-status").textContent).toBe("Running");
    const section = slot.getByRole("region", { name: "My reviews" });
    expect(within(section).getByTestId("queue-count").textContent).toBe("2");
  });

  it.each([
    ["running", "Running"],
    ["needs_you", "Needs you"],
    ["idle", "Idle"],
    ["error", "Error"],
  ] as const)("shows thread status %s", async (status, text) => {
    const slot = renderPanel("", () => ok(view([], [myReview({ status })])));

    const row = await findReviewRow(slot, "acme/api#15");
    expect(within(row).getByTestId("review-status").textContent).toBe(text);
  });

  it("opens the review thread", async () => {
    const slot = renderPanel("", () => ok(view([], [myReview()])));

    const row = await findReviewRow(slot, "acme/api#15");
    fireEvent.click(within(row).getByRole("button", { name: "Open thread" }));

    expect(slot.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "thr_review" }]);
  });

  it("archives the review thread and removes its row without a refresh", async () => {
    const slot = renderPanel("", () => ok(view([], [myReview()])));

    const row = await findReviewRow(slot, "acme/api#15");
    fireEvent.click(within(row).getByRole("button", { name: "Archive" }));

    const section = slot.getByRole("region", { name: "My reviews" });
    expect(await within(section).findByText("No review threads")).toBeTruthy();
    const archive = slot.inspection.rpcCalls.find((call) => call.method === "archiveReview");
    expect(archive?.input).toEqual({ threadId: "thr_review" });
    expect(rpcMethods(slot)).toEqual(["getReviewQueue", "archiveReview"]);
  });

  it("keeps the row and shows the reason when the archive is refused", async () => {
    const slot = renderPanel("", () => ok(view([], [myReview()])), {
      archiveReview: () => ({ kind: "error", message: "This thread is not a review thread" }),
    });

    const row = await findReviewRow(slot, "acme/api#15");
    fireEvent.click(within(row).getByRole("button", { name: "Archive" }));

    const section = slot.getByRole("region", { name: "My reviews" });
    expect(await within(section).findByText("This thread is not a review thread")).toBeTruthy();
    expect(within(section).getByRole("listitem", { name: "acme/api#15" })).toBeTruthy();
  });

  it("collapses and expands the list", async () => {
    const slot = renderPanel("", () => ok(view([], [myReview()])));

    await findReviewRow(slot, "acme/api#15");
    const section = slot.getByRole("region", { name: "My reviews" });
    const toggle = within(section).getByRole("button", { name: /My reviews/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(within(section).queryByRole("listitem")).toBeNull();
    expect(within(section).getByTestId("queue-count").textContent).toBe("1");

    fireEvent.click(toggle);
    expect(within(section).getByRole("listitem", { name: "acme/api#15" })).toBeTruthy();
  });

  it("says when there are no review threads", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])));

    const section = await slot.findByRole("region", { name: "My reviews" });
    expect(within(section).getByText("No review threads")).toBeTruthy();
    expect(within(section).getByTestId("queue-count").textContent).toBe("0");
  });
});
