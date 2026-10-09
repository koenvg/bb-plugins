# Tasks

## 1. Client-local PR navigation handoff

- [x] 1.1 Add the dependency-light request module owned by github-insight with a versioned window-local record, matching thread ids, unique tokens, notification, cancellation, and listener disposal. Verify interface-level tests cover request-before-mount, mounted receivers, mismatched threads, and isolated client windows.
- [x] 1.2 Implement latest-request-wins, accepted-open consumption, reentrancy protection, and 30-second expiry. Verify tests cover rapid B-to-C selection, stale acknowledgements, duplicate notifications, cancelled requests, declined or throwing open callbacks, and expiry without a later unexpected open.

## 2. Destination-owned PR panel opening

- [x] 2.1 Add a receiving hook to github-insight's thread composer registration before any missing-insight or no-blocker return. Verify host-slot tests open the `pr` action for the matching thread with no visible blocker banner, delayed insight, and an already-active thread.
- [x] 2.2 Ensure receiver cleanup on thread changes and unmount, and preserve normal blocker-banner activation. Verify tests cover route changes, effect re-registration, declined embedded-surface opens, and the existing banner click regression.
- [x] 2.3 Document the sidebar-to-PR handoff and client-local lifetime in `bb-plugin-github-insight/README.md`. Verify the description matches the request module and does not claim a cross-plugin SDK panel-opening interface.

## 3. Whole-badge action and sidebar navigation

- [x] 3.1 Replace the external PR anchor in `PrBadgeView` with one accessible button and an activation callback, preserving presentation, tooltips, focus styles, and row-overlay layering. Verify badge tests cover icon, count, text, and background activation plus accessible status and button naming across representative PR states.
- [x] 3.2 Wire `ThreadRow` to request the PR destination before calling its normal thread-open and compact-sidebar dismissal actions. Replace the external-link regression test with coverage asserting the clicked thread id, one navigation callback, and no external URL activation; verify shared-environment rows target their own thread ids.
- [x] 3.3 Cancel pending badge intent for ordinary title and explicit split navigation while preserving existing shortcut attributes and modified-click behavior. Verify the existing keyboard-target, split-drag, thread-menu, compact-navigation, and missing-summary tests still pass, with cancellation coverage added.
- [x] 3.4 Update `bb-plugin-pr-thread-list/README.md` to state that the whole PR badge opens the thread's PR tab and external GitHub links remain inside that panel. Verify the README no longer promises external-link badge activation.

## 4. Cross-plugin integration verification

- [x] 4.1 Exercise the sender and github-insight receiver together across a thread-scope transition, including a receiver mounted after activation and a receiver whose banner renders nothing. Verify the final panel call targets the clicked thread's `pr` action exactly once rather than merely asserting event dispatch.
- [x] 4.2 Run `npm test`, `npm run typecheck`, and `npm run build` in both affected plugin directories. Verify both independently built bundles resolve the shared module without new SDK dependencies and record the results.
- [x] 4.3 Reload both plugins and verify live clicks from a different active thread, an already-active thread with a closed panel, and an existing PR tab. Verify no duplicate tab, no browser tab, no modification to the previous thread's panel, and correct compact drawer dismissal.
- [x] 4.4 Verify real keyboard activation with Enter and Space and clicks across checks, review, conflicts, counts, and status text. Verify title navigation remains unchanged and revisiting a thread after handling an activation does not reopen its panel.

## Live verification status

Automated checks, both builds, SDK alignment, and the single completion review passed. With user approval, both plugins were temporarily activated from this exact worktree and their bundles loaded in the user's Arc session. Earlier attempts lacked an active PR fixture, and restored CSP-26 was archived again before interaction checks.

After the user authorized choosing any thread, verification used the existing Codex quota thread `thr_4agcqyyzzr` with merged PR #5 and its persistent checkout. Initial desktop route transition, previous-panel preservation, already-active reopening, one existing PR tab, native Enter/Space, background/icon/status-word clicks, title navigation, and consumed-intent behavior passed. Compact verification initially failed: PR was selected but its drawer was hidden.

With separate repair approval, investigation found that BB resets the compact drawer in a parent effect after the receiving composer's mount effect. Cancellable microtask registration now lets that reset finish before opening. The regression failed before the fix and passed afterward; full suites passed with 385 GitHub Insight tests and 105 sidebar tests. Fresh live checks passed at 375×812 for both destination mounting and an already-active thread: sidebar dismissed, panel shelf full, visible selected PR tab. Desktop keyboard, tab reuse and title-return checks passed again. Task 4.3 is complete. The merged fixture lacks live check/review/conflict/count marks, so 4.4 stays unchecked (12/13 complete).

Both original plugin sources, sidebar preferences and panel selections were restored. The test thread is rearchived, idle, still read, and has no queued messages; its pre-existing checkout remains ready and untouched. Owned Arc pages and sessions were closed, with emulation cleared. No agent input was sent and no PR was created or changed. The existing single review preceded the compact repair; no second review pass was run. Evidence is in `/tmp/pr-badge-verification-thr_t637csxixv/report.md`.


## Archive acceptance

The user accepted this change for archive and waived the remaining verification on 2026-10-09. Checkbox 4.4 records that waiver, not full live verification. The earlier verification limits above remain valid: the merged PR fixture did not provide live check, review, conflict, or count marks. No new live checks were run in this archive session.
