# Design

## Context

- One GraphQL call loads the queue (`github/review-queue-query.ts`). It has the `review-requested:@me` search and one alias `t<i>` per tracked PR (marked, or with a review thread).
- `queue/reviewed-marks.ts` already keeps `markedAt` (local epoch ms) next to `headOid`. Nothing reads `markedAt` yet.
- `core/review-state.ts` chooses the section only from `headOid`.
- The stored result uses `{ v: 2, result }` in kv `review-queue`. Parsing uses zod defaults for fields that were added later (`hasUnseen`, `returned`).
- A probe on `collibra/frontend#25818` showed:
  - `timelineItems` does NOT include reply reviews. The author's 08:38 reply was missing.
  - `reviews(last: N)` includes the reply as `COMMENTED`, `body=""`, `comments.totalCount=1`. Approvals with no text have `body=""` and `comments.totalCount=0`.
  - `ReviewRequestedEvent` from `timelineItems` has `requestedReviewer` as `User` (with `login`) or `Team`.

## Goals / Non-Goals

**Goals:**

- Detect replies, PR comments, reviews with text, and new review requests after `markedAt`, for marked PRs.
- Add no GitHub calls.

**Non-Goals:**

- Activity on PRs with no mark. This includes PRs that have only a review thread.
- Review requests to a team the user is in. Only a request to the user's login counts.
- Edited comments, reactions, and resolved threads.
- Telling the user which comment is new. The card links to GitHub.

## Decisions

### 1. Fetch activity in a separate fragment, on tracked aliases only

The tracked aliases use `...QueuePr ...QueueActivity`. The search keeps `...QueuePr`.

```
fragment QueueActivity on PullRequest {
  comments(last: 20) { nodes { createdAt author { __typename login } } }
  reviews(last: 20) { nodes { submittedAt body comments { totalCount } author { __typename login } } }
  timelineItems(last: 10, itemTypes: [REVIEW_REQUESTED_EVENT]) {
    nodes { ... on ReviewRequestedEvent { createdAt requestedReviewer { __typename ... on User { login } } } }
  }
}
```

The query root also gets `viewer { login }`.

- Why only tracked aliases: a requested PR without a mark is already in "Needs review". Adding the fields to the 50-PR search would multiply the cost for no gain.
- Why `last: N` and no `since`: the newest items are always in the window. If any item is after `markedAt`, the window has it. A `since` argument would need one more variable per PR.
- Alternative: GitHub notifications API. Rejected because `reason` does not change after the first notification, the unread state is shared with the GitHub inbox, and muted repos never show.
- Alternative: `reviewThreads { comments }`. Rejected because `reviews` already includes replies, at a lower cost.

### 2. Make the activity summary in core, compare it in the service

`parseReviewQueue` reduces the raw nodes to the last time of each kind of activity, with the viewer and bots removed:

```
activity: { lastCommentAt: string | null, lastRequestedAt: string | null }
```

- Comment counts when `author.__typename === "User"` and `author.login !== viewer`. A review also needs `body !== ""` or `comments.totalCount > 0`.
- A request counts when `requestedReviewer.__typename === "User"` and `login === viewer`.
- An item with a null author (a deleted user) does not count.

The service compares the summary with the mark's `markedAt` (`Date.parse(at) > markedAt`). This keeps the kv read in the service and keeps the core function pure.

`viewer` and the activity fields are required in the response. A response without them fails the load, so a broken query shows as an error and does not silently hide new activity.

The summary is on `QueuePr` only for tracked PRs. The schema field is `.nullable().default(null)`, so a v2 stored result still parses. No storage version bump.

### 3. Activity is a separate field, not a new `ReviewState`

`LinkedQueuePr` gets `newActivity: ("new_comments" | "requested_again")[]` (default `[]`). `review` keeps its 3 values. One shared `isReviewed(pr)` in `core/review-queue-view.ts` decides the section and the card's mark action.

- Why: "Updated since review" and the new labels can be on the card at the same time. A single enum cannot show that.
- Section rule: "Reviewed" when `review === "reviewed"` and `newActivity` is empty. Else "Needs review". A card in "Needs review" always offers "Mark reviewed".
- `hasUnseen` needs no change. A PR that moves to "Needs review" is not in the seen set, so the pill shows the accent.
- Sort order does not change. GitHub sets a new `updatedAt` on a comment, so the PR goes to the top of its group by itself.

### 4. "Mark reviewed" is the only clear action

"Mark reviewed" writes a new `markedAt`, so all earlier activity is old. A successful submit in the Review tab also marks, so it clears too. Opening the panel does not clear labels.

## Risks / Trade-offs

- [Local `markedAt` vs GitHub server time] A comment posted seconds before the mark can count as new if the local clock is slow. Effect: one extra return of the PR. Accept.
- [Submit in the Review tab] The user's own review is after `markedAt` only if the mark is saved first. It does not matter, because the user's own activity never counts.
- [Re-request to a team] It does not show. The re-request on #25818 was to the user login. Add team support later if needed.
- [More than 50 tracked PRs] Each tracked alias costs more GraphQL points now. With 20 + 20 + 10 nodes per alias the cost stays small for normal sizes. If GitHub reports a rate limit, the existing error path shows it.

## Migration Plan

No migration. Old stored results parse with empty activity. The first refresh after the update fills it in.
