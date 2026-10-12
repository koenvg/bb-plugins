## Context

See proposal.md for the problem. Current state in `bb-plugin-github-insight`:

- `getReview` (`review/review-service.ts`) loads threads from `github/review-threads-query.ts`. Comment ids are GraphQL node ids (`PRRC_...`). The author is flattened to a login, with no `__typename`. The Review tab does not know the viewer login or the reviewed mark.
- The queue (`core/review-queue.ts`, `activityOf`) keeps one `lastCommentAt` for issue comments and reviews. It has no inline comment ids. An inline reply shows only as a review with an empty body and `comments.totalCount >= 1`.
- `queue/review-queue-service.ts` `newActivitySince` compares `lastCommentAt` with `markedAt`. `relink` rebuilds the lists from the stored rows and publishes `review-queue.updated`, with no GitHub call.
- `ReviewThreadCard` (`ui/review-thread.tsx`) renders each comment as a plain `div` with no id. Resolved threads are filtered out by `visibleThreads` when "Show resolved" is off. A viewed file starts collapsed (`ui/use-pr-viewed.ts`). Files mount lazily (`ui/file-diff.tsx` `useVisibleOnce`).

## Goals / Non-Goals

**Goals:**

- The server decides which comments are new. The UI and the queue use the same rule and the same seen set.
- Seeing a comment updates the queue card without a GitHub refresh.

**Non-Goals:**

- A "next new comment" step in the comment stepper.
- New comments in PR conversation and review text (merged PR tab work).
- Seen state for comments on GitHub.com.

## Decisions

### 1. Seen ids per PR in kv

- Key `comment-seen:v1:<owner>/<repo>#<n>` (lowercase, like `reviewed:`). Value `{ v: 1, ids: string[] }`.
- Store `queue/seen-comments.ts`, owned by the queue service like `reviewed-marks.ts`: zod parse, writes in order per key (`core/keyed-queue.ts`, shared with `review/viewed-marks-store.ts`).
- Ids, not a "seen until" time: the user can see a newer comment before an older one. A time would mark the older one seen too.
- Prune: `markReviewed` and `markNeedsReview` delete the key. Comments before the new mark are not new, so their ids have no use.

### 2. The server computes new comment ids for the Review tab

- `getReview` returns `newCommentIds: string[]`.
- Rule (shared function in `core/new-comments.ts`): mark exists, `publishedAt ?? createdAt` after `markedAt`, author `__typename === "User"`, author login is not the viewer, id is not in the seen set. `publishedAt` matters for a comment in a pending review: `createdAt` is when the reviewer wrote it, which can be before the mark.
- The review threads query adds `author { __typename login }` and `publishedAt` per comment and `viewer { login }` at the top. `collectReviewThreads` returns `othersComments`. The new fields are optional in the parser, so a response without them gives no new comments.
- `review-service` gets `newCommentBasis(ref)` (mark time and seen set) from the queue service.
- Alternative: send `markedAt`, viewer and the seen set to the UI and compute there. Rejected: the rule would live in two places, and the queue needs it on the server.

### 3. Queue activity gets inline comment ids

- The `QueueActivity` fragment adds `comments(first: 20) { nodes { id createdAt publishedAt } }` to each of the `reviews(last: 20)` nodes. The comment author is the review author. A reply on GitHub is its own review, so recent replies are in recent reviews. No extra `reviewThreads` query.
- `PrActivity` changes from `{ lastCommentAt, lastRequestedAt }` to `{ lastConversationAt, inlineComments: { id, createdAt }[], lastRequestedAt }`.
  - `lastConversationAt`: issue comments and reviews with a non-empty body, from other people.
  - `inlineComments`: review comments from other people.
- `newActivitySince(activity, mark, seenIds)`: `new_comments` when `lastConversationAt > markedAt`, or when some inline comment has `createdAt > markedAt` and its id is not in `seenIds`.
- The stored queue goes from `v: 2` to `v: 3`. An old stored queue reads as empty and the next refresh fills it. This is the current behavior for a version mismatch.

### 4. RPC `markCommentsSeen`

- Input `{ threadId, commentIds }`. `review-service` resolves the PR with `resolvePr` and calls `reviewQueue.markCommentsSeen(ref, ids)`, which adds the ids and re-links. `relink` stays private.
- The UI collects ids that became seen and sends them in one call after 300 ms, or at once when the tab closes. The glow does not change. A failed call is ignored: the comment is not watched again, and the next time the tab opens, it is new again.

### 5. Dwell detection in the UI

- Hook `useCommentSeen(element, root, active, onSeen)` in `ui/use-comment-seen.ts`.
- One `IntersectionObserver` per new comment, root `[data-diff-scroll-area]`, thresholds in steps of 0.1, so a tall comment reports while it scrolls.
- Visible: `intersectionRatio >= 0.6`, or `intersectionRect.height >= 0.6 * rootBounds.height` (tall comments).
- A 1500 ms timer starts when the comment is visible and `document.visibilityState === "visible"` and `document.hasFocus()`. It stops on scroll out, `visibilitychange`, or window `blur`. A `focus` event re-checks.
- Only new comments mount the observer. Comments that are not new have no cost.
- Lazy file mounting stays. A comment in a file that has not mounted is not visible, which is correct.

### 6. Glow style

- New `ui/new-comment.css`. Class `review-comment-new` on the comment `div`: a 1px ring and a soft outer shadow in `--timeline-accent`, the same tone as the "Ready" pill. A slow pulse of the shadow (2.4 s).
- A 2px ring. The glow stays while the tab is open: a fade on seen was too subtle in use, so the user could not find the comment again. The tab keeps every id that was new since it opened, so a refresh that drops seen ids does not remove the glow.
- `prefers-reduced-motion: reduce`: no pulse. The ring is static.
- Not the orbit border from `ui/thread-status.css`: many orbiting rings on one page are noisy.

### 7. Show hidden new comments

- `visibleThreads(threads, showResolved, newThreadIds)` keeps a resolved thread when it has a new comment. `commentStops` uses the same set, so the stepper agrees with the page.
- `ReviewThreadCard` starts expanded when the thread has a new comment.
- `usePrViewed.of(file)` starts a viewed file expanded when the file has a new comment. A user toggle still wins.
- The set of threads and files to show comes from the glowing ids (`commentHolders` in `core/thread-placement.ts`). The set does not shrink while the tab is open, so nothing jumps away while the user reads.

## Risks / Trade-offs

- [A reply in a review older than the last 20 reviews is not in queue activity] → The same limit exists for `lastCommentAt` today. The Review tab still glows the comment, because it reads all threads.
- [More than 20 comments in one review (a large first review after the mark)] → The queue misses the extra ids and can clear the label early. Accept: the Review tab still glows them. Raise `first` if this shows in use.
- [A thread with more than 100 comments: the Review tab reads the first 100, but the queue can count a later reply] → The label stays until "Mark reviewed". The thread shows "More comments on GitHub". Accept: rare.
- [`document.hasFocus()` can be false while bb has focus, if the plugin UI is in an iframe] → The plugin content script writes to the host `document`, so the plugin UI runs in the bb document. Use `hasFocus()` and `visibilityState`. Check focus in the running bb in task 5.4.
- [Mark reviewed on a submit from the Review tab deletes the seen set at the same time the tab sends seen ids] → The seen write after the delete adds old ids, which are before the new mark and have no effect.
