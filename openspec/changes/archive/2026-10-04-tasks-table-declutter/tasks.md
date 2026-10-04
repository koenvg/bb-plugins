# Tasks

## 1. Remove row label presentation

- [x] 1.1 Add a failing row regression for labeled parents and subtasks, then remove the label chip tree and unused `labelsById` prop/map from `views/list/row.tsx` and `views/list/index.tsx`. Audit TS and TSX callers before removing `partitionLabels` or its tests. Verify rows have no label names, dots, or overflow counters while task label assignments and board label display remain unchanged.
- [x] 1.2 Add or update label-filter, context-menu, and `list.labels` shortcut regressions with visible label chips removed. Verify label edits persist, label filtering still works, the title-anchored picker opens from the shortcut, and closing it restores focus to the row.

## 2. Compact row layout and typography

- [x] 2.1 Add failing layout regressions, then replace the forced third metadata row with a shared key-and-metadata secondary group. Keep one container-aware component tree and the wide single-line mode. Verify short parent and subtask rows place key, priority, and progress together; a wide window with a narrow list pane uses the constrained layout; and expansion, selection, status/priority editing, and keyboard reading order still work.
- [x] 2.2 Apply medium-weight host title text and the next smaller readable metadata step, retaining coarse-pointer helpers and touch targets. Remove empty metadata layout space without duplicating summary availability logic. Verify long titles and dense metadata wrap without clipping or horizontal list scrolling, empty metadata adds no extra line or gap, and loading/unavailable summaries remain visible. Use component tests plus rendered layout checks rather than class assertions alone.
- [x] 2.3 Update the Tasks Plus README's list-view guidance for label-free rows and the compact two-line narrow layout. Verify the documentation retains label filtering/editing access and does not promise a fixed two-line height or hidden work warnings.

## 3. Shorten row summaries without hiding state

- [x] 3.1 Add failing archive-copy regressions, then change row-facing archive text to `All archived` or `N archived` in `views/list/thread-summary.tsx`. Verify Idle and failure counts remain visible, unknown archive state is not treated as fully archived, the accessible description retains full archive meaning, and individual thread state/navigation and focus restoration still work.
- [x] 3.2 Add failing PR-summary regressions, then shorten secondary quality/lookup wording in `views/list/pr-summary.tsx` without changing the existing single-PR link, aggregation, freshness, or primary problem state. Verify fresh, stale, unavailable, incomplete, mixed known/unknown, merged, and multi-PR failure cases remain truthful. Verify detailed causes and lookup counts are available from both the existing menu and accessible description, and unavailable lookup with no known items does not imply no PRs.
- [x] 3.3 Update row-metadata and mobile-layout expectations affected by shorter archive/lookup copy. Verify all previous state, failure, uncertainty, and navigation assertions still pass and the list-level work-status summary remains unchanged. Reconcile literal-text expectations with the in-flight `task-overview-thread-pr-status` change without rewriting its state contract.

## 4. Integration verification

- [x] 4.1 Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` from `bb-plugin-tasks-plus`. Verify all commands pass and report any environment limitation explicitly rather than treating an unrun check as passed.
- [x] 4.2 Perform one grouped rendered inspection at approximately 360, 640, 880, and 1100 CSS-pixel list-pane widths, including a narrow split-view pane in a wide window. Cover light/dark themes, fine/coarse pointers, increased zoom, long titles, dense failures/uncertainty, subtasks, and empty/loading rows. Verify title/metadata hierarchy, normal two-line grouping, retained touch/focus behavior, and no horizontal list scrolling. Run the scoped Impeccable layout scan, fix findings in one batch, and use at most one confirmation round. Record screenshots and outcomes in the implementation handoff; do not use a clean detector result as proof of readability.
