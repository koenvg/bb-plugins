## 1. Shared parts in review-ui

- [x] 1.1 Move `patchIdentity` from `bb-plugin-changes/core/viewed-files.ts` to `review-ui/patch-identity.ts` and point the Changes plugin at it; verify a `review-ui/patch-identity.test.ts` (same patch gives the same identity, one changed character gives another) and `npm test` in `bb-plugin-changes` pass
- [x] 1.2 Move `ViewedCheckbox` and `CollapseButton` from `bb-plugin-changes/ui/file-section.tsx` to `review-ui/viewed-controls.tsx`, with the chevron icons as props; verify a `review-ui/viewed-controls.test.tsx` (labels, `aria-expanded`, disabled state, `onToggle` calls) passes and `bb-plugin-changes/ui/changes-tab.test.tsx` passes with no assertion changes
- [x] 1.3 Add `viewed-controls` and `patch-identity` to the list in `review-ui/README.md`; verify the README names every file in `review-ui/`

## 2. Server storage and RPC

- [x] 2.1 Add a viewed marks kv store in `bb-plugin-github-insight/review/` keyed by `viewed:v1:<owner>/<repo>#<number>`, with `get(pr)` and an in-order `update(pr, set, remove)` that deletes an empty entry; verify unit tests: read of a missing key gives `{}`, invalid stored data gives `{}`, two updates in a row both land, empty result deletes the key, a kv error gives `{ kind: "error" }`
- [x] 2.2 Add `viewedMarks` to the `getReview` ok result in `contract.ts` and `review-service.ts`; verify a `server.test.ts` case where stored marks for the PR come back in `getReview`, and marks of another PR do not
- [x] 2.3 Add the `updateViewed({ threadId, set, remove })` RPC that resolves the PR and calls the store without a review publish; verify `server.test.ts` cases: marks are saved under the PR key, two threads on the same PR share them, `no_pr` returns an error, and no `REVIEW_UPDATED_CHANNEL` publish happens

## 3. Review tab UI

- [x] 3.1 Add a pure `prViewedSummary(files, marks)` in `bb-plugin-github-insight/core/` that uses `patchIdentity(gitPatch(file))`; verify tests: valid mark, changed patch is stale, file not in the PR is stale, file without a patch is stale and not counted, markable count
- [x] 3.2 Add the client viewed store and a `usePrViewed(threadId, result)` hook in `bb-plugin-github-insight/ui/`: base marks from each `getReview` result, writes in flight on top, collapse toggles in memory, revert and "Could not save viewed state: <message>" on failure, one `updateViewed` call to remove stale marks; verify store unit tests for each of these, including a new result that arrives while a write is in flight
- [x] 3.3 Pass the collapse button, the checkbox and `collapsed` into `ReviewFileDiff` from `ui/file-diff.tsx`, keep the thread count, and show no controls on "Diff not available"; verify `review-tab.test.tsx` cases for the spec scenarios "Mark a file", "Unmark a file", "Expand a viewed file", "Collapse a file that is not viewed", "Review threads on a viewed file" and "File without a patch"
- [x] 3.4 Show "N/M viewed" after "N files changed" in the Review header and hide it when M is 0, and show the save error banner; verify `review-tab.test.tsx` cases for "Counter", "Counter after a push", "New push changes a viewed file", "New push does not touch a viewed file" and "Storage fails"
- [x] 3.5 Describe the "Viewed" mark in the Review tab section of `bb-plugin-github-insight/README.md` and `PLUGIN_OVERVIEW.md` (per PR, local only, drops on a patch change); verify both files name the `updateViewed` RPC and the kv key

## 4. Integration check

- [x] 4.1 Run `npm test`, `npm run typecheck` and `npm run lint` in `bb-plugin-github-insight` and `bb-plugin-changes`; verify all pass
- [x] 4.2 In the running bb app, open the Review tab of a real PR: mark a file, reload bb, open a second thread on the same PR, then push a change to the marked file and refresh; verify the file stays viewed after the reload, shows viewed in the second thread, and drops the mark after the push
