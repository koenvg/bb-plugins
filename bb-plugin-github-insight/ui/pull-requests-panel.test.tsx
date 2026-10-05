// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { NewThreadComposerProps, PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import type {
  ActionResult,
  LinkedQueuePr,
  LoadedReviewQueue,
  QueueSection,
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
    headOid: "head-15",
    url: "https://github.com/acme/api/pull/15",
    requested: true,
    projectIds: ["prj_api", "prj_api_old"],
    review: "needs_review",
    thread: null,
    ...overrides,
  };
}

function section(prs: LinkedQueuePr[]): QueueSection {
  return [...new Set(prs.map((pr) => pr.repo))].map((repo) => ({
    repo,
    prs: prs.filter((pr) => pr.repo === repo),
  }));
}

const LOADED_AT = Date.parse("2026-10-02T09:30:00Z");

function view(prs: LinkedQueuePr[], truncated = false): ReviewQueueView {
  return {
    needsReview: section(prs.filter((pr) => pr.review !== "reviewed")),
    reviewed: section(prs.filter((pr) => pr.review === "reviewed")),
    truncated,
    loadedAt: LOADED_AT,
  };
}

const reviewThread = { id: "thr_review", status: "running", isReviewThread: true } as const;

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
  runPrAction: () => ({ kind: "error" as const, message: "unused" }),
  localCommitsAhead: () => ({ kind: "unknown" as const }),
};

type QueueHandler = () => ReviewQueueResult | Promise<ReviewQueueResult>;

interface PanelRpc {
  refreshReviewQueue: () => LoadedReviewQueue | Promise<LoadedReviewQueue>;
  startReview: () => { threadId: string } | Promise<{ threadId: string }>;
  archiveReview: () => ActionResult | Promise<ActionResult>;
  markReviewed: () => ActionResult | Promise<ActionResult>;
  markNeedsReview: () => ActionResult | Promise<ActionResult>;
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
        markReviewed: () => ({ kind: "ok" }),
        markNeedsReview: () => ({ kind: "ok" }),
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

    await findCard(slot, "Needs review", "acme/api#15");
    expect(slot.queryByRole("heading", { name: "Pull Requests" })).toBeNull();
  });

  it("renders the lists at the panel root", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])));

    expect(await slot.findByRole("region", { name: "Needs review" })).toBeTruthy();
    expect(slot.queryByTestId("bb-new-thread-composer")).toBeNull();
  });

  it("renders the composer for a review subpath", async () => {
    const slot = renderPanel("review/acme/api/15", () => ok(view([queuePr()])));

    expect(await slot.findByTestId("bb-new-thread-composer")).toBeTruthy();
    expect(slot.queryByRole("region", { name: "Needs review" })).toBeNull();
  });

  it("renders the lists for an unknown subpath", async () => {
    const slot = renderPanel("review/acme/api/not-a-number", () => ok(view([queuePr()])));

    expect(await slot.findByRole("region", { name: "Needs review" })).toBeTruthy();
  });
});

