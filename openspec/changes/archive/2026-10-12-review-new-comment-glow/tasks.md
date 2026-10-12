## 1. Spike

- [x] 1.1 In the running bb, log `document.hasFocus()` and `document.visibilityState` from the Review tab while bb has focus, while another app has focus, and while another bb tab is active. Record the result in design.md decision 5 and pick `hasFocus` or `visibilityState` only

## 2. New comment rule and seen storage

- [x] 2.1 Add `core/new-comments.ts` with the rule from design decision 2 (mark, `createdAt > markedAt`, `User` author, not the viewer, not seen) and unit tests for each `pr-review-new-comments` "New inline comments" scenario
- [x] 2.2 Add `review/seen-comments-store.ts` (key `comment-seen:v1:<owner>/<repo>#<n>`, `{ v: 1, ids }`, write in order per key, delete when empty) with tests for add, read, delete, malformed entry, and two concurrent adds

## 3. Queue activity

- [x] 3.1 Add `comments(first: 20) { nodes { id createdAt author { __typename login } } }` to the reviews in the `QueueActivity` fragment and update the snapshot in `github/__snapshots__/review-queue-query.test.ts.snap`
- [x] 3.2 Change `PrActivity` to `{ lastConversationAt, inlineComments, lastRequestedAt }` in `core/review-queue.ts` and update `core/review-queue.test.ts` so that an inline reply goes to `inlineComments` and a review body or PR comment goes to `lastConversationAt`
- [x] 3.3 Change `newActivitySince` to read the seen set, load the seen store in `linkView`, and bump the stored queue to `v: 3`. Add queue service tests for the 4 new `pr-review-requests` scenarios ("User saw all new replies", "User saw one of two replies", "Conversation comment keeps the label", "Seen reply and a new push") and check that the existing scenarios still pass
- [x] 3.4 Delete the seen key in `markReviewed` and `markNeedsReview`, and test the "Mark reviewed resets" scenario in the queue service tests

## 4. Server API

- [x] 4.1 Add `author { __typename login }` per comment and `viewer { login }` to `github/review-threads-query.ts`, keep the author type on the parsed comment in `core/review-threads.ts`, and update the query snapshot and parser tests
- [x] 4.2 Return `newCommentIds` from `getReview` (give `review-service` the reviewed marks store and the seen store) and add `server.test.ts` cases under `describe("getReview")` for a mark with a new reply, no mark, and a seen reply
- [x] 4.3 Add the `markCommentsSeen` RPC to `contract.ts` and `server.ts`, add `markCommentsSeen` to the queue service, and add `server.test.ts` cases for the kv write and the next load. The queue service test checks the publish with "New comments" gone

## 5. Glow and dwell in the Review tab

- [x] 5.1 Add `ui/use-comment-seen.ts` (design decision 5) with tests that use a manual IntersectionObserver and fake timers: seen after 1.5 s, not seen after 0.5 s and scroll out, not seen without focus, seen for a comment taller than the diff area
- [x] 5.2 Add `ui/new-comment.css` with the glow and the reduced-motion rules from design decision 6
- [x] 5.3 In `ui/review-thread.tsx`, give each comment `data-review-comment-id`, the glow class when new, and the dwell hook. Batch seen ids into one `markCommentsSeen` call after 300 ms and keep the glow while the tab is open. Add `ui/review-tab.test.tsx` cases for "One new reply in a thread", "User stops on the comment", "Glow stays after a refresh", and no glow when `newCommentIds` is empty
- [x] 5.4 Check the glow in the running bb in light and dark theme and with reduced motion on, and attach screenshots to the PR

## 6. Show hidden new comments

- [x] 6.1 Pass the new thread ids from the first load to `visibleThreads` and `commentStops`, and start `ReviewThreadCard` expanded for a resolved thread with a new comment. Add tests for "New reply on a resolved thread", "Seen, then reload", and the navigation scenario "Resolved thread with a new comment"
- [x] 6.2 Start a viewed file with a new comment expanded in `ui/use-pr-viewed.ts`, keep a user toggle stronger, and add a test for "Viewed file with a new comment"

## 7. Docs and checks

- [x] 7.1 Update the README "Reviewed state" section (new comments, seen rule, seen storage, what still needs "Mark reviewed") and `PLUGIN_OVERVIEW.md` line 25, then run the plugin test suite, lint, and typecheck with no failures
