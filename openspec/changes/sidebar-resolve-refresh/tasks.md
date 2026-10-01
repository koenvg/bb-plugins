# Tasks

## 1. Check the signal path

- [x] 1.1 In the running BB app, post on a `BroadcastChannel` from the github-insight frontend and receive it in the pr-thread-list frontend. Verify that the message arrives. If it does not arrive, stop and bring the result back to design.md.

## 2. Server refresh after resolve (github-insight)

- [x] 2.1 Add the `refreshAfterWrite(threadId)` dependency to `createReviewWrites`. Call and await it after a successful `setResolved`, and after `reply` when the resolve succeeds. Ignore its errors. Verify with new cases in `review/review-writes.test.ts`:
  - The refresh runs after a resolve and after an unresolve.
  - It runs after a post + resolve where both succeed.
  - It does not run when the write fails.
  - It does not run for a post without resolve.
  - A refresh failure still returns `ok` or `posted`.
- [x] 2.2 Add `refreshAfterWrite` to the insight service: it waits for a run in progress, then refreshes. In `server.ts`, connect it to `createReviewWrites`. Verify that `server.test.ts` passes and has a case where `setResolved` writes the new `prSummary` metadata before it returns.

## 3. Send the signal (github-insight UI)

- [x] 3.1 In `ui/thread-actions.tsx`, post `{ threadId }` on the `github-insight.summary-written` channel after a successful `setResolved`, and after `post` with `resolve: true` and no `resolveError`. Verify with `ui/review-tab.test.tsx` cases:
  - The signal goes out for resolve, unresolve, and post + resolve.
  - No signal goes out for a failed write, a post without resolve, or a discard.
- [x] 3.2 Update the Review tab section of `bb-plugin-github-insight/README.md` to say that a resolve updates the PR summary at once. Verify that the README text matches the behavior.

## 4. Reload on the signal (pr-thread-list)

- [x] 4.1 In `use-summaries.ts` `useSummaries`, listen to the channel while the list is mounted. On a message, call `listSummaries` at once. Keep the 60s interval as it is, and let only the newest load write. Close the channel on cleanup. Verify with `app.test.tsx` cases:
  - A message loads the summaries again and shows the new badge.
  - An older load that finishes last does not overwrite the newer summaries.
  - After unmount, a message triggers no read.
- [x] 4.2 Update `bb-plugin-pr-thread-list/README.md` where it describes the 60s refresh. Verify that the text matches the behavior.

## 5. End-to-end check

- [x] 5.1 In the running app, resolve the last open review thread of a PR from the Review tab. Verify that the sidebar badge drops the unresolved threads state within about 3s. Unresolve it, and verify that the state comes back. Run `npm test` in both plugins and verify that they pass.