describe("Pull Requests lists", () => {
  it("shows the number of review requests in the list header", async () => {
    const slot = renderPanel("", () =>
      ok(view([queuePr(), queuePr({ number: 12 }), queuePr({ repo: "acme/web", number: 3 })])),
    );

    const reviews = await slot.findByRole("region", { name: "Needs review" });
    expect(within(reviews).getByTestId("queue-count").textContent).toBe("3");
  });

  it("shows the repo groups in server order", async () => {
    const slot = renderPanel("", () =>
      ok(view([queuePr(), queuePr({ repo: "acme/web", number: 3 })])),
    );

    const reviews = await slot.findByRole("region", { name: "Needs review" });
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

    const card = await findCard(slot, "Needs review", "acme/api#15");
    expect(within(card).getByRole("heading").textContent).toBe("#15 Add rate limits");
    expect(within(card).getByText("alice")).toBeTruthy();
    expect(within(card).getByText("2 hours ago")).toBeTruthy();
    expect(within(card).queryByText("Draft")).toBeNull();
  });

  it("shows the repository on the group header and not on each card", async () => {
    const slot = renderPanel("", () =>
      ok(view([queuePr(), queuePr({ number: 12 }), queuePr({ number: 9 })])),
    );

    const reviews = await slot.findByRole("region", { name: "Needs review" });
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

    const card = await findCard(slot, "Needs review", "acme/api#15");
    expect(within(card).getByText("2 days ago")).toBeTruthy();
  });

  it("leads each row with the CI mark and keeps author, age, review decision, and Draft in one meta row", async () => {
    const slot = renderPanel("", () => ok(view([queuePr({ draft: true })])));

    const card = await findCard(slot, "Needs review", "acme/api#15");
    expect(card.firstElementChild?.getAttribute("data-testid")).toBe("queue-ci");
    const meta = within(card).getByTestId("queue-meta");
    expect(within(meta).getByText("alice")).toBeTruthy();
    expect(within(meta).getByText("now")).toBeTruthy();
    expect(within(meta).getByTestId("queue-review-decision")).toBeTruthy();
    expect(within(meta).getByText("Draft")).toBeTruthy();
    expect(within(meta).queryByRole("button")).toBeNull();
    expect(within(card).getByRole("button", { name: "Review in thread" })).toBeTruthy();
    expect(within(card).getByRole("link", { name: "Open on GitHub" })).toBeTruthy();
  });

  it("shows Draft on a draft card", async () => {
    const slot = renderPanel("", () => ok(view([queuePr({ draft: true, ci: "failed" })])));

    const card = await findCard(slot, "Needs review", "acme/api#15");
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

    const card = await findCard(slot, "Needs review", "acme/api#15");
    expect(within(card).getByTestId("queue-ci").textContent).toBe(text);
  });

  it.each([
    ["APPROVED", "Approved"],
    ["CHANGES_REQUESTED", "Changes requested"],
    ["REVIEW_REQUIRED", "Review required"],
  ] as const)("shows review decision %s", async (reviewDecision, text) => {
    const slot = renderPanel("", () => ok(view([queuePr({ reviewDecision })])));

    const card = await findCard(slot, "Needs review", "acme/api#15");
    expect(within(card).getByTestId("queue-review-decision").textContent).toBe(text);
  });

  it("shows no review decision when GitHub has none", async () => {
    const slot = renderPanel("", () => ok(view([queuePr({ reviewDecision: null })])));

    const card = await findCard(slot, "Needs review", "acme/api#15");
    expect(within(card).queryByTestId("queue-review-decision")).toBeNull();
  });

  it("links every card to the PR on GitHub", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])));

    const review = await findCard(slot, "Needs review", "acme/api#15");
    expect(within(review).getByRole("link", { name: "Open on GitHub" }).getAttribute("href")).toBe(
      "https://github.com/acme/api/pull/15",
    );
  });

  it("says when a list holds only the first 50 PRs", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()], true)));

    const reviews = await slot.findByRole("region", { name: "Needs review" });
    expect(within(reviews).getByText("Showing first 50")).toBeTruthy();
  });

  it("says when a list is empty", async () => {
    const slot = renderPanel("", () => ok(view([])));

    const reviews = await slot.findByRole("region", { name: "Needs review" });
    expect(within(reviews).getByText("Nothing to review")).toBeTruthy();
    expect(within(reviews).getByTestId("queue-count").textContent).toBe("0");
  });

  it("keeps the old lists visible during a manual refresh", async () => {
    let finish: (result: LoadedReviewQueue) => void = () => {};
    const slot = renderPanel("", () => ok(view([queuePr()])), {
      refreshReviewQueue: () => new Promise((resolve) => (finish = resolve)),
    });

    await findCard(slot, "Needs review", "acme/api#15");
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

    const card = await findCard(slot, "Needs review", "acme/api#15");
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

  it("shows the no project hint once on the group header and no Review in thread on its cards", async () => {
    const slot = renderPanel("", () =>
      ok(view([queuePr({ projectIds: [] }), queuePr({ number: 12, projectIds: [] })])),
    );

    const reviews = await slot.findByRole("region", { name: "Needs review" });
    expect(within(reviews).getAllByText("No bb project for this repository")).toHaveLength(1);
    for (const name of ["acme/api#15", "acme/api#12"]) {
      const card = within(reviews).getByRole("listitem", { name });
      expect(within(card).queryByText("No bb project for this repository")).toBeNull();
      expect(within(card).queryByRole("button", { name: "Review in thread" })).toBeNull();
      expect(within(card).getByRole("link", { name: "Open on GitHub" })).toBeTruthy();
    }
  });

  it("shows no project hint on a group that has a project", async () => {
    const slot = renderPanel("", () =>
      ok(view([queuePr(), queuePr({ repo: "acme/web", number: 3, projectIds: [] })])),
    );

    const reviews = await slot.findByRole("region", { name: "Needs review" });
    expect(within(reviews).getAllByText("No bb project for this repository")).toHaveLength(1);
    expect(
      within(await findCard(slot, "Needs review", "acme/api#15")).getByRole("button", {
        name: "Review in thread",
      }),
    ).toBeTruthy();
  });

  it("offers Open thread on a review request with a linked thread", async () => {
    const slot = renderPanel("", () =>
      ok(view([queuePr({ thread: { id: "thr_linked", status: "idle", isReviewThread: false } })])),
    );

    const card = await findCard(slot, "Needs review", "acme/api#15");
    expect(within(card).queryByRole("button", { name: "Review in thread" })).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Open thread" }));

    expect(slot.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "thr_linked" }]);
  });
});

