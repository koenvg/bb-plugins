# BBP-64 adjacent preview loading

## Source and scope

- Task: [BBP-64](bbtask://BBP-64).
- Thread: [implementation and checks](bbthread://thr_w6p2tiuy43).
- Starting commit: `da0946e9732218d3343aa041a0ea54797196c027`.
- Starting worktree was clean. BBP-63 was verified as done with `bb tasks show BBP-64 --json`. No task attachments were present.
- Requirements: `openspec/changes/tasks-navigation-performance/specs/tasks-navigation-performance/spec.md` and design section 4.
- This change adds adjacent basic task reads to the existing session preview cache. It does not change list order, selection, save barriers, drafts, host tab ownership or secondary detail loading.

## Implemented rules

Only the immediately previous and next keys from the current successfully settled visible order are eligible. The selected preview must first have a current positive response. Scope reports carry their route scope so a prior scope cannot supply neighbors. Filters, sort, child expansion and status collapse come from the rendered list, not a second task-order calculation.

The queue holds at most two distinct normalized keys and replaces pending work when order or context changes. At most two speculative transports can be issued. Invalidated issued calls keep their slots until completion. A selected read bypasses the queue and shares an issued same-key read. It does not wait for a free speculative slot.

Invalidation revokes publication rights and clears queued work. Disposal rejects late publication and rescheduling. A call invalidated or disposed before its start microtask does not issue a transport. Failed speculative reads do not start a retry loop. Preview retention remains limited to 32 tasks and 2 MiB.

Only `getTaskByKey` runs for neighbors. Their detail views do not mount. Prefetch does not read their comments, attachments or live status, perform writes, notify agents, open host tabs, navigate or change focus. See [task-previews.md](../../shell/task-previews.md) for the full policy.

## Verified local checks

| Check                                                                        | Result                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Full Tasks suite, `npm --prefix bb-plugin-tasks-plus test -- --maxWorkers=2` | 112 files, 1,163 tests passed, including the final first-visit assertion |
| Final focused preview/workspace checks                                       | 5 files, 43 tests passed                                                 |
| Tasks typecheck                                                              | Passed                                                                   |
| Tasks lint                                                                   | Passed with four existing warnings in unchanged code                     |
| Tasks formatting                                                             | Passed                                                                   |
| `bb plugin build bb-plugin-tasks-plus`                                       | Passed, local build only                                                 |
| Benchmark driver and qualification tests                                     | 19 passed, synthetic tests only                                          |
| `git diff --check`                                                           | Passed                                                                   |
| Independent read-only review                                                 | Source approved; 50 focused and 19 helper tests independently passed     |
| Installed paired warm-navigation benchmark                                   | 36 qualified warm movements per side; first-visit readiness 0/9 to 9/9   |
| Installed native and compact host checks                                     | Read-only smoke passed; full save/draft cases remain unrun               |

New tests cover slot limits, replacement of queued keys, selected-read priority, normalized same-key sharing, task/key/all/write/epoch invalidation, failure/absence behavior, cancellation before transport start and late completion after disposal. Rendered workspace checks cover manual/priority order, expanded/collapsed children, filtered dimmed parents, collapsed status groups, failed/unsettled order, a changed scope, changed filters, pending neighbor sharing, first-visit warm detail, focus and parked Ticket tabs.

The initial test checkpoint failed because `warm` did not exist. Full-suite validation later found one stale transport fixture. It invalidated its first request before the transport start microtask, then waited for the second mock response. The fixture now explicitly issues the first transport before testing late publication. The full suite passed after that correction. Older request-count assertions now count the selected key or include adjacent revalidation on refresh and reconnect.

These checks use Vitest, jsdom and the SDK test host. They establish request policy and DOM behavior, not installed presentation-frame latency, real host layout or cross-plugin costs. No new actionable cleanup was found.

## Independent review

The [single fresh-context review](bbp64-independent-review.md) approved source
integration with no blocking findings or actionable cleanup. The reviewer
personally verified 7 files with 50 focused tests, 19 benchmark helper tests and
`git diff --check`. The final full-suite rerun completed in the parent after the
review handoff with 112 files and 1,163 tests passed. The preserved review correctly
lists that full rerun as pending at handoff, not as independently verified.

The review did not establish installed acceptance or authorize plugin activation.
The source is ready for integration; BBP-64 remains in review for the browser
measurement and native/compact acceptance checks below.

## Local build identity

Machine: Darwin arm64. Candidate Tasks app SHA-256:

`29b093915700684e16353333780ab406da470e6b5bc478ff4db9b6800356edc9`

Candidate Tasks CSS SHA-256:

`e9735446f27c9c02c0896cce72022b40b4e8459120eb9d8bd92133e1592f137a`

These hashes identify the local candidate, not a running browser bundle.

## Paired warm-navigation result and limits

No before/after browser samples have been taken for BBP-64. Median, p95, worst time, blank intervals and long-task counts are unknown. No 100 ms p95 claim is made. Cold and save-pending transitions have not been classified as warm successes.

Read-only installed-state check at `2026-10-07T09:44:57Z` found:

- Tasks enabled and running from another thread's worktree, `thr_zv6qephvq3-1`, with bundle `27bbb47443ec2b3e`.
- Codex quota enabled and running from `/Users/koen/workspace/bb-plugins/bb-plugin-codex-quota`, with bundle `97416b08f8d08743`.

At the original review checkpoint the candidate was not installed or activated. No other checkout or running plugin was changed. That installation was not an approved paired baseline, and browser resource URLs had not yet been checked.

Activation and the revised fixture were then approved. The candidate is active. Paired measurement recorded 36 qualified warm movements per side and no observed blank intervals. First-visit readiness improved from 0 of 9 to 9 of 9, but warm p95 was 248.2 ms before and 251.6 ms after. See [bbp64-paired-report.md](bbp64-paired-report.md) for final evidence and scope. BBP-64's adjacent-loading checks are complete; the complete change's 100 ms budget and full installed safety acceptance remain open under BBP-68.
