# Tasks

## 1. Server: drafts-only read and event

- [x] 1.1 Add `REVIEW_DRAFTS_UPDATED_CHANNEL` in `core/review-updated.ts`, with the same payload and guard (`isReviewUpdateFor`) as `review.updated`; verify the server tests expect it
- [x] 1.2 Add a reply-drafts read that filters by given review threads (or none) and deletes nothing in `review/draft-store.ts`; verify in `draft-store.test.ts`
- [x] 1.3 Add `getDrafts` to `contract.ts`, `review/review-service.ts`, and `server.ts`; verify with a test that it returns drafts and makes no `fetchPrFiles` / `fetchReviewThreadsPage` / `fetchPrHead` call
- [x] 1.4 Make the KV-only writes (`createCommentDraft`, `deleteCommentDraft`, `discardDraft` in `review-writes.ts`; `saveDraft`, `saveCommentDraft`, `saveSummaryDraft` in `review-service.ts`) publish on the drafts channel and not on `review.updated`; verify in `review-writes.test.ts` and `review-cli.test.ts`

## 2. Server: PR data cache for "+"

- [x] 2.1 Keep the last `{ head, files, threads }` per PR in `review-service.ts`, replaced on each successful `load`, and add `loadBasis(threadId)` that uses it or loads once; verify with tests: second call makes no `gh` call, empty cache loads once, a new `load` replaces the entry
- [x] 2.2 Make `createCommentDraft` use `loadBasis` and read `commentDrafts` from KV; verify in `server.test.ts` that "+" after a load makes no `gh` call and still rejects a closed PR, a bad anchor, and drafts on an older commit

## 3. UI: drafts reload and one reload for each write

- [x] 3.1 In `ui/review-tab.tsx`, call `getDrafts` on the drafts channel and merge the result into the loaded review, keeping `files`, `threads`, and `head`; verify in `review-tab.test.tsx` that an agent draft save shows the draft and calls only `getDrafts`
- [x] 3.2 Remove the `onWritten` reload after delete and create in `ui/comment-drafts.tsx`, and after discard in `ui/thread-actions.tsx`; keep it for resolve, reply, and submit; verify in `review-tab.test.tsx` that a delete calls `getReview` zero times
- [x] 3.3 Check that a new "+" draft still gets focus after the drafts reload brings its card; verify with the existing focus test in `review-tab.test.tsx`

## 4. UI: optimistic delete

- [x] 4.1 Hide a draft id in `CommentDraftsProvider` on Delete click, so the line card, the older-commit list, and the submit panel count drop it; verify in `review-tab.test.tsx` that the card is gone before the RPC resolves
- [x] 4.2 On a delete error, show the card again with its text and the error; verify in `review-tab.test.tsx`
- [x] 4.3 Update `bb-plugin-github-insight/README.md` ("Review drafts") to say draft writes reload only drafts and Delete hides the card at once; verify the text matches the behavior

## 5. Integration

- [x] 5.1 Run the plugin test suite and type check (`vitest run`, `tsc --noEmit`); verify all pass
- [x] 5.2 In bb, open the Review tab on a large PR, delete a draft and add one with "+"; verify the card goes away at once and no `gh` process runs (host log)
