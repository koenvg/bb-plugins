## 1. Reviewed state core

- [x] 1.1 Add a `reviewed:` mark store over plugin KV (`get`, `list`, `save`, `delete`, key `reviewed:<owner/repo#n>` lowercase, value `{ v: 1, repo, number, headOid, markedAt }`). Verify with unit tests: save then list, case-insensitive key, delete, and an invalid stored value is ignored.
- [x] 1.2 Add a pure `reviewState(mark, headOid)` that returns `needs_review`, `updated_since_review`, or `reviewed`. Verify with unit tests: no mark, same commit, different commit (push and force push).

## 2. GitHub query (host)

- [x] 2.1 Add `headRefOid` and `state` to the PR fields in `github/review-queue-query.ts`. Extend `fetchReviewQueue` to take `tracked: { owner, repo, number }[]` and add one `repository { pullRequest }` alias per tracked PR. Verify with a snapshot test of the query for 0 and 2 tracked PRs.
- [x] 2.2 In `host.ts`, make the `fetchReviewQueue` handler accept a non-zero `gh` exit when stdout holds `data` and every error is `NOT_FOUND`, and return the not-found aliases. Verify with host tests: partial data with `NOT_FOUND`, a different error type still fails, and a normal success.
- [x] 2.3 Update `parseReviewQueue` to read the search rows and the tracked aliases into one row set with `headOid` and `state`. A `null` alias becomes "gone". Verify with parser tests that use a recorded fixture with one open, one merged, and one missing tracked PR.

## 3. Queue service

- [x] 3.1 Change `core/review-queue-view.ts`: rows get `headOid`, `review`, and `thread: { id, status, isReviewThread } | null`. The view becomes `{ needsReview, reviewed, truncated, loadedAt }`. Remove `myReviews`. Bump the stored value to `v: 2`. Verify with `npm run typecheck`, and verify with a test that a `v: 1` stored value gives `loading`.
- [x] 3.2 In `review-queue-service.ts`, build the tracked set (marks plus PRs of unarchived plugin review threads) and pass it to the fetch. Merge the rows without duplicates. Drop merged, closed, and gone rows, and delete their marks. Verify with service tests for each "Review requests list content" and "Merged and closed PRs leave the list" scenario in the delta spec.
- [x] 3.3 In `linkView`, read the marks, set `review`, set `thread` with status for every linked thread (from `threads.list` status and `hasPendingInteraction`), and split the rows into sections grouped by repo, with `needs_you` rows and their groups first, then by last update. Verify with service tests for the "Reviewed state" scenarios, the "Thread needs the user" scenario, and for a branch-linked thread versus a plugin review thread.
- [x] 3.4 Add `markReviewed({ repo, number, headOid })` and `markNeedsReview({ repo, number })` to the service, `contract.ts`, and `server.ts`. Each one writes KV, then runs `relink()`. Verify with service tests: mark moves the row with no GitHub call, unmarking a PR that is not requested and has no thread removes it, and a KV failure returns an error result.

## 4. Mark on submit

- [x] 4.1 Give `createReviewWrites` a `markReviewed(ref, commitOid)` dependency wired to the queue service. Call it after a successful submit when `viewerIsAuthor` is false. Return `{ kind: "submitted", markError }` when it fails. Verify with `review-writes` tests: approve marks at the submitted commit, submit on older drafts marks at the draft commit, own PR does not mark, and a mark failure still gives `submitted`.
- [x] 4.2 Show the "use Mark reviewed" hint in `ui/submit-panel.tsx` when `markError` is set. Verify with a `review-tab` test.

## 5. Panel UI

- [x] 5.1 Rewrite `ui/review-queue-list.tsx` into "Needs review" and "Reviewed" sections. "Reviewed" is collapsed on mount. Each header shows its count, Refresh and "Updated" sit on the "Needs review" header, and "Nothing to review" shows when the section is empty. Verify with `pull-requests-panel` tests for the "Pull Requests panel" scenarios.
- [x] 5.2 On the card, add the thread status dot, "Open thread", "Archive thread" (review threads only), the "Updated since review" label, and "Mark reviewed" or "Mark as needs review", with the action disabled while the call runs and an error on failure (the move comes from the published view). Show "Review in thread" only when there is no thread. Verify with panel tests for the "Mark reviewed", "Mark as needs review", and "Thread on the PR row" scenarios.
- [x] 5.3 Delete `ui/my-reviews.tsx` and its tests. Verify that `npm test` and `npm run typecheck` pass in `bb-plugin-github-insight`.
- [x] 5.4 Update `README.md` (panel description, the RPC notes, and the manual test steps) and `PLUGIN_OVERVIEW.md` to describe the merged list, the mark actions, and mark on submit. Verify that "My reviews" no longer appears with `grep -n "My reviews" bb-plugin-github-insight/*.md`.

## 6. Integration check

- [ ] 6.1 Build with `npm run build` and run the plugin in bb. Mark a requested PR reviewed, push a commit to it, refresh, and see it return with "Updated since review". Submit a review from a review thread and see the PR move to "Reviewed". Archive the thread and see it leave when the PR is no longer requested or marked.
