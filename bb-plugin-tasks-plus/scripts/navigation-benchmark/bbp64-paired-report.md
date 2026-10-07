# BBP-64 paired navigation results

BBP-64's adjacent-loading checks are complete. In the candidate, all nine first down-movement destinations had current preview data before keydown. The baseline had none ready. The already-warm presentation pair did not show a latency improvement. Both sides still fail the complete change's 100 ms p95 target, which is an explicit acceptance gate of BBP-68, not a completed project outcome.

## Approval, source and fixture

- Task/thread: [BBP-64](bbtask://BBP-64), [evidence](bbthread://thr_w6p2tiuy43).
- Operator approved worktree activation, then answered "yes go for it" to accepting the current BENCH-99 revision and temporary baseline/candidate switching. No fixture record was edited.
- Baseline source is a clean `git archive` of `da0946e9732218d3343aa041a0ea54797196c027`. It lives under `/Users/koen/.bb/local-plugin-sources/tasks-navigation-measurement/bbp64-20261007-thr_w6p2tiuy43/before/bb-plugin-tasks-plus`.
- Candidate source is the same HEAD plus the reviewed BBP-64 working-tree changes. Production/source patch SHA-256 is `6e896c01ac1c54012e2002ef49e1c18a25f83fd0b550e9cb2eb37253ccf7e171`. No source commit, rebase or another checkout edit ran.
- Tasks version is 0.1.2. Baseline bundle is `27bbb47443ec2b3e`; candidate bundle is `77435f78a576e5a8`.
- Served baseline app matches disk, SHA-256 `c691fc662fd7af616546cb1c3cd6ade0b0f0f7aeddb9949b35102811ab113769`. Candidate app SHA-256 is `29b093915700684e16353333780ab406da470e6b5bc478ff4db9b6800356edc9`.
- Quota stayed enabled/running from `/Users/koen/workspace/bb-plugins/bb-plugin-codex-quota`, bundle `97416b08f8d08743`, on both sides. Its source is clean at repository HEAD `47f028b209ab28fbec3153873c91ec742aeb77f6`, committed before either run. Served/disk app SHA-256 is `2ebd0c0810050a47b9b5c4cfb336253c5038e39fa82778a92a20526827a67b94`. The baseline raw header initially records the unchanged served bundle rather than the source commit; this commit identity was verified after the pair. No quota source, settings or enabled state changed.
- Both browser runs observed their matching Tasks app/CSS URLs and the same quota app/CSS URLs.

Fixture project `01M438V5VZN4P2JQYYYEHY5597`, prefix BENCH, contains the canonical 100 tasks, three labels, 50 comments and ten attachment metadata records. Fixture manifest SHA-256 is `13d5abf519dc9d449be54e80ed92dda31fd7a03b250c6a720da8b7d136db8cc6`. BENCH-1 through BENCH-10 form a consecutive visible window.

The approved revised preflight contains BENCH-99 `updatedAt=2026-10-05T17:45:44.001Z` instead of the original `2026-10-04T10:55:53.240Z`. No other compared record differs from the original snapshot. Full paired pre/postflight snapshots are identical. Attachment bytes were not re-downloaded; their metadata matched. BENCH-99 is outside the measured window, and the accepted revision remains in the recorded dataset snapshot.

## Browser and measurement method

Machine is Darwin arm64. Both runs use Chrome 153.0.8010.53 in Browser Use's default local browser, a fixed 1440 by 900 viewport and CPU throttling rate 1. One new owned tab was used sequentially for both runs, target `E51872F2063FAC4A4EBD3260BBCBE4F8`. No user tab was navigated or closed.

The page-only driver uses the existing `probe.mjs` and `qualification.mjs`, without changing application selection or cache logic. It injects the qualification observer before app startup so the task responses and WebSocket are observed. It visits all ten tasks and returns to the first in 18 warm-up movements, then records 36 movements using trusted CDP key events.

Timing starts at captured keydown and ends at the second animation frame after matching selected row, detail key, exact title, description heading marker, rendered paragraphs, list and link. This is a presentation opportunity, not proof of a physical paint. Warm qualification requires an accepted matching revision before movement, the same invalidation epoch during movement and current matching data at the end. Each run saw only its initial connection-open invalidation, before the task reads. All 36 final samples on each side qualified as warm and presented. No signal, mutation or qualification error occurred during the measured windows.

Warm-up records retain the original runner's nominal cold label. They are excluded from final warm percentiles; that label is not a claim that every warm-up move was an actual cold lookup. First-visit readiness below is derived from accepted read completion times and sample keydown times, with the recorded unchanged epoch.

## Results

| Result                                                | Baseline | Candidate |
| ----------------------------------------------------- | -------: | --------: |
| Final qualified warm movements                        |       36 |        36 |
| Median                                                | 220.9 ms |  230.8 ms |
| p95, nearest rank                                     | 248.2 ms |  251.6 ms |
| Worst                                                 | 251.9 ms |  260.8 ms |
| Recorded blank interval total                         |     0 ms |      0 ms |
| Long tasks in final window                            |       36 |        36 |
| Largest observed long task                            |   221 ms |    226 ms |
| First down-movement destinations ready before keydown |   0 of 9 |    9 of 9 |
| Basic lookups through warm-up and final run           |       10 |        12 |
| Basic lookups during final warm movements             |        0 |         0 |
| Resource entries during final warm movements          |      252 |       252 |
| Mutation attempts or qualification errors             |        0 |         0 |

The candidate's extra basic reads are BENCH-96 and BENCH-12, the immediate neighbors outside the ten-key window. Each measured task was read once. This is bounded adjacent loading, not a full-tracker warm-up. The candidate had BENCH-2 through BENCH-10's matching current preview data before their first down-movement keydown, unlike the baseline.

Final warm-window request counts are the same on both sides: 72 `listTasks`, and 36 each for `getTaskActivity`, `listBbProjects`, `listAttachments`, `listTaskThreads` and `listTaskPullRequests`. These existing selected-detail reads are not adjacent speculative work. They also show why this single implementation slice is not proof that the complete navigation change is integrated.

The pair shows no already-warm presentation improvement. Candidate p95 is 3.4 ms higher in this pair. One sequential pair does not establish a stable regression. No timing samples were discarded, no failed/cold transition was relabeled as a warm success, and no unsaved edit or real save wait was introduced. Trace-derived main-thread/style/layout totals and sampled hotspot attribution are unrun; the long-task counts above are direct PerformanceObserver evidence, not a trace sum.

## Scope of completion

- BBP-64 limit/priority/sharing/invalidation/disposal and visible-order integration tests passed. Final full Tasks suite passed with 112 files and 1,163 tests. Typecheck, lint, formatting and build passed; lint has four existing warnings.
- The single independent read-only review approved source integration with no source blockers. It independently verified 50 focused tests, 19 synthetic benchmark helper tests and the whitespace check.
- Live read-only desktop/compact navigation, editor shortcut guard and native park/reopen checks passed in [the activation report](bbp64-activation-report.md). These smoke checks do not replace full installed save/draft, failure, rapid, invalidation, eviction or heavy-activity acceptance.
- BBP-64 now has its required paired evidence and demonstrated first-visit preloading. The 100 ms full-change target is failed, not waived or claimed. Current BBP-68 requirements explicitly own that budget and the complete installed integration/safety checks. BBP-68 remains todo; it was not changed here.

## Final installation, cleanup and rollback

The candidate worktree is enabled/running and remains active, bundle `77435f78a576e5a8`. Quota remains on its original source and bundle `97416b08f8d08743`. The temporary baseline was removed from active use. It was briefly reactivated after timing only to verify the served app digest, then the candidate was restored. The baseline asset URL returned 404 while inactive; that failed post-restore fetch is not used as source proof. The later active served/disk comparison matched.

Both probes and qualification observers were disposed. Startup scripts were removed, viewport and CPU overrides cleared, and only the owned benchmark tab was closed. No fixture data or user browser resource was deleted. Raw runs, qualification ledgers, manifests, first-visit derivation, source patch and driver are preserved under `/tmp/bbp64-paired-evidence` and in the attached evidence archive.

The worktree path is not retirement-safe. Do not retire it while BB uses it. A rollback must first confirm that the saved prior source and state remain unchanged, then use approved `bb plugin install` to that source. This checkpoint does not authorize a later rollback over concurrent user changes.
