# Design

## Context

- `ui/use-thread-result.ts` keeps the loaded result in component state. A thread switch resets it to `null`, so the PR tab shows "Loading pull request…" until the RPC returns.
- `refresh/insight-service.ts` caches readings in a memory `Map`. A restart empties it, and the first `getInsight` then waits for `gh`.
- `queue/review-queue-service.ts` already stores its last result in `bb.storage.kv` with a versioned zod schema. That is the pattern for the server snapshot.
- `ui/pr-availability.ts` already keeps a module-level `Map` per thread in the app. That is the pattern for the client snapshot.
- `github/overview-query.ts` already fetches `mergeable`, `mergeStateStatus`, `id`, and `headRefOid`. Merge writes go through `github/merge-mutations.ts`, `host.ts`, and `createMergeWrites` in `server.ts`, with shared busy state in the app.
- `bb-plugin-changes/server.ts` reads `sdk.environments.status({ environmentId, mergeBaseBranch })` and gets `workspace.mergeBase.commits`.

## Goals / Non-Goals

**Goals:**

- No loading notice on a return to a thread, and no cold start after a restart.
- One write path for all PR writes, so merge, branch update, and auto-merge cannot overlap for a thread.

**Non-Goals:**

- Make `resolvePr` faster. It runs on each `getInsight` and stays as it is.
- Branch update or auto-merge from the composer banner or the command palette.
- Prefetch of PRs for threads the user has not opened.

## Decisions

### 1. Client snapshot: module-level map, stale-while-revalidate

A module in `ui/` holds `Map<threadId, InsightResult>` of the last accepted result. `useThreadResult` seeds its state from the map on mount and on a thread switch, then runs the usual load. It exposes `revalidating` next to `refreshing`. `useInsight` writes each accepted `ok` result to the map and deletes the entry on `no_pr`.

- Why a module map: it survives the remount of the PR tab and is shared by the tab and the composer banner. `pr-availability.ts` already does this.
- Alternative: React context above the tab. Rejected, because the tab and the banner mount in different SDK slots with no shared parent.
- Alternative: a query library cache. Rejected, it adds a dependency for one map.

### 2. Server snapshot: kv per PR, read on a memory miss

The insight service writes the last good reading per PR to kv under `insight:<owner>/<repo>#<number>` as `{ v: 1, reading, refreshedAt }`. It writes only when `sameData` says the data changed. On a memory miss, `getInsight` reads kv first. With a stored reading, it returns it at once, puts it in memory, and starts a background refresh that publishes on `INSIGHT_UPDATED_CHANNEL`. A failed zod parse drops the stored value.

- Why per PR and not per thread: the memory cache is already per PR, and several threads can share a PR.
- Pruning: each poll deletes stored readings for PRs that no unarchived thread links to.
- Alternative: one kv value for all PRs. Rejected, each refresh would rewrite all of them.

### 3. Query fields

Add to the overview query:

- `headRefName`, `baseRefName`, `isCrossRepository`, `headRepositoryOwner { login }`, `author { login }`
- `additions`, `deletions`, `changedFiles`
- `autoMergeRequest { mergeMethod }`, and on the repository `autoMergeAllowed`
- `isRequired(pullRequestNumber: $number)` on `CheckRun` and on `StatusContext`

`core/overview.ts` adds these to `PrInsight`. The stored kv reading carries them too, so the kv schema version starts at 1 with these fields.

### 4. Mutations

New GraphQL mutations next to `merge-mutations.ts`, with new host handlers:

- `updatePullRequestBranch(input: { pullRequestId, expectedHeadOid, updateMethod })` with `MERGE` or `REBASE`
- `enablePullRequestAutoMerge(input: { pullRequestId, mergeMethod, expectedHeadOid })`
- `disablePullRequestAutoMerge(input: { pullRequestId })`

All use `gh api graphql`, as merge does.

### 5. One write path per thread

Generalize `createMergeWrites` and the app's shared merge operation state into PR writes with a `kind`: `merge`, `enqueue`, `update-merge`, `update-rebase`, `enable-auto-merge`, `disable-auto-merge`. One operation per thread at a time, across all kinds. Each write reads the cached PR for `pullRequestId` and `headRefOid`, then calls `refreshAfterWrite`.

- Why: separate paths would let a merge and a branch update run at the same time on one PR.
- The existing merge spec keeps its labels and behavior. Only the type of the operation grows.

### 6. Unpushed commit check through the bb SDK

A new RPC `localCommitsAhead({ threadId })` resolves the thread's environment and calls `sdk.environments.status({ environmentId, mergeBaseBranch: "origin/<headRefName>" })`. The count of `workspace.mergeBase.commits` is the number of local commits that are not on the remote PR branch. The result is `{ kind: "count", count }` or `{ kind: "unknown" }`.

`unknown` covers: no environment, status `not_applicable` or `unavailable`, a workspace branch other than `headRefName`, a fork PR, or a thrown error (bb 0.44 can reject merge-base status, see `bb-plugin-changes/server.ts`).

- Why the SDK and not a host `git` call: bb already knows the worktree path and runs git there. The plugin needs no path.
- The app calls it when the "Update branch" menu opens, not on each render.

### 7. Layout

`ui/pr-tab.tsx` gets a header row, a summary line, and the action row. The summary line uses `prStatusView` and the first blocker. `core/merge-action.ts` stays for merge and enqueue. New pure functions in `core/` decide the branch update and auto-merge actions from `PrInsight`, so they are testable without React.

## Risks / Trade-offs

- [A snapshot shows old blockers for a moment] → The data age is always visible, and the head guard rejects writes on an old head.
- [`origin/<headRefName>` is stale when someone else pushed] → The count is then too low only for commits that someone else pushed. Local-only commits still count. The confirm dialog still warns.
- [`isRequired` adds GraphQL cost per check] → It runs only on the paged contexts the query already reads. Watch rate limits during testing.
- [kv grows with old PRs] → Pruning on each poll.
- [Auto-merge rules on GitHub differ from our blocker list] → GitHub decides. A rejected enable shows the GitHub error.

## Migration Plan

- No data migration. The kv snapshot starts empty and fills on the first reads.
- Rollback: an older plugin version ignores the `insight:` kv keys.
