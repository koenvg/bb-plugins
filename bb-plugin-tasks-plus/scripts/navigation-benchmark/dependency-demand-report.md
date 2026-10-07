# BBP-65 dependency demand checks

Task: BBP-65, Load dependency choices only when requested.
Source baseline: `da0946e9732218d3343aa041a0ea54797196c027`.
The checkout had no local edits at the start.
Thread: [BBP-65 implementation](bbthread://thr_tvvkhpdeax).

## Catalog request counts

These are verified frontend RPC counts in SDK integration tests, not installed-host latency measurements. A catalog request is an unfiltered `listTasks` call with only `limit` and optional `cursor`. List inventory, active-task pager, and task-scoped subtask reads are separate requests and are not counted here.

| Action                                                             |                                Catalog requests |
| ------------------------------------------------------------------ | ----------------------------------------------: |
| Native Ticket selection 1, 2, 3, 1 without a picker                |                                               0 |
| Open Add blocker, then Add blocked task for the same native detail |                                         1 total |
| Standalone selection 5, 4, 3, 5 without a picker                   |                                               0 |
| Task invalidation and manual refresh before any picker demand      |                                               0 |
| Switch pickers during a pending two-page catalog load              |                           2 total, one per page |
| Reopen either picker after that successful load                    |                                    0 additional |
| Two-page read fails on page two, then user selects Retry           |                        4 total, two per attempt |
| Invalidate a pending load, then finish the older load              |        2 total, only the current result appears |
| Manual refresh after demand                                        |                                    1 additional |
| Replace the task while its catalog is pending                      | 0 additional until the replacement picker opens |

Count tests: [native Ticket](../../shell/dependency-demand.test.tsx) and [detail dependency sections](../../views/detail/dependencies.test.tsx).

## Behavior and regressions

Both pickers share demand and query state. Existing dependency links remain available from task data before demand. Successful results last only for the mounted task detail and revalidate on the existing query invalidation signals. Loading, confirmed empty choices, and read failure have separate displays. Retry restarts catalog pagination at page one. Closing and reopening a failed picker does not silently retry it.

The search input stays focusable while choices load or a read fails. Users can
enter a query during loading and keep focus when the filtered choices appear.
Both picker directions have a regression test for this behavior.

Detail tests verify cross-project selection, self and existing-link exclusions on both sides, add direction, link removal, link navigation, cycle errors, invalidation, manual refresh, and stale success/failure after task replacement. Existing API, database, CLI, and blocked-work confirmation tests remain unchanged and pass in the full suite.

## Verified checks

- `npm test --prefix bb-plugin-tasks-plus`: 111 files, 1,152 tests passed.
- `npm run typecheck --prefix bb-plugin-tasks-plus`: passed.
- `npm run build --prefix bb-plugin-tasks-plus`: passed.
- `npm run check`: passed. Lint reports 18 warnings in unchanged code; formatting passes.
- `git diff --check`: passed.
- Local Chrome preview of the actual dependency component with an SDK fake RPC: existing links and zero reads before demand, loading, empty, failure, and successful retry verified. Ready and error screenshots inspected. This preview uses fixture styles and scripted DOM button events, not the signed-in BB host.
- Follow-up local Chrome keyboard check: the search field had focus during a slow catalog read and accepted text through CDP keyboard input. The integration tests verify focus and query retention after choices appear.

## Independent review

The required fresh-context review requested one fix: keep search focus during a
cold picker load. The first version disabled the input, so Radix focused the
dialog instead. Two new focus tests failed on that version and pass after removal
of the disabled state. No structural maintainability blockers were found. The
full suite and quality checks above were rerun after this fix.

## Limits

No installed plugin source, enabled state, or stored task data was changed. Installed-host request counts, compact-host styling, and paired navigation latency were not measured here. Those cross-plugin navigation checks belong to BBP-68. The counts above prove dependency catalog demand behavior, not the whole navigation performance target.
