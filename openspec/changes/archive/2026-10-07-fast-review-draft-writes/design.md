# Design

## Context

- The only read is `getReview`, which calls `review.load` (`review/review-service.ts`). `review.load` runs `resolvePr`, then 3 `gh` calls (PR files, paged review threads, PR head), then reads drafts from KV.
- Each draft write sends `review.updated`. The Review tab reloads with `getReview` on that event (`ui/review-tab.tsx`). The UI also calls `onWritten` -> `reload`, so each write starts 2 full loads. The client drops the first result, but the server still runs all the `gh` calls.
- `createCommentDraft` calls `loadReview` to check the anchor, the PR state, and the head commit. That is one more full load.
- Reply drafts are filtered by `drafts.liveDrafts`, which needs the review threads. It also deletes stale draft keys.
- `resolvePr` uses bb SDK calls (thread, environment, linked PR). It does not run `gh`.

## Goals / Non-Goals

**Goals:**
- No `gh` call on a draft write, except the first "+" after a restart.
- The Delete click removes the card at once.

**Non-Goals:**
- No cache for `getReview` itself. Refresh and first open still load from GitHub.
- No change to resolve, reply, or submit. They write to GitHub and still need a full load.
- No change to the KV format.

## Decisions

### Two realtime channels

- Keep `review.updated` for writes that change GitHub data (submit, resolve, reply).
- Add `review.drafts-updated` with the same `{ threadId }` payload for KV-only writes: `createCommentDraft`, `saveCommentDraft` (agent CLI), `deleteCommentDraft`, `saveDraft` (agent CLI), `discardDraft`, `saveSummaryDraft` (agent CLI).
- UI user saves (typing) send no event now, and stay that way. The UI already shows the typed text.
- Alternative: one channel with a `scope` field. Rejected, because two channels keep the type guard simple and old listeners keep their meaning.

### `getDrafts` RPC

- Input `{ threadId }`. Output `{ kind: "ok", drafts, commentDrafts, summaryDraft }` or the same `no_pr` / `error` shapes as `getReview`.
- It filters reply drafts with the review threads from the last full load (the cache below), so a draft on a resolved thread stays hidden. It does not delete stale keys: that stays in the full load. With no cache entry, it loads the PR from GitHub once, like "+".
- `useThreadResult` gets a `patch` function. The Review tab patches the drafts into the loaded review and keeps `files`, `threads`, and `head`.
- The draft fields have one zod schema (`reviewDraftsSchema`), which both results extend.
- Alternative: return drafts in the write reply. Rejected, because agent CLI writes also need to update the tab, and they come in only through realtime.

### One reload for each write

- Remove the `reload` after a draft write in `CommentDraftsProvider` and `ThreadActionsProvider`. The realtime event does the drafts reload.
- Keep `onWritten` -> full `reload` for resolve, reply, and submit. `setResolved` and `reply` do not send `review.updated`, so they need it.

### Optimistic delete

- On Delete, the Review tab patches the draft out of the loaded review, so the card, the older-commit list, and the submit panel count all update. The review state stays the only list of drafts.
- On an RPC error, the draft gets its error and the tab reloads the drafts, so the card comes back.

### PR data cache for "+"

- `review-service` keeps a `Map<prKey, { head, files, threads }>`, where `prKey` is `owner/repo#number`. Each successful `load` replaces the entry.
- Add `loadBasis(threadId)`: `resolvePr`, then the cached entry or, if none, one GitHub fetch. It reads `commentDrafts` from KV each time, because `checkOneCommit` must see the drafts as they are now.
- `createCommentDraft` uses `loadBasis` and not `loadReview`. `submitReview` keeps `loadReview`.
- The agent CLI keeps its full load before a write. The agent can push commits, so its checks need the current head. Its load also fills the cache.
- Alternative: the client sends `headOid` and the server trusts it. Rejected, because the server then cannot check the anchor against the files.

## Risks / Trade-offs

- [The cache holds an old head after a push] -> "+" saves at the head the user sees, which matches the diff on screen. Submit loads from GitHub and `draftsCommit` rejects a mismatch, as it does now.
- [`getDrafts` with no cache entry calls GitHub] -> only once after a restart with the tab open.
- [The cache grows with each PR] -> one small entry per PR that has been opened. The server restarts clear it. No limit is needed for this plugin.
- [A realtime event is lost] -> the tab shows an old draft list until the next event or Refresh. Delete still hides the card locally.