describe("Pull Requests updates", () => {
  it("renders the stored view on mount without a refresh", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])));

    await findCard(slot, "Needs review", "acme/api#15");
    expect(rpcMethods(slot)).toEqual(["getReviewQueue"]);
  });

  it("shows loading until the first background load is published", async () => {
    const slot = renderPanel("", () => ({ kind: "loading" }));

    expect(await slot.findByText("Loading pull requests…")).toBeTruthy();
    await slot.behavior.emitRealtime("review-queue.updated", ok(view([queuePr()])));

    expect(await findCard(slot, "Needs review", "acme/api#15")).toBeTruthy();
    expect(slot.queryByText("Loading pull requests…")).toBeNull();
  });

  it("shows a published update without a call", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])));
    await findCard(slot, "Needs review", "acme/api#15");

    await slot.behavior.emitRealtime(
      "review-queue.updated",
      ok(view([queuePr(), queuePr({ number: 16, title: "Add caching" })])),
    );

    expect(await findCard(slot, "Needs review", "acme/api#16")).toBeTruthy();
    expect(rpcMethods(slot)).toEqual(["getReviewQueue"]);
  });

  it("ignores a malformed update", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])));
    await findCard(slot, "Needs review", "acme/api#15");

    await slot.behavior.emitRealtime("review-queue.updated", { kind: "ok" });

    expect(await findCard(slot, "Needs review", "acme/api#15")).toBeTruthy();
  });

  it("asks the server to refresh on Refresh", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])));
    await findCard(slot, "Needs review", "acme/api#15");

    fireEvent.click(slot.getByRole("button", { name: "Refresh" }));

    await slot.findByRole("button", { name: "Refresh" });
    expect(rpcMethods(slot)).toEqual(["getReviewQueue", "refreshReviewQueue"]);
  });

  it("makes no calls of its own while open", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const slot = renderPanel("", () => ok(view([queuePr()])));
    await findCard(slot, "Needs review", "acme/api#15");

    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));

    expect(rpcMethods(slot)).toEqual(["getReviewQueue"]);
  });

  it("puts Refresh and the update time on the Needs review header row", async () => {
    const slot = renderPanel("", () =>
      ok({ ...view([queuePr()]), loadedAt: Date.now() - 3 * 60_000 }),
    );

    const section = await slot.findByRole("region", { name: "Needs review" });
    const headerRow = within(section).getByRole("heading", { name: /Needs review/ }).parentElement!;
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
    expect(slot.queryByRole("region", { name: "Needs review" })).toBeNull();

    result = ok(view([queuePr()]));
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));

    await findCard(slot, "Needs review", "acme/api#15");
    expect(slot.queryByRole("alert")).toBeNull();
  });

  it("keeps the last good lists with their load time", async () => {
    const slot = renderPanel("", () => ({ ...notLoggedIn, lastGood: view([queuePr()]) }));

    const alert = await slot.findByRole("alert");
    expect(within(alert).getByText("gh not logged in")).toBeTruthy();
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(
      within(alert)
        .getByText(/last updated/i)
        .querySelector("time")?.dateTime,
    ).toBe("2026-10-02T09:30:00.000Z");
    expect(await findCard(slot, "Needs review", "acme/api#15")).toBeTruthy();
  });

  it("keeps the lists of an earlier load when a refresh fails", async () => {
    let result: ReviewQueueResult = ok(view([queuePr()]));
    const slot = renderPanel("", () => result);
    await findCard(slot, "Needs review", "acme/api#15");

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
    expect((await slot.findByTestId("bb-new-thread-composer")).dataset.defaultProjectId).toBe(
      "prj_api",
    );

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

describe("Reviewed section", () => {
  it("shows Needs review above Reviewed", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])));

    await findCard(slot, "Needs review", "acme/api#15");
    expect(slot.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual([
      "Needs review",
      "Reviewed",
    ]);
  });

  it("starts collapsed with its count and expands", async () => {
    const slot = renderPanel("", () =>
      ok(view([queuePr({ review: "reviewed" }), queuePr({ number: 12, review: "reviewed" })])),
    );

    const reviewed = await slot.findByRole("region", { name: "Reviewed" });
    const toggle = within(reviewed).getByRole("button", { name: /Reviewed/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(within(reviewed).getByTestId("queue-count").textContent).toBe("2");
    expect(within(reviewed).queryByRole("listitem")).toBeNull();

    fireEvent.click(toggle);

    expect(within(reviewed).getByRole("listitem", { name: "acme/api#15" })).toBeTruthy();
  });

  it("labels a PR that got a new commit after the review", async () => {
    const slot = renderPanel("", () => ok(view([queuePr({ review: "updated_since_review" })])));

    const card = await findCard(slot, "Needs review", "acme/api#15");
    expect(within(card).getByText("Updated since review")).toBeTruthy();
  });

  it("shows no updated label on a PR that was never reviewed", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])));

    const card = await findCard(slot, "Needs review", "acme/api#15");
    expect(within(card).queryByText("Updated since review")).toBeNull();
  });
});

