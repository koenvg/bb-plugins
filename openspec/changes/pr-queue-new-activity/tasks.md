# Tasks

## 1. Query

- [x] 1.1 In `github/review-queue-query.ts`, add `viewer { login }` to the query root and a `QueueActivity` fragment (`comments(last: 20)`, `reviews(last: 20)`, `timelineItems(last: 10, itemTypes: [REVIEW_REQUESTED_EVENT])`) on the tracked aliases only. Verify: update the snapshots in `github/review-queue-query.test.ts` and check that the search still uses only `...QueuePr`.

## 2. Activity summary in core

- [x] 2.1 In `core/review-queue.ts`, parse `viewer.login` and the activity nodes on tracked PRs. Add `activity: { lastCommentAt, lastRequestedAt }` to `queuePrSchema` as `.nullable().default(null)`. The search rows get `null`. Verify: `core/review-queue.test.ts` tests that a response without `viewer` fails, and that a search row has `activity === null`.
- [x] 2.2 Count comments only from `User` authors that are not the viewer. Count a review only when `body !== ""` or `comments.totalCount > 0`. Count a request only when the reviewer is a `User` with the viewer login. Verify with tests in `core/review-queue.test.ts`: reply review (empty body, 1 comment) counts, empty approval does not count, bot comment does not count, viewer comment does not count, null author does not count, team request does not count, user request counts.

## 3. Section and labels in the service

- [x] 3.1 In `core/review-queue-view.ts`, add `activity: z.array(z.enum(["new_comments", "requested_again"])).default([])` to `linkedQueuePrSchema`. Verify: a test that a stored v2 result without `activity` parses with `[]`.
- [x] 3.2 In `queue/review-queue-service.ts` `linkView`, keep `markedAt` per mark, compute `activity` from `Date.parse(at) > markedAt`, and put a PR in "Reviewed" only when `review === "reviewed"` and `activity` is empty. Unmarked PRs get `[]`. Verify with tests in `queue/review-queue-service.test.ts` for each spec scenario: reply after the mark, comment before the mark, re-request with no push, push and reply, unmarked PR with a review thread, and `hasUnseen` true when a marked PR comes back.
- [x] 3.3 Verify in `queue/review-queue-service.test.ts` that "Mark reviewed" on a PR with `new_comments` moves it to "Reviewed" after the new mark (new `markedAt` from `deps.now`).

## 4. Card labels

- [x] 4.1 In `ui/review-queue-list.tsx`, show "New comments" and "Review requested again" labels next to "Updated since review", in the same attention style. Verify: tests in `ui/pull-requests-panel.test.tsx` that a card shows each label, both labels together, and no label when `activity` is empty.

## 5. Docs

- [x] 5.1 Update "Reviewed state" in `bb-plugin-github-insight/README.md` and the "Mark reviewed" line in `PLUGIN_OVERVIEW.md` with the new return rules and labels. Verify: the docs name the counted activity, the non-counted activity, and that "Mark reviewed" clears the labels.

## 6. Integration

- [x] 6.1 Run the plugin test suite, typecheck, and lint. Verify: all pass.
- [x] 6.2 In bb, mark a real PR reviewed, post a reply from another account (or wait for one), and refresh. Verify: the PR moves to "Needs review" with "New comments" and the sidebar pill shows the accent.
