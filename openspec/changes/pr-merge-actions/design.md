## Context

- `bb-plugin-github-insight` reads the PR with one GraphQL overview query (`github/overview-query.ts`). Review-state fields are read on the first page only (`@include(if: $firstPage)`). `core/overview.ts` parses the response into `PrInsight`, and `core/blockers.ts` returns `[]` when `mergeStateStatus` is `CLEAN` or `HAS_HOOKS`.
- The server caches one insight per PR (`refresh/insight-service.ts`). `getInsight` returns the cache. `refreshAfterWrite(threadId)` reloads it after a write and publishes `insight.updated`.
- GitHub writes already exist for review threads: `github/review-thread-mutations.ts` builds `gh api graphql` args with `-f` variables, `host.ts` runs them, and `review/review-writes.ts` turns a `GhFailureError` into `{ kind: "error", message }`.
- OpenForge does the same two actions (`plugins/github-sync`, `src-tauri/src/github_runtime/pr_actions`). It merges with the user's default merge method, enqueues with the PR node id and `expectedHeadOid`, and shows one button per PR.

## Goals / Non-Goals

**Goals:**
- Decide the action state in one pure function, with tests.
- The UI sends only what the user saw: the action and the head commit. The server takes the PR node id and merge method from its own cached insight.
- Reuse the existing write path (host handler, `GhResult`, `ActionResult`, `refreshAfterWrite`).

**Non-Goals:**
- A server lock against two parallel requests from two open tabs. GitHub rejects the second merge, and a second enqueue of a queued PR fails with an error.
- Support for GitHub Enterprise versions without merge queue fields (see Risks).

## Decisions

### D1: Read the action inputs in the overview query

Add to the first page of the overview query:

```
repository {
  viewerDefaultMergeMethod            # MERGE | SQUASH | REBASE
  mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed
  pullRequest {
    id headRefOid                      # node id + head commit for the guard
    isMergeQueueEnabled isInMergeQueue
  }
}
```

- Same request as today, so no extra GitHub call per poll.
- Alternative: a separate readiness query on click (as OpenForge does). Rejected: the tab must know the state before the click to show the right button.
- `isInMergeQueue` instead of `mergeQueueEntry { state }`: the spec needs only "queued or not".

### D2: Pure `buildMergeAction` in `core/merge-action.ts`

```
input: prState, blockers, isMergeQueueEnabled, isInMergeQueue,
       viewerDefaultMergeMethod, allowed methods

prState != open ------------------------> none
isInMergeQueue -------------------------> queued
blockers.length > 0 --------------------> none
isMergeQueueEnabled --------------------> enqueue
default method allowed -----------------> merge(method)
else -----------------------------------> none
```

- `PrInsight` gets `mergeAction` (`none | queued | enqueue | merge(method)`) and `pr.headOid`. The node id stays on the server cache entry, not in the UI data.
- `queued` is checked before blockers, because a queued PR can still have running checks.
- The "Merge" label comes from the method: `MERGE` "Create merge commit", `SQUASH` "Squash and merge", `REBASE` "Rebase and merge". These are the GitHub button labels.

### D3: One RPC, server checks the cache

```
pr-tab  --runMergeAction({threadId, action, expectedHeadOid})-->  server
                                                                   |
   resolvePr(threadId), read cached insight                        |
   cached mergeAction.kind == action?      no --> error "refresh"  |
   cached pr.headOid == expectedHeadOid?   no --> error "refresh"  |
                                                                   v
                             host.mergePullRequest / host.enqueuePullRequest
                                                                   |
                                  ok --> refreshAfterWrite(threadId)
```

- The server check catches a stale tab. The GitHub `expectedHeadOid` check catches a push after the last poll. Both are needed: the cache can be newer than the tab, and GitHub can be newer than the cache.
- Result type is the existing `ActionResult` (`ok | error`).
- Alternative: the UI sends node id and method. Rejected: the method must come from GitHub data, and a wider contract gives more ways to send a wrong value.

### D4: GraphQL mutations through `gh`

New `github/merge-mutations.ts`, same pattern as `review-thread-mutations.ts`:

```
mergePullRequest(input: { pullRequestId, mergeMethod, expectedHeadOid }) { pullRequest { state } }
enqueuePullRequest(input: { pullRequestId, expectedHeadOid }) { mergeQueueEntry { state } }
```

- All values go as `-f` variables, never in the query text. A GraphQL enum variable is a JSON string, so `-f mergeMethod=SQUASH` is valid.
- GraphQL instead of REST `PUT pulls/{n}/merge`: one API style in the plugin, and both mutations take the node id that D1 already reads.

### D5: UI in the "PR" tab

- A `MergeAction` row below the header, above the blockers. It renders nothing for `none`.
- `merge`: button opens an alert dialog with `#number`, title, and the method label. Confirm runs the RPC. Use `@radix-ui/react-alert-dialog` (already a dev dependency, like the other host-shimmed Radix packages).
- `enqueue`: button runs the RPC at once.
- `queued`: a "Queued" label in the existing `LABEL_CLASS` style.
- Local state per tab: `idle | running | error(message)`. The button is disabled while `running`, so a double click sends one request. The error text shows below the button until the next click or insight update.

### D6: Share the action between the tab and the composer banner

- Extract the button, dialog, and `idle | running | error` state of D5 into one `MergeActionButton` component and a `useMergeAction(threadId)` hook. The "PR" tab and `ui/composer-banner.tsx` both use them, so the two surfaces cannot drift.
- Today the whole banner is one `<button>` that opens the "PR" tab. A button inside a button is invalid HTML. So the ready and queued rows are a `<div>` with two parts: a text button that opens the "PR" tab, and the `MergeActionButton` on the right.
- The blocker row stays as it is.
- A pure `bannerState(insight)` in `core/banner.ts` returns `blockers(parts) | ready(action) | queued | hidden`, next to `bannerParts`, with tests.
- The tab and the banner each have their own running state. If the user clicks in one, the other does not show busy until `insight.updated` arrives. Accepted, see the D3 non-goal on parallel requests.

## Risks / Trade-offs

- [With a merge queue, GitHub can report `mergeStateStatus: BLOCKED` for a PR that is ready to enqueue. Then `buildBlockers` returns "Blocked by branch rules" and the tab shows no "Enqueue" button.] → Spike task 1.1 records the real values on a merge-queue repo. If `BLOCKED` is confirmed, skip the `blocked` fallback blocker when `isMergeQueueEnabled` is true, and add a test.
- [Older GitHub Enterprise Server versions do not have `isMergeQueueEnabled` or `isInMergeQueue`. The whole overview query then fails and the "PR" tab shows an error.] → Accepted for this change. The plugin targets github.com. Record it in the README.
- [Right after a merge, GitHub can still report the PR as open for a short time. The refresh then shows "Merge" again.] → A second merge fails with a GitHub error and does no harm. The next poll shows "Merged".
- [The merge runs as the `gh` user. That user may lack write access.] → GitHub rejects it, and the tab shows the error (spec: "GitHub rejects the action").
