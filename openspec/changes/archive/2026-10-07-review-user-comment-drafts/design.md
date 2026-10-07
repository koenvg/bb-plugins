# Design

## Context

- The shared `review-ui/review-file-diff.tsx` already has `onAddComment(side, line)`. It turns on the `@pierre/diffs` gutter "+" only when a handler is given. The Changes tab uses it. `github-insight/ui/file-diff.tsx` does not pass it.
- The agent creates comment drafts through `review comment` in `review/review-cli.ts`. That command loads the review, runs `checkAnchor` (`core/diff-lines.ts`), runs `assertOneCommit`, and saves through `review.saveCommentDraft`, which publishes `review.updated`.
- The storage schema (`core/review-drafts.ts`) already allows an empty body. Only the CLI rejects empty text.
- `reviewInput` in `review/review-writes.ts` fails Submit when a draft is empty. `submitRules` gets `commentCount` from `commentDrafts.length` in `ui/review-tab.tsx`.
- `CommentDraftsProvider` (`ui/comment-drafts.tsx`) keeps typed text per draft in local state and saves it 500 ms after the last key press.

## Goals / Non-Goals

**Goals:**
- One create path on the server that uses the same checks as the CLI.
- No change to the storage format and no data migration.

**Non-Goals:**
- Range comments, drag selection, shift-click.
- Changes to `review-ui/review-file-diff.tsx` or to the Changes tab.
- Changes to reply drafts in review threads. They keep "Draft from agent".

## Decisions

### 1. New RPC `createCommentDraft`, validated on the server

Input: `{ threadId, path, side: "LEFT" | "RIGHT", line }`. Output: `{ kind: "created", draftId } | { kind: "error", message }`.

`review-writes.ts` loads the review (`deps.loadReview`), refuses a merged or closed PR (`closedReason` in `core/review-submit.ts`), runs `checkAnchor` and the one-commit check, then saves `{ body: "", startLine: null, commitOid: head.oid, source: "user" }` through the draft store and publishes `review.updated`.

- Why the server, not the UI only: the head can move after the tab loaded. The server sees the current head and the current drafts, the same as the CLI.
- Alternative: trust the UI and skip the load. Rejected. A draft at a stale commit breaks the one-commit rule and Submit.
- Move the logic of `assertOneCommit` from `review-cli.ts` to `checkOneCommit` in `core/draft-commits.ts`, next to `splitByCommit` and `draftsCommit`, so all commit rules for drafts are in one module. The CLI keeps its error text and hint.
- `newCommentDraftId` goes into `ReviewWritesDeps` (as `newDraftId`), as the CLI does now, so tests can fix the id.

### 2. When the "+" shows

`ReviewContent` computes `canAddComment = head.state === "OPEN" && draftsByCommit.older.length === 0` and passes `onAddComment` to `PrFileDiff` only when it is true. `PrFileDiff` maps `"additions"` to `RIGHT` and `"deletions"` to `LEFT`.

- Files without a patch show no diff, so they get no "+".
- Lines in an expanded "unmodified lines" block are outside the hunks. GitHub cannot place a comment there. The gutter still shows "+", and the server rejects the click with the `checkAnchor` message. The tab shows that message in an alert at the top, as it does for "Send to agent" errors.
- Alternative: filter "+" per line in the UI with `diffLines`. Rejected for now. `@pierre/diffs` has no per-line gutter switch, and the case is rare.

### 3. Focus on the new card

`CommentDraftsProvider` also provides a second context, `useNewComments()`, with `create(path, side, line)`, `createError`, `focusDraftId`, and `clearFocus`. `create` calls the RPC, sets `focusDraftId` state to the returned id, and calls `onWritten()` to reload. `CommentDraftCard` focuses its textarea when its id is `focusDraftId`, then clears it.

- `focusDraftId` is state, not a ref: the server publishes `review.updated` before the RPC returns, so the reload can mount the card first. A state change runs the card effect again.
- A separate context, so `ReviewContent` does not render again on each key press in a draft. The panel count is computed in `SubmitPanel`, which already reads the drafts context.

- Alternative: insert a local card before the reload. Rejected. Two sources for one draft need merge logic.

### 4. Empty drafts at Submit

- One helper in `core/review-drafts.ts`: `hasText(body) => body.trim() !== ""`.
- Server: `reviewInput` sends only drafts with text and uses that count in `submitRules`. Remove the "is empty" error. `deleteReviewDrafts` already deletes all comment drafts after success.
- UI: `SubmitPanel` counts with the typed text from `CommentDraftsProvider.stateOf`, not the saved body. The user can type and click Submit before the 500 ms save. `SubmitPanel` already calls `flushAll()` before submit.
- The one-commit check at Submit still looks at all drafts, empty ones too. An empty draft on an old commit still needs a delete. This keeps the rule simple and matches the warning.

### 5. Label

`CommentDraftCard` shows "Pending comment" with the `MessageSquare` icon in place of `Bot` and "Draft from agent". `source` stays in storage but the UI does not read it.

## Risks / Trade-offs

- [Each "+" click loads the review from GitHub, so the card shows after a short delay] → Acceptable for one click. The card gets focus when it shows.
- [A click on a line outside the hunks gives an error, not nothing] → Message names the diff ranges. Fix later with per-line filtering if it is annoying.
- [Empty drafts stay in storage until the user deletes them or submits] → They do not block Submit and the user sees them on their line.
- [`review list` for the agent shows empty user drafts] → Harmless. The agent sees an empty body.
