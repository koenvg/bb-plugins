# Tasks

## 1. Share merge operation state

- [x] 1.1 Add a thread-scoped operation module and adapt `ui/use-merge-action.ts` to subscribe to it. Verify with focused tests that two subscribers see the same running action, simultaneous requests send one RPC, and different threads stay independent.
- [x] 1.2 Make operation lifetime independent of a button mount and keep errors tied to the captured head commit. Verify unsubscribe/remount during a deferred write retains the guard, RPC rejection releases it, and a new head hides an old error.
- [x] 1.3 Integrate the shared snapshot into `ui/merge-action-button.tsx` and banner progress text. Verify simultaneous tab/banner tests for both merge and enqueue, a tab mounted during a write, shared failure feedback, and merged/queued refresh results.
- [x] 1.4 Update the README's merge section to describe shared progress and duplicate-request protection. Verify it no longer claims the tab and banner have separate busy states.

## 2. Move palette merge to the chat view

- [x] 2.1 Add a dedicated merge intent path in `ui/commands.ts` and `ui/command-intents.ts`; remove tab-owned palette merge handling from `ui/pr-tab.tsx`. Verify `ui/commands.test.tsx` asserts no panel call for merge, one chat recipient, and unchanged routing for all other commands.
- [x] 2.2 Extract reusable confirmation presentation and handle palette preparation in `ThreadBanner` before normal-banner early returns. Use the existing refresh RPC and inspect both load failures and retained-data refresh errors. Verify a fresh successful load opens one dialog without a panel call, enqueue needs no dialog, and failure never uses stale action data.
- [x] 2.3 Capture confirmation details and head commit for the attempt, and prevent repeated commands during preparation, confirmation, or a running write. Verify cancel sends no write, new insight does not silently change a confirmed target, double commands enqueue once, and a palette request during a button write cannot start another write.
- [x] 2.4 Add thread-view cleanup for pending preparation and confirmation without cancelling a sent write. Verify thread switches ignore late preparation results, close unconfirmed dialogs, retain an active write for its source thread, and do not replay consumed commands after remount or restart.
- [x] 2.5 Update the README command table and `PLUGIN_OVERVIEW.md` to describe direct chat confirmation and no panel navigation for merge. Verify other command descriptions still match their existing behavior.

## 3. Keep feedback visible in chat

- [x] 3.1 Render palette preparation, action errors, and unavailable-action reasons independently of normal banner visibility. Add dismissal and clear obsolete feedback on a new attempt or relevant new PR data. Verify banner tests for blockers, no PR, closed PR, merged/queued PR, refresh errors, and stale-head error cleanup without automatic navigation.
- [x] 3.2 Keep normal banner text navigation and compact-button layout intact, with operation errors exposed as alerts and the existing accessible confirmation semantics. Verify keyboard confirmation/cancel, dismiss behavior, explicit banner navigation, and no duplicate dialog when the PR tab is already open.
- [x] 3.3 Document banner error visibility and explicit panel navigation in the README. Verify the documentation agrees with the spec scenarios and the delivered UI.

## 4. Check complete behavior

- [x] 4.1 Run `npm test`, `npm run typecheck`, and `npm run build` from `bb-plugin-github-insight`. Verify all commands pass and existing server head-commit, enqueue, and refresh tests still pass.
- [x] 4.2 Check the live BB UI or an equivalent deterministic UI harness with the side panel closed and with Review selected. Verify palette preparation, confirmation, cancel, merge/enqueue progress, and failures leave panel layout and selection unchanged; verify tab and banner loading states agree. Record any live-check limit. Do not merge a real PR solely for testing without explicit approval.
- [x] 4.3 Run the required completion review and `openspec validate shared-merge-progress-no-panel --strict`. Verify findings are resolved and validation passes before reporting the implementation complete.

## Verification evidence

- The registered-slot SDK harness covers palette preparation, confirmation, cancellation, merge/enqueue progress, failures, thread switches, and shared tab/banner state. Closed-panel and Review-selected fixtures record no panel calls; every flow fixture also asserts no navigation calls. Confirmation tests check cancel autofocus, Escape cancellation, and a keyboard-generated confirmation click.
- Full validation passes: 922 tests in 57 files, type checking, plugin build, and `git diff --check`.
- No live plugin installation or real GitHub write was performed. The harness does not prove host CSS/layout or live palette focus restoration; those checks remain a live-install limit.
- The single read-only completion review found two issues. Both are resolved: refresh now queues and reconciles realtime reloads without cancelling its own result, and feedback invalidation includes refresh-error status so successful recovery clears the message. Regression tests reproduce publication before the refresh response for merge, enqueue, blockers, and no PR; they also check recovery with the same head and rejection of obsolete thread results. All affected checks were rerun after the fixes. No second review was run.
