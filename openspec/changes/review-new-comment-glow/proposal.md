## Why

After a PR comes back to "Needs review" with "New comments", the label stays when the user reads the comments. Only "Mark reviewed" clears it. Also, the Review tab does not show which comments are new, so the user must find them.

## What Changes

- The Review tab shows a glowing border on each inline review comment that is new since the reviewed mark.
- A new comment becomes seen when at least 60% of it is visible for 1.5 s in a focused window. A fast scroll past the comment does not make it seen. The glow stays until the user leaves the Review tab, so the user can find the comment again.
- The plugin stores the seen comment ids per PR.
- A resolved thread with a new comment shows and is expanded, also when "Show resolved" is off.
- A viewed file with a new comment starts expanded.
- The "New comments" label on the queue card clears when the user saw all new inline comments and there is no new conversation activity (PR comment or review text) after the mark. "Mark reviewed" still clears the label.
- Out of scope: PR conversation comments and review text do not show in the Review tab. They keep the label until "Mark reviewed". The merged PR tab work (thread `thr_7cz2hei9pj`) gives them a place later.

## Capabilities

### New Capabilities

- `pr-review-new-comments`: which inline comments are new in the Review tab, the glow, the seen rule, and the seen storage.

### Modified Capabilities

- `pr-review-requests`: "New activity after the mark" changes. Seen inline comments do not count for "New comments".
- `pr-review-comment-navigation`: "Comments are in page order" includes a resolved thread with a new comment when "Show resolved" is off.
- `pr-review-viewed-files`: "Expand and collapse a PR file" starts a viewed file with a new comment expanded.

## Impact

- `bb-plugin-github-insight`:
  - GraphQL: review threads query gets `author { __typename }` and `viewer { login }`. Queue activity fragment gets inline comment ids per review.
  - `core/review-queue.ts`: `PrActivity` splits conversation activity from inline comments. Stored queue version goes up.
  - `queue/review-queue-service.ts`: `new_comments` reads the seen set. Mark reviewed and Mark as needs review delete it.
  - New kv store for seen comment ids. New RPC `markCommentsSeen`. `getReview` returns the new comment ids.
  - UI: `ui/review-thread.tsx`, `ui/review-tab.tsx`, `ui/use-pr-viewed.ts`, `core/thread-placement.ts`, new CSS for the glow.
- README "Reviewed state" section.
