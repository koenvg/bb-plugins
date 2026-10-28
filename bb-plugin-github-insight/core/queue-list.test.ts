import { describe, expect, it } from "vitest";
import { ok, queuePr, reviewThread, view } from "../test/review-queue-fixtures";
import { formatQueueList, queueListOf, type QueueList } from "./queue-list";

function listed(result: Parameters<typeof queueListOf>[0]): QueueList {
  const load = queueListOf(result);
  if (load.kind !== "ok") throw new Error(`expected ok, got ${load.kind}`);
  return load.list;
}

describe("queueListOf", () => {
  it("lists needs-review PRs before reviewed PRs, in panel order", () => {
    const list = listed(
      ok(
        view([
          queuePr({ repo: "acme/api", number: 1, review: "reviewed" }),
          queuePr({ repo: "acme/web", number: 2 }),
          queuePr({ repo: "acme/api", number: 3 }),
        ]),
      ),
    );

    expect(list.prs.map(({ key, section }) => [key, section])).toEqual([
      ["acme/web#2", "needs_review"],
      ["acme/api#3", "needs_review"],
      ["acme/api#1", "reviewed"],
    ]);
  });

  it("maps a PR to its key, title, url, author, and no marks or thread", () => {
    const list = listed(ok(view([queuePr()])));

    expect(list).toEqual({
      loadedAt: "2026-10-02T09:30:00.000Z",
      truncated: false,
      error: null,
      prs: [
        {
          key: "acme/api#15",
          title: "Add rate limits",
          url: "https://github.com/acme/api/pull/15",
          author: "alice",
          section: "needs_review",
          marks: [],
          thread: null,
        },
      ],
    });
  });

  it("marks new commits first, then the new activity", () => {
    const list = listed(
      ok(
        view([
          queuePr({
            review: "updated_since_review",
            newActivity: ["new_comments", "requested_again"],
          }),
        ]),
      ),
    );

    expect(list.prs[0]?.marks).toEqual(["New commits", "New comments", "Review requested again"]);
  });

  it.each([
    [{ status: "running", returned: null }, "running"],
    [{ status: "needs_you", returned: null }, "needs_you"],
    [{ status: "idle", returned: null }, "idle"],
    [{ status: "error", returned: null }, "failed"],
    [{ status: "idle", returned: "finished" }, "finished"],
    [{ status: "idle", returned: "failed" }, "failed"],
    [{ status: "running", returned: "needs_you" }, "needs_you"],
  ] as const)("shows the linked thread %o as %s", (thread, status) => {
    const list = listed(ok(view([queuePr({ thread: { ...reviewThread, ...thread } })])));

    expect(list.prs[0]?.thread).toEqual({ id: "thr_review", status });
  });

  it("keeps truncated from the stored view", () => {
    expect(listed(ok(view([queuePr()], true))).truncated).toBe(true);
  });

  it("lists the last good queue with the refresh error", () => {
    const list = listed({
      kind: "error",
      message: "gh: rate limited",
      lastGood: view([queuePr()]),
    });

    expect(list.error).toBe("gh: rate limited");
    expect(list.prs.map(({ key }) => key)).toEqual(["acme/api#15"]);
  });

  it("reports the error when no queue ever loaded", () => {
    expect(queueListOf({ kind: "error", message: "gh: not logged in", lastGood: null })).toEqual({
      kind: "error",
      message: "gh: not logged in",
    });
  });

  it("reports loading when nothing is stored", () => {
    expect(queueListOf({ kind: "loading" })).toEqual({ kind: "loading" });
  });
});

describe("formatQueueList", () => {
  it("prints one line per PR under its section, with the error first", () => {
    const list = listed({
      kind: "error",
      message: "gh: rate limited",
      lastGood: view([
        queuePr({ number: 1, review: "updated_since_review", thread: reviewThread }),
        queuePr({ number: 2, title: "Fix cache", author: null, review: "reviewed" }),
      ]),
    });

    expect(formatQueueList(list)).toBe(
      [
        "Error: gh: rate limited",
        "Showing the queue loaded at 2026-10-02T09:30:00.000Z",
        "Needs review",
        "  acme/api#1  Add rate limits  by alice  [New commits]  thread thr_review running",
        "Reviewed",
        "  acme/api#2  Fix cache",
        "",
      ].join("\n"),
    );
  });

  it("says when the queue is empty", () => {
    expect(formatQueueList(listed(ok(view([]))))).toBe("No pull requests in the review queue\n");
  });
});
