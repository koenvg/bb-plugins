# BBP-64 activation and live checks

This report preserves the initial activation checkpoint. The later approved pair
is complete in [bbp64-paired-report.md](bbp64-paired-report.md), including the
failed full-change latency target and the passing BBP-64 first-visit readiness check.

Tasks from this worktree is active in BB. Read-only navigation and native Ticket smoke checks passed. Paired timing measurements stopped at fixture preflight. BBP-64 remains in review, not done.

## Approval and identity

- Thread: [BBP-64](bbthread://thr_w6p2tiuy43).
- Operator approval: "approve to activate this worktree in bb so you can test".
- Source HEAD: `da0946e9732218d3343aa041a0ea54797196c027`, plus the reviewed uncommitted BBP-64 changes. No rebase, source commit or other checkout edit ran.
- Activated source: `path:/Users/koen/.bb/plugins/environment-git-worktree/host-data/worktrees/thr_w6p2tiuy43-1/bb-plugins/bb-plugin-tasks-plus`.
- Build and `bb plugin install` passed. Tasks is enabled/running with bundle `77435f78a576e5a8`.
- Served Tasks app SHA-256 matches disk: `29b093915700684e16353333780ab406da470e6b5bc478ff4db9b6800356edc9`.
- Tasks CSS SHA-256: `e9735446f27c9c02c0896cce72022b40b4e8459120eb9d8bd92133e1592f137a`.
- Codex quota stayed enabled/running from `/Users/koen/workspace/bb-plugins/bb-plugin-codex-quota`, bundle `97416b08f8d08743`. Its source, enabled state and bundle are unchanged from immediate preactivation.
- The task-owned browser page loaded both Tasks and quota bundle resource URLs. No latency claim follows from bundle identity.

The approved worktree remains active. The prior Tasks source was the `thr_zv6qephvq3-1` worktree. It was not edited and no rollback ran. This path is a worktree, not a retirement-safe deployment snapshot.

## Browser ownership and method

Browser Use's default local browser was used for the local BB app, which needed no separate login. One new task-owned tab was created, target `602CCB8E1E18D6F2A5334EAC4CC25900`. No existing user tab was navigated or closed. The tab was activated only when background-page rendering stopped. It was closed after the checks.

A temporary page-only fetch wrapper recorded Tasks RPC reads, and a DOM observer inspected matching selected/detail identities. Both were removed before closing the tab. The viewport override was cleared. No profile or benchmark probe ran. Early hidden-page key events did not move the selection, and early compact screenshots did not show settled layout. Those attempts are not acceptance evidence. The later foreground keyboard check and same-call settled compact check supply the results below.

## Verified read-only smoke checks

These checks used current BB Plugins tasks, not the changed canonical BENCH fixture. They are not paired latency samples or complete save/draft acceptance.

| Check                              | Verified result                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Select BBP-115                     | Selected row, title and description identify BBP-115                                                                                |
| Immediate neighbors                | Only BBP-52 and BBP-117 basic lookups start after selected success                                                                  |
| First movement to BBP-117          | Matching title/detail appear; no repeated BBP-117 lookup; BBP-128 becomes the next eligible neighbor                                |
| Preview button return to BBP-115   | Matching selected/detail identity is retained                                                                                       |
| Foreground ArrowDown, then ArrowUp | BBP-115 to BBP-117 to BBP-115; row, title and detail agree after both events                                                        |
| Cached keyboard destination        | BBP-117 lookup count stayed at 5 before/after the foreground ArrowDown; prior counts include live revalidation outside the movement |
| Editor shortcut guard              | A raw `j` key event in the task title did not change BBP-115 selection or title                                                     |
| Compact native Ticket, 430 by 932  | Same selected title/description shown in a Ticket region at x=0, y=48, width=430, height=884; screenshot inspected                  |
| Park and reopen                    | Hiding the right panel keeps selected/detail BBP-115; explicit row selection reopens the same task                                  |
| Writes and notifications           | No create/update/delete/delegate/notify/steer/remove/submit Tasks RPC method recorded during these checks                           |

The selected detail still performs its existing secondary reads. Adjacent warming did not mount neighbor activity, attachment, thread or PR queries. The first observed sequence was selected BBP-115, then speculative BBP-52 and BBP-117. On selecting BBP-117, BBP-128 was the only new basic lookup. Later live invalidation/revalidation occurred and was not counted as warm latency evidence.

Local evidence files include `desktop-smoke.json`, `keyboard-smoke.json`, `editor-keyboard-guard.json`, `compact-settled.json`, `compact-settled.png`, `park-reopen.json` and fixture pre/postflight under `/tmp/bbp64-live-evidence`. The desktop and final compact screenshots were inspected. No pending-save failure was injected, no description/comment draft was written, and no existing task data was edited.

## Fixture gate and remaining paired result

The canonical BBP-60 fixture project is `01M438V5VZN4P2JQYYYEHY5597`, prefix BENCH. Preflight found 100 tasks, three labels, 50 comments and ten attachment metadata records. One saved revision differs from the original accepted snapshot:

- BENCH-99, task ID `01M438WMWR7FB6P3V9NDW1AZ72`.
- Expected `updatedAt`: `2026-10-04T10:55:53.240Z`.
- Current `updatedAt`: `2026-10-05T17:45:44.001Z`.
- All other compared saved fields and records match. The reason for the revision change was not established.

The protocol says to stop on changed fixture records. No canonical benchmark used this fixture, no saved revision was overwritten, and attachment bytes were not downloaded or requalified. Postflight exactly matches this attempt's preflight, including the differing revision.

No before/after samples exist for BBP-64. Median, p95, worst time, blank intervals and long-task counts remain unknown. The 100 ms p95 target is not claimed. Full installed save/draft and rapid/invalidation cases remain unrun.

The next decision is whether to accept the current BENCH-99 revision as a new fixture baseline and permit temporary baseline/candidate activation for the paired benchmark. Approval would allow a new read-only fixture qualification and measurements. It would not allow overwriting fixture data or editing another checkout. Leave this candidate active until that decision.
