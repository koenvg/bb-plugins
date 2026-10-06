# Tasks

## 1. Primary host RPC

- [x] 1.1 Add `getPrimaryHost` (`{}` to `{ hostId: string | null }`) to `rpcContract` in `bb-plugin-github-insight/contract.ts`. Register it in `server.ts` with `bb.sdk.system.config().primaryHostId`. Verify with a `server.test.ts` case that returns the configured host ID and `null` when no host is set.
- [x] 1.2 Add a `getPrimaryHost` default to the panel test RPC fakes (`unusedRpc` and `renderPanel` in `ui/pull-requests-panel.test.tsx`, and any other fake that spreads the full contract). Verify that `npm run typecheck` passes in `bb-plugin-github-insight`.

## 2. Seed the composer with the host

- [x] 2.1 In `ui/review-composer.tsx`, call `getPrimaryHost` on mount. Show the loading notice until it settles. Then mount `NewThreadComposer` with `{ type: "host", hostId, workspace: { type: "managed-worktree", baseBranch: { kind: "default" } } }`, or with no `defaultEnvironment` when `hostId` is null or the call fails. Verify that the seed test at `ui/pull-requests-panel.test.tsx:545` now expects `hostId` and passes.
- [x] 2.2 Add panel tests: no `defaultEnvironment` when `getPrimaryHost` returns `null`, and when it throws. Verify that both pass and that the existing submit and rejection tests still pass.
- [x] 2.3 In `bb-plugin-github-insight/README.md` ("Review in thread"), state that the composer opens on a new worktree on the primary host. Verify that the text matches the spec scenario "Composer opens on a new worktree".

## 3. Integration check

- [x] 3.1 Run the full `bb-plugin-github-insight` test suite, typecheck, and `bb plugin build`. Verify all pass.
- [x] 3.2 Install the plugin build in bb, open "Review in thread" on a PR you have not opened before, and verify that the environment picker shows "Worktree" without any change from you.
