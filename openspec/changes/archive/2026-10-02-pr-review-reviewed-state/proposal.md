## Why

The Pull Requests panel shows every review request until GitHub removes the request. When you review a PR and the author has not pushed yet, the PR stays in your list, and you cannot hide it. When you submit a review, GitHub removes the request, and the PR leaves the list. Then a new push from the author never brings it back. The panel also shows the same PR two times: one time in "My reviews" (the thread) and one time in "Review requests" (the PR).

OpenForge solves this with a "reviewed" state that stays until the author pushes. This change brings that state to bb and merges the two lists into one.

## What Changes

- **BREAKING (UI)**: The panel shows one PR list in place of "My reviews" and "Review requests". A review thread shows on the row of its PR (status and "Open thread"). It is not a separate row.
- The list has two sections:
  - "Needs review": PRs that are not reviewed, or that got a new head commit after the review ("Updated since review").
  - "Reviewed": PRs reviewed at their current head commit. This section is collapsed by default.
- The list contains these PRs:
  - open PRs where GitHub requests your review,
  - open PRs that you marked reviewed,
  - open PRs with an unarchived review thread.
- New row actions: "Mark reviewed" and "Mark as needs review".
- The plugin keeps the reviewed head commit per PR in plugin storage. A push or force push changes the head commit, so the PR goes back to "Needs review".
- A successful "Submit review" in the Review tab marks the PR reviewed at the submitted commit. This does not apply on your own PR.
- When a tracked PR is merged or closed, it leaves the list, and the plugin deletes its reviewed state.
- The queue query also fetches the head commit of each PR. A second query fetches the tracked PRs that the review request search does not return.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-requests`: One merged PR list replaces "My reviews" and "Review requests". New reviewed state that stays until a new head commit, new mark actions, wider list content (marked PRs and PRs with a review thread), and removal of merged or closed PRs.
- `pr-review-submit`: A successful submit marks the PR reviewed at the submitted commit.

## Impact

- `bb-plugin-github-insight`:
  - `github/review-queue-query.ts`: add `headRefOid` and `state`, and add a query for tracked PRs by repository and number.
  - `core/review-queue.ts`, `core/review-queue-view.ts`: new row model with head commit, review state, and the linked thread with its status. Remove `myReviews`.
  - `queue/review-queue-service.ts`: build the merged list, read and write reviewed state in plugin KV, delete state for merged or closed PRs.
  - `review/review-writes.ts`: mark reviewed after a successful submit.
  - `contract.ts`, `server.ts`: new mark and unmark actions.
  - `ui/review-queue-list.tsx`, `ui/my-reviews.tsx`: one list with two sections. Remove the "My reviews" list.
- The stored queue in KV (`review-queue`) gets a new shape. The plugin ignores the old stored value and loads again.
- No change to the bb host or SDK.
