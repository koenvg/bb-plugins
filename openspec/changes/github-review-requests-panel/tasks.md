## 1. Spike

- [x] 1.1 Start a worktree thread in a project with an open PR from another author, run `gh pr checkout <n>` in it, and check that the GitHub Insight PR tab shows that PR within one poll; record the result and the delay in design.md (Risks). If the PR tab does not show it, stop and update this change (design decision 7) before task 2.1
- [x] 1.2 Find the SDK call that returns bb's primary host ID on the server; record it in design.md (decision 2) and verify it returns a host ID in a running bb

## 2. Core

- [x] 2.1 Add `parseGithubRepo` in `core/review-queue.ts` (decision 3); verify unit tests for HTTPS, SSH, `.git`, mixed case, non-GitHub, and null remotes
- [x] 2.2 Add the zod response schema, node to `QueuePr` mapping, grouping, and sort in `core/review-queue.ts`; verify unit tests from a trimmed fixture for: CI passed, failed, running, and none; each review decision; draft; group order by repo; newest first inside a group; and `issueCount > 50` sets the "first 50" flag
- [x] 2.3 Add `core/review-prompt.ts`; verify a unit test that the prompt contains `gh pr checkout <n>`, the PR URL, the title, and the "do not post to GitHub" instruction

## 3. GitHub read (host)

- [x] 3.1 Add `github/review-queue-query.ts` with the two aliased searches (decision 1); verify a snapshot test of the args and that the query text holds no user input
- [x] 3.2 Add the `fetchReviewQueue` handler to `hostContract` and `host.ts` through `runGhJson`; verify `npm run typecheck` passes and a manual `gh api graphql` run with the same args returns both lists

## 4. Server RPC

- [x] 4.1 Add `getReviewQueue()` to `rpcContract` and `server.ts` (decision 4): call the host on the primary host, add `projectIds` and `threadId`, and keep the last good result; verify unit tests with fake SDK and host for: project match order, personal project ignored, no match, linked thread picked by newest update, archived thread ignored, gh failure returns the failure with the last good result, and no primary host
- [x] 4.2 Add `startReview(request)` that passes the composer request to `bb.sdk.threads.spawn` and returns the thread ID (decision 6); verify a unit test that the request reaches `spawn` unchanged and that a spawn error rejects

## 5. Panel UI

- [x] 5.1 Register the "Pull Requests" nav panel in `app.tsx` with a `subPath` router for `""` and `review/<owner>/<repo>/<number>`; verify a `renderSlot` test that each route renders its page
- [x] 5.2 Build the list page: two columns with counts, repo groups, cards (repo, number, title, author, age, Draft, CI, review decision), "Open on GitHub", Refresh, and "Showing first 50"; verify `renderSlot` tests against a fake RPC for each card field and the counts
- [x] 5.3 Add card actions: "Review in thread" when `projectIds` is not empty, "Open thread" when `threadId` is set, and the "No bb project for this repository" hint otherwise; verify `renderSlot` tests for all three cases, on both lists for "Open thread"
- [x] 5.4 Add loading on mount, the 5-minute interval, and cleanup on unmount (decision 5); verify a fake-timer test that the RPC is called on mount, after 5 minutes, and not after unmount
- [x] 5.5 Add error states: the reason text, a retry action, and the last good lists with their load time; verify `renderSlot` tests for "gh not logged in" with and without earlier data
- [x] 5.6 Build the composer page with `experimental_NewThreadComposer` seeded per decision 6, a Back action, and navigation to the new thread after `startReview`; verify `renderSlot` tests that the seeds reach the composer, Back starts nothing, and submit navigates to the returned thread
- [ ] 5.7 Check the panel in light and dark themes and with Liquid Glass against `DESIGN.md`; verify by screenshots in the PR

## 6. Docs

- [x] 6.1 Update `bb-plugin-github-insight/README.md`, `PLUGIN_OVERVIEW.md`, the plugin description in `package.json`, and the GitHub Insight row in `PRODUCT.md` with the Pull Requests panel; verify the README steps work on a fresh install

## 7. Integration

- [ ] 7.1 In a running bb, open the panel, start a review thread from a real review request, and check that the agent checks out the PR, the PR and Review tabs show it, and the card then shows "Open thread"
- [x] 7.2 Run `npm test` and `npm run typecheck` in `bb-plugin-github-insight` and `openspec validate github-review-requests-panel --strict`; verify all pass

## 8. Hidden review threads and card layout

- [x] 8.1 Add the versioned `review-pr` metadata schema next to `core/summary.ts` (decision 8); verify unit tests that a valid entry parses and that a missing, malformed, or wrong-version entry reads as none
- [x] 8.2 Change `startReview` to take `{ pr, request }` and spawn with `visibility: "hidden"` and the `review-pr` metadata; add `archiveReview({ threadId })` that refuses threads without `review-pr`; verify server tests for both, including a refused archive
- [x] 8.3 Pass `includeHidden: true` in the queue service and the `pr-poller` thread lists; add `myReviews` to `getReviewQueue` and link `threadId` by metadata as well as by resolved PR; verify unit tests for: hidden thread linked, metadata link before checkout, `myReviews` order, archived thread excluded, PR no longer requested still in `myReviews`
- [x] 8.4 Build the collapsible "My reviews" list (repo, number, title, status, "Open thread", "Archive", empty state) at the top of the panel; verify `renderSlot` tests for each field, both actions, collapse, and the empty state
- [x] 8.5 Apply the card layout of decision 9 (repo only on group header, group-level "No bb project" hint, `updatedAt` age, one meta row, no duplicate title, valid icon); verify `renderSlot` tests for each point and check the icon name against the SDK icon list
- [ ] 8.6 In a running bb, start a hidden review thread and let its agent stop; record in design.md (Risks) whether bb shows "Needs you" or a notice for it; verify the "My reviews" row shows its status
- [x] 8.7 Update `README.md` and `PLUGIN_OVERVIEW.md` for hidden review threads, "My reviews", and how to find a hidden thread without the plugin (`bb thread list --include-hidden`); verify `npm test`, `npm run typecheck`, and `openspec validate github-review-requests-panel --strict` pass

## 9. Remove My PRs, compact header, background cache

- [ ] 9.1 Remove the `author:@me` search, `myPrs` from the core, contract, service, and UI, and their tests; verify the query snapshot has one search and `npm test` passes
- [ ] 9.2 Add the `review-queue` background service, the versioned kv entry, the `review-queue.updated` channel, `refreshReviewQueue()`, and `getReviewQueue()` reading the stored view (decision 5); verify unit tests with fake timers, kv, and realtime for: first load, 5-minute repeat, one load at a time, Refresh during a load, stored view after a simulated restart, failure keeps the last good view, `loading` before the first load
- [ ] 9.3 Make `startReview` and `archiveReview` re-link from stored GitHub data without a `gh` call, then store and publish; verify unit tests that no host call happens and the published view has the new thread or drops the archived one
- [ ] 9.4 Make the panel read the stored view on mount, subscribe to `review-queue.updated`, call `refreshReviewQueue()` on Refresh, and drop its interval; verify `renderSlot` tests for: instant render from the stored view, update on a published event, Refresh calls the new RPC, `loading` state
- [ ] 9.5 Full-width Review requests list, and Refresh with "Updated <time> ago" on the "My reviews" header row with no row of its own; verify `renderSlot` tests and a screenshot check by the user
- [ ] 9.6 Update `README.md` and `PLUGIN_OVERVIEW.md` (no My PRs, background refresh, kept result); verify `npm test`, `npm run typecheck`, and `openspec validate github-review-requests-panel --strict` pass