describe("Mark actions", () => {
  async function expandReviewed(slot: ReturnType<typeof renderPanel>) {
    const reviewed = await slot.findByRole("region", { name: "Reviewed" });
    fireEvent.click(within(reviewed).getByRole("button", { name: /Reviewed/ }));
    return reviewed;
  }

  it("sends the head shown on the card and disables the action until the server answers", async () => {
    let answer: (result: ActionResult) => void = () => {};
    const slot = renderPanel("", () => ok(view([queuePr()])), {
      markReviewed: () => new Promise((resolve) => (answer = resolve)),
    });

    const card = await findCard(slot, "Needs review", "acme/api#15");
    fireEvent.click(within(card).getByRole("button", { name: "Mark reviewed" }));

    await vi.waitFor(() =>
      expect(
        within(card).getByRole("button", { name: "Mark reviewed" }).hasAttribute("disabled"),
      ).toBe(true),
    );
    const call = slot.inspection.rpcCalls.find((candidate) => candidate.method === "markReviewed");
    expect(call?.input).toEqual({ repo: "acme/api", number: 15, headOid: "head-15" });
    await act(async () => answer({ kind: "ok" }));
    expect(
      within(card).getByRole("button", { name: "Mark reviewed" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("moves the PR to Reviewed when the server publishes the mark", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])));
    await findCard(slot, "Needs review", "acme/api#15");

    await slot.behavior.emitRealtime(
      "review-queue.updated",
      ok(view([queuePr({ review: "reviewed" })])),
    );

    const reviewed = await expandReviewed(slot);
    expect(within(reviewed).getByRole("listitem", { name: "acme/api#15" })).toBeTruthy();
    expect(
      within(slot.getByRole("region", { name: "Needs review" })).getByText("Nothing to review"),
    ).toBeTruthy();
  });

  it("keeps the PR and shows the error when the mark fails", async () => {
    const slot = renderPanel("", () => ok(view([queuePr()])), {
      markReviewed: () => ({ kind: "error", message: "disk full" }),
    });

    const card = await findCard(slot, "Needs review", "acme/api#15");
    fireEvent.click(within(card).getByRole("button", { name: "Mark reviewed" }));

    expect(within(await slot.findByRole("alert")).getByText("disk full")).toBeTruthy();
    expect(await findCard(slot, "Needs review", "acme/api#15")).toBeTruthy();
  });

  it("asks the server to mark a reviewed PR as needs review", async () => {
    const slot = renderPanel("", () => ok(view([queuePr({ review: "reviewed" })])));

    const reviewed = await expandReviewed(slot);
    const card = within(reviewed).getByRole("listitem", { name: "acme/api#15" });
    fireEvent.click(within(card).getByRole("button", { name: "Mark as needs review" }));

    await vi.waitFor(() =>
      expect(
        slot.inspection.rpcCalls.find((candidate) => candidate.method === "markNeedsReview")?.input,
      ).toEqual({
        repo: "acme/api",
        number: 15,
      }),
    );
  });
});

