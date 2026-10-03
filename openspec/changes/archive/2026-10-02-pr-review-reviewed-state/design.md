## Context

See proposal.md for the motivation. Current state in `bb-plugin-github-insight`:

- `queue/review-queue-service.ts` builds a `ReviewQueueView` with `myReviews` (plugin review threads) and `reviewRequests` (one `gh api graphql` search). It keeps the view in plugin KV under `review-queue` and publishes it on `REVIEW_QUEUE_UPDATED_CHANNEL`.
- `relink()` rebuilds project and thread links on the stored GitHub data with no GitHub call. It runs after a review thread is started or archived.
- `github/review-queue-query.ts` does not fetch `headRefOid` or `state`.
- `review/review-writes.ts` `submitReview` knows the submitted `commitOid` and `head.viewerIsAuthor`.
- Plugin KV supports `get`, `set`, `delete`, and `list(prefix)`. Drafts already use per-PR keys (`draft:`, `comment:`, `summary:`).

## Goals / Non-Goals

**Goals:**
- One GitHub request per refresh, as today.
- A mark or unmark updates the panel at once, with no GitHub call.
- Reviewed state is independent of threads. It works for PRs that have no thread.

**Non-Goals:**
- Import reviews that the user submitted on github.com as marks.
- Show the sidebar thread list (`bb-plugin-pr-thread-list`) state for hidden review threads.
- Keyboard navigation in the list.
- A "Finished" section for merged or closed PRs (OpenForge has one).

## Decisions

### 1. Keep the mark in plugin KV, keyed per PR

Key `reviewed:<owner/repo#number>` (lowercase), value `{ v: 1, owner, repo, number, headOid, markedAt }`. Read all marks with `kv.list("reviewed:")`.

- Alternative: thread plugin metadata. Rejected, because a PR can be marked with no thread, and a PR can have more than one thread.
- Alternative: put marks inside the `review-queue` value. Rejected, because a refresh overwrites that value, and a mark that is saved during a refresh can then get lost.

### 2. Compute the review state when the view is linked, not at fetch time

The stored view keeps the GitHub rows with `headOid`. `linkView` reads the marks and sets on each row `review: "needs_review" | "updated_since_review" | "reviewed"`. Then it splits the rows into the two sections and sorts them: rows whose thread status is `needs_you` first, then by last update. Repo groups that hold a `needs_you` row come first, the others follow in name order.

```
GitHub rows (stored) --+
marks (KV)  -----------+--> linkView --> { needsReview, reviewed, loadedAt }
threads + projects ----+
```

- So a mark or unmark is only a KV write plus `relink()`. This is the same path as start or archive thread today.
- The status rule is the same as OpenForge `getReviewRequestProgress`: no mark, mark equal to head, mark different from head.

### 3. One GraphQL request with the search and the tracked PRs

`fetchReviewQueue` takes `{ tracked: { owner, repo, number }[] }`. The query has the existing `search` plus one alias per tracked PR: `t0: repository(owner:, name:) { pullRequest(number:) { ...PrFields } }`. `PrFields` adds `headRefOid` and `state` to the existing fields.

- Tracked PRs are the marked PRs plus the PRs of unarchived plugin review threads. Every tracked PR is fetched, also when the search returns it. Leaving out the PRs of the last search would hide a marked PR for one refresh when its request goes away. The merge step removes duplicates.
- Alternative: a second `gh` call. Rejected, because it costs one more process and one more rate-limit hit per refresh.
- Alternative: a `reviewed-by:@me` search. Rejected in exploration (option B), because it adds noise.

### 4. Partial GraphQL errors for missing PRs

When a tracked repository or PR does not exist, or the user has no access, GitHub returns `data` with `null` for that alias and an `errors` entry of type `NOT_FOUND`. `gh api graphql` then exits non-zero. The host handler for this query parses stdout when it contains `data` and every error is `NOT_FOUND`. The parser reads a `null` alias as gone. Every other error fails as today.

- A `null` alias, `state` `MERGED`, or `state` `CLOSED` removes the row. If the PR has a mark, the service deletes the mark in the same refresh.
- A PR with a review thread and no mark only drops out of the view. The thread is not changed.

### 5. Row model

`LinkedQueuePr` gets these fields:

- `headOid`
- `review` (the state from decision 2)
- `thread: { id, status, isReviewThread } | null` in place of `threadId`

Thread status uses the existing `reviewThreadStatus` mapping for every linked thread, so the thread list must give status and `hasPendingInteraction` for all threads. `myReviews` and `MyReview` are removed.

- The stored-value schema version goes to `v: 2`. A `v: 1` value fails to parse, `getReviewQueue` returns `loading`, and the next refresh fills it.

### 6. RPC actions

- `markReviewed({ repo, number, headOid })` saves the mark, runs `relink()`, and returns an `ActionResult`. A `repo` that is not `owner/name` is refused.
- `markNeedsReview({ repo, number })` deletes the mark and runs `relink()`.
- `archiveReview` stays, and the row calls it as "Archive thread".
- `markReviewed` and `markNeedsReview` wait for the re-link (no GitHub call) before they answer, and re-links run one at a time, so a slow re-link cannot overwrite a newer mark. The UI shows the published view and keeps no copy of the section rules. The card action is disabled while the call runs. A failed call shows the error. A mark on a PR that is not in the stored rows (for example from a submit on a branch thread) starts a load and does not wait for it.

### 7. Mark on submit

`createReviewWrites` gets a `markReviewed(ref, commitOid)` dependency, wired to the queue service. After a successful submit, and only when `head.viewerIsAuthor` is false, it marks at `input.value.commitOid`. If the mark fails (the dependency returns an error `ActionResult`), the result is `{ kind: "submitted", markError: string }` and the submit panel shows the hint. The submit is not reported as failed.

### 8. UI

- `ui/review-queue-list.tsx` renders two sections with the same repo groups and cards. "Reviewed" uses the collapse pattern of `my-reviews.tsx`, collapsed on mount.
- The card gets these items:
  - the thread status dot (moved from `my-reviews.tsx`),
  - an "Updated since review" label,
  - "Mark reviewed" or "Mark as needs review",
  - "Archive thread" when `thread.isReviewThread`.
- `ui/my-reviews.tsx` is deleted.

## Risks / Trade-offs

- [Many marks make the query large] → Marks are deleted when a PR is merged or closed, so the tracked set stays small. If needed later, cap the aliases at 50.
- [gh exit code with partial data] → Cover with unit tests on `readNotFoundPartial` (`github/not-found-partial.ts`). Fail closed on any other error type.
- [A mark saved during a refresh] → The marks are in their own keys, and `linkView` reads them after the fetch. A refresh does not overwrite a mark.
- [A requested PR past the first 50 search results] → It comes in through the tracked fetch with `requested: false`. After "Mark as needs review" it leaves the list until it is in the first 50 again.
- [A PR marked at a stale head shows "Updated since review" after the next refresh] → This is what the spec wants ("Head changed before the refresh"). It matches OpenForge.
- [Old `v: 1` stored value] → The panel shows "Loading" for one refresh after the update.

## Migration Plan

- No data migration. Old stored queue values are ignored (decision 5).
- Rollback: an older plugin build fails to parse the `v: 2` value and loads again. It ignores the `reviewed:` keys.
