# Tasks

## 1. Tree-wide priority

- [x] 1.1 Replace the old running-parent/failed-child expectation in `bb-plugin-pr-thread-list/list-model.test.ts` and add cases for conflicts, failed checks, requested changes, unresolved comments, and failed merge queue entries during work; verify the new cases fail against the existing classifier with `npm test -- list-model.test.ts` from the plugin directory.
- [x] 1.2 Add priority coverage for running, background, and queued work at parent, child, and grandchild levels; include unread output, input requests, unread errors, and failed queued messages that must still win. Verify the cases assert whole-tree placement in exactly one tab and retain nested depths.
- [x] 1.3 Implement a focused tree-level decision at the `visibleItems` selection boundary: direct attention first, eligible member activity second, existing idle/PR fallback last. Reuse existing predicates and PR reason rules; verify `npm test -- list-model.test.ts tabs.test.ts` passes.
- [x] 1.4 Update the tree-placement explanation in `bb-plugin-pr-thread-list/README.md` to describe the three-stage order, preserved PR badges, and return to Needs attention when work stops; verify it matches the modified `Thread tree decides the tab` requirement.

## 2. Eligibility and live transitions

- [x] 2.1 Add exclusion regression cases for snoozed, archived, hidden, and display-only context work, plus an unrelated busy tree; ensure descendant activity used by the fallback cannot bypass eligible membership. Verify `npm test -- list-model.test.ts snooze-model.test.ts tabs.test.ts` passes and excluded work does not suppress an awake member's PR problem.
- [x] 2.2 Add state-transition coverage that re-derives the same tree after its last working member stops with conflicts remaining, and after unread output clears while work continues; verify results switch tabs without changing saved preferences or requiring a reload.

## 3. Integration verification

- [x] 3.1 Run the plugin's full `npm test`, `npm run typecheck`, and `npm run build` from `bb-plugin-pr-thread-list`; verify all succeed and existing All-tab, grouping, sorting, snooze, and individual-thread classification tests remain passing.
- [x] 3.2 Verify in the sidebar that a running tree with an idle conflicted child and no unread output appears only in In flight, retains the Conflicts badge and nesting, moves to Needs attention when work stops, and immediately shows in Needs attention for an approval or unread output; record the observed results.

## Verification evidence

Local validation passed: 322 tests across 19 files, TypeScript, SDK compatibility, build, and the single independent review with no blocking findings.

Task 3.2 is partially verified on the real TENET-20/TENET-21 tree. With the changed worktree active, the running parent and idle conflicted child appeared only in In flight; both Conflicts badges remained visible, neither row was unread, and the child stayed indented under its parent. Scanning the entire Needs attention tab found neither member. PR conflicts later cleared externally and the badges updated to checks running without a manual reload.

Live work-stop, approval, and unread transitions remain unverified. They are covered by automated tests, but exercising them live would require a safe natural transition or separate permission to change user runtime/read state. No agents were stopped and no read markers were changed.

The user accepted the demonstrated behavior and explicitly requested task 3.2 be marked complete, waiving further live transition checks. The coverage limits above remain recorded; this acceptance does not claim those transitions were observed live.

The original main-checkout plugin source was restored, enabled and running, and the dedicated browser was closed. The fix remains in this worktree. Private verification evidence is in `/tmp/thread-tree-activity-priority-checks/report.md`.