describe("Thread on the PR row", () => {
  it.each([
    ["running", "Running"],
    ["needs_you", "Needs you"],
    ["idle", "Idle"],
    ["error", "Error"],
  ] as const)("shows thread status %s", async (status, text) => {
    const slot = renderPanel("", () =>
      ok(view([queuePr({ thread: { ...reviewThread, status } })])),
    );

    const card = await findCard(slot, "Needs review", "acme/api#15");
    expect(within(card).getByTestId("review-status").textContent).toBe(text);
  });

  it("opens the thread from the row", async () => {
    const slot = renderPanel("", () => ok(view([queuePr({ thread: reviewThread })])));

    const card = await findCard(slot, "Needs review", "acme/api#15");
    fireEvent.click(within(card).getByRole("button", { name: "Open thread" }));

    expect(slot.inspection.navigateCalls).toEqual([{ method: "toThread", threadId: "thr_review" }]);
  });

  it("offers Archive thread only for a review thread", async () => {
    const slot = renderPanel("", () =>
      ok(
        view([
          queuePr({ thread: reviewThread }),
          queuePr({
            number: 12,
            thread: { id: "thr_branch", status: "idle", isReviewThread: false },
          }),
        ]),
      ),
    );

    expect(
      within(await findCard(slot, "Needs review", "acme/api#15")).getByRole("button", {
        name: "Archive thread",
      }),
    ).toBeTruthy();
    expect(
      within(await findCard(slot, "Needs review", "acme/api#12")).queryByRole("button", {
        name: "Archive thread",
      }),
    ).toBeNull();
  });

  it("archives the review thread and offers Review in thread again without a refresh", async () => {
    const slot = renderPanel("", () => ok(view([queuePr({ thread: reviewThread })])));

    const card = await findCard(slot, "Needs review", "acme/api#15");
    fireEvent.click(within(card).getByRole("button", { name: "Archive thread" }));

    expect(await within(card).findByRole("button", { name: "Review in thread" })).toBeTruthy();
    expect(within(card).queryByTestId("review-status")).toBeNull();
    const archive = slot.inspection.rpcCalls.find((call) => call.method === "archiveReview");
    expect(archive?.input).toEqual({ threadId: "thr_review" });
    expect(rpcMethods(slot)).toEqual(["getReviewQueue", "archiveReview"]);
  });

  it("keeps the thread and shows the reason when the archive is refused", async () => {
    const slot = renderPanel("", () => ok(view([queuePr({ thread: reviewThread })])), {
      archiveReview: () => ({ kind: "error", message: "This thread is not a review thread" }),
    });

    const card = await findCard(slot, "Needs review", "acme/api#15");
    fireEvent.click(within(card).getByRole("button", { name: "Archive thread" }));

    expect(
      within(await slot.findByRole("alert")).getByText("This thread is not a review thread"),
    ).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Open thread" })).toBeTruthy();
  });
});
