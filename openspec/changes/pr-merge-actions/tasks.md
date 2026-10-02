## 1. Spike

- [x] 1.1 On a repo with a merge queue, record the overview query response (with the D1 fields) for an open PR that is ready to enqueue and for a queued PR; trim them and save them under `bb-plugin-github-insight/test/fixtures/`; record in design.md (Risks) the `mergeStateStatus` that GitHub returns for the ready PR

## 2. Data

- [ ] 2.1 Add the D1 fields to `github/overview-query.ts` (first page only) and verify the `overview-query.test.ts` snapshot shows them inside the `@include(if: $firstPage)` blocks
- [ ] 2.2 Parse the new fields in `core/overview.ts`, add `pr.headOid` to `PrInsight`, and keep the node id on the server side; verify the existing overview tests pass and a new test reads `headOid` and the node id from the fixture
- [ ] 2.3 If spike 1.1 shows `BLOCKED` for a ready merge-queue PR, skip the `blocked` fallback in `buildBlockers` when the merge queue is enabled; verify a `blockers.test.ts` case for it (or record in design.md that no change was needed)
- [ ] 2.4 Implement `buildMergeAction` in `core/merge-action.ts` (D2) and add `mergeAction` to `PrInsight`; verify unit tests for: merged, closed, draft, queued with running checks, blocker present, merge queue enabled, each default method allowed, default method not allowed, and the three button labels

## 3. GitHub writes (host)

- [ ] 3.1 Add `github/merge-mutations.ts` with `mergePullRequestArgs` and `enqueuePullRequestArgs` (D4); verify unit tests that every value is a `-f` variable and that the query text holds no PR id, head commit, or method
- [ ] 3.2 Add host handlers `mergePullRequest` and `enqueuePullRequest` to `hostContract` and `host.ts`; verify `npm run typecheck` passes

## 4. Server RPC

- [ ] 4.1 Add a read of the cached entry (insight + node id) to the insight service for a thread, without a GitHub call; verify a unit test that it returns the cache and returns nothing for an unknown PR
- [ ] 4.2 Add RPC `runMergeAction({ threadId, action, expectedHeadOid })` (D3) that returns `ActionResult` and calls `refreshAfterWrite` on success; verify unit tests with fake host calls for: no PR, no cache, action does not match the cached action, head commit does not match, gh error text, merge success with the cached method, enqueue success, and refresh failure that only warns
- [ ] 4.3 Verify with a test that no CLI command calls `mergePullRequest` or `enqueuePullRequest`, and that `bb github-insight --help` lists no merge command

## 5. PR tab UI

- [ ] 5.1 Add the `MergeAction` row to `ui/pr-tab.tsx` for `enqueue` and `queued` (D5), built on a shared `MergeActionButton` and `useMergeAction(threadId)` (D6); verify `renderSlot` tests: "Enqueue" calls the RPC with the shown head commit and no dialog, "Queued" shows a label and no button, `none` renders nothing
- [ ] 5.2 Add the "Merge" button with the alert dialog (number, title, method label); verify `renderSlot` tests: the label matches the method, cancel sends no RPC, confirm sends one RPC with the shown head commit
- [ ] 5.3 Add the busy and error states; verify `renderSlot` tests: the button is disabled while running, a double click sends one RPC, an error shows its text and the button is available again
- [ ] 5.4 Implement `bannerState(insight)` in `core/banner.ts` (D6); verify unit tests for: blockers, ready to merge, ready to enqueue, queued, merged, and closed
- [ ] 5.5 Update `ui/composer-banner.tsx`: keep the blocker row; add the ready row (text button that opens the "PR" tab + `MergeActionButton`) and the "Queued" row; verify `renderSlot` tests: the text opens the "PR" tab with no RPC, confirm in the banner sends one RPC, a queued PR shows no button, a PR with blockers shows no merge button, and no `<button>` is inside another `<button>`
- [ ] 5.6 Add a "Merge and enqueue" section to `bb-plugin-github-insight/README.md`: where the button shows (PR tab and composer banner), the default merge method, the confirm step, the `gh` user, and that GitHub Enterprise versions without merge queue fields are not supported; verify the section matches the spec

## 6. Integration

- [ ] 6.1 Run `npm test` and `npm run typecheck` in `bb-plugin-github-insight` and verify both pass
- [ ] 6.2 In `bb plugin dev`, enqueue a ready PR on a merge-queue repo and merge a ready PR on a repo without one from the composer banner; verify the tab and the banner show "Queued", the banner hides after the merge, and that a push between refresh and click gives a GitHub error and no write
