# Tasks

All paths are in `bb-plugin-github-insight/`. Run tests with `npm test` in that directory.

## 1. Submit ignores empty comment drafts

- [x] 1.1 Add `hasText(body)` to `core/review-drafts.ts`. In `review/review-writes.ts` `reviewInput`, send only drafts with text, pass that count to `submitRules`, and remove the "is empty. Add text or delete it." error. Verify with tests in `server.test.ts`: 2 drafts, one empty, submit sends 1 thread and deletes both; 1 empty draft and empty body, Comment fails with "Add a summary or a comment".
- [x] 1.2 In `ui/review-tab.tsx`, compute the panel `commentCount` from drafts whose typed text (`useCommentDrafts().stateOf`) has text. Verify with tests in `ui/review-tab.test.tsx`: one empty and one filled draft shows "1 comment" and Comment is enabled with an empty body; typing in an empty draft changes the count without a reload.

## 2. Shared one-commit check

- [x] 2.1 Move the logic of `assertOneCommit` from `review/review-cli.ts` to a pure function in `core/` that returns `{ ok: true } | { ok: false; message }`. The CLI throws `PluginCliError` with the same text and hint. Verify that the existing `review/review-cli.test.ts` tests pass with no change.

## 3. Create RPC

- [x] 3.1 Add `createCommentDraft` to `rpcContract` in `contract.ts`: input `{ threadId, path, side, line }`, output `{ kind: "created", draftId } | { kind: "error", message }`. Verify with `npm run typecheck`.
- [x] 3.2 Add `createCommentDraft` and a `newDraftId` dep to `review/review-writes.ts`, and wire it in `server.ts` with `newCommentDraftId`. It loads the review, runs `checkAnchor` and the one-commit check, saves an empty draft at the head with `source: "user"` and `startLine: null`, and publishes `review.updated`. Verify with tests in `server.test.ts`: success saves the draft and publishes; a line outside the diff returns the `checkAnchor` message and saves nothing; drafts on an older commit return an error and save nothing; no PR returns "No pull request for this thread".

## 4. Review tab: "+" and new card

- [x] 4.1 Add `create(path, side, line)` and `focusDraftId` to `CommentDraftsProvider` in `ui/comment-drafts.tsx`. On success it reloads and `CommentDraftCard` focuses its textarea once. On error the tab shows the message in an alert at the top. Verify with tests in `ui/review-tab.test.tsx`: after create and reload, the new card textarea has focus; an RPC error shows the alert.
- [x] 4.2 Pass `onAddComment` from `ReviewContent` through `PrFileDiff` to `ReviewFileDiff` only when `head.state === "OPEN"` and there are no drafts on an older commit. Map `additions` to `RIGHT` and `deletions` to `LEFT`. Verify with tests in `ui/review-tab.test.tsx` (mock the gutter click as `../bb-plugin-changes/ui/changes-tab.test.tsx` does): a click on new line 42 calls `createCommentDraft` with `RIGHT`, 42; a click on a deleted line uses `LEFT`; no "+" on a merged PR; no "+" when drafts are on an older commit.
- [x] 4.3 Add "Submit or delete these drafts to add new comments." to the warning in `ui/older-comment-drafts.tsx`. Verify with the existing older-commit test in `ui/review-tab.test.tsx`, extended to check the text.

## 5. Label

- [x] 5.1 In `CommentDraftCard`, replace the `Bot` icon and "Draft from agent" with the `MessageSquare` icon and "Pending comment". Do not change reply drafts in `ui/review-thread.tsx`. Verify by updating the comment draft tests in `ui/review-tab.test.tsx` to "Pending comment", and check that the reply draft tests still find "Draft from agent".

## 6. Docs

- [x] 6.1 Update `README.md` ("Review drafts" and the Review tab bullet) and `PLUGIN_OVERVIEW.md`: the "+" in the gutter, when it does not show, the "Pending comment" label, and that Submit ignores empty drafts. Verify by reading the changed sections against `specs/pr-review-submit/spec.md`.

## 7. Integration check

- [x] 7.1 Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run format:check` in `bb-plugin-github-insight/`, and verify all pass.
- [x] 7.2 In the running bb app, open the Review tab on an open PR, click "+" on a new line and on a deleted line, type a comment, restart bb, and verify the draft is still there. Submit Comment with one empty and one filled draft and verify GitHub has one review with 1 line comment.
