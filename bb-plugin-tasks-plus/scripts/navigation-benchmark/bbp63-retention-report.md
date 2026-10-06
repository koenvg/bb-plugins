# BBP-63 repository checkpoint

Task-data retention is implemented and Tasks repository checks pass. Installed paired
measurements and native-host acceptance are still unrun. This is not a speed-up
claim, a 100 ms p95 result, or task completion.

## Source and scope

- Task: BBP-63. Thread: `bbthread://thr_pfg3cx99dh`.
- Pre-implementation commit: `ad329bec00731709a85fe69312e4fe87a54731b9`.
- Checkout: `/Users/koen/.bb/plugins/environment-git-worktree/host-data/worktrees/thr_pfg3cx99dh-1/bb-plugins`.
- Working-tree changes only. No commit, merge, installed source replacement,
  restart, browser acquisition or benchmark-fixture mutation occurred.
- Scope includes bounded selected-task data reuse, current session inventories,
  accepted-selection readiness and current-surface Ticket reveal. Adjacent warming
  remains BBP-64. Dependency/activity changes remain their own tasks.

The cache retains at most 32 positive entries and 2 MiB of UTF-8 task JSON.
Oversized tasks remain available to the active form without retention. Current
matching data mounts a new keyed editor. Failed saves still block cached
destinations; local edits and task-owned comments/files remain separate from
cache state. Events, manual refresh and reconnect revoke old publication rights.
Cold detail has identity/loading/Retry. Failed background reads label their data
as retained, not confirmed current. Thread and PR lifecycle reads remain live.

See [task-previews.md](../../shell/task-previews.md) and
[browse-workspace.md](../../shell/browse-workspace.md) for operating rules.

## Checks verified at this checkpoint

Host: macOS arm64. Node: 24.15.0. SDK: 0.6.15. Source dependencies were installed
from the existing lockfiles with `npm ci`; dependency files did not change.

| Check                                               | Result                                                          |
| --------------------------------------------------- | --------------------------------------------------------------- |
| Complete Tasks tests, `npm test -- --maxWorkers=2`  | 120 files, 1,233 tests passed                                   |
| Tasks typecheck                                     | Passed                                                          |
| Tasks lint                                          | Passed with four existing warnings in unchanged files           |
| Tasks local build                                   | Passed                                                          |
| Changed-file Oxfmt check                            | Passed                                                          |
| `git diff --check`                                  | Passed                                                          |
| Benchmark-tool Node tests                           | 19 passed                                                       |
| Unchanged quota tests, `npm test -- --maxWorkers=2` | 59 files, 513 tests passed                                      |
| Quota local build and `npm run test:bundle`         | Passed; bundle cases are synthetic                              |
| Quota typecheck                                     | Failed at two existing SDK fixture callback signatures, BBP-153 |
| Single fresh-context completion review              | Source approved; P3 corrected and verified                      |
| Installed paired navigation measurements            | Unrun, activation approval required                             |
| Installed native/compact acceptance and screenshots | Unrun                                                           |

Quota's failing file is byte-identical to the fixed baseline. Its SHA-256 is
`67c8e118244ae53b97ecefac5115495aa81a96c2616c45bb61453582a41111c2`.
The two TS2322 errors are in `src/history/identity/identity-discovery.test.ts` at
108 and 384. The existing [BBP-153](bbtask://BBP-153) records them. No quota source
was changed. Its typecheck is not claimed as passed or waived.

New module and rendered-workspace coverage includes normalization, in-flight
sharing, both budgets, LRU, oversize handling, stale generations, wrong-key
responses, failure/retry, null/disposal, manual refresh/reconnect, shared inventory
request counts, live thread/PR request counts, warm return, failed save, local
edits, old B finishing after C, comment/files/editor identity, CSS-hidden outlets
and React effect replay. The full suite also covers detail/save/removal,
workspace readiness/keyboard/context/reconciliation and native-pane behavior.
These are SDK/jsdom checks, not installed-host geometry or presentation evidence.

The test-first checkpoint failed on the missing preview module and on repeated
warm lookups, missing cold loading identity and repeated inventories before the
implementation. Full-suite regressions exposed save-drain ordering. Successful
writes now revoke reuse without triggering an active-query refresh mid-commit.
A surviving form revalidates after its edit drain. The separate transition API
issue is recorded as [BBP-157](bbtask://BBP-157); it was not changed here.

## Completion review

The [single fresh-context review](bbp63-completion-review.md) approved source merge
with no blocking findings. The reviewer personally ran 25 focused tests and the
whitespace check. The original review is preserved unchanged beside this report.
Its P3 note covered immediate disposal of a fallback inventory during React effect
replay. Provider and fallback now use one replay-safe lifetime hook. A new test
reproduced the old fallback failure under root Strict Mode, then passed with the
fix. Three binding/lifetime regressions pass, including provider replay and
separate RPC sessions. I reran the complete 1,233-test Tasks suite, typecheck,
lint and build after that correction. No second review ran.

The review also identifies limits of the DOM observer and shared SDK controller
fixture. They do not establish blank-free installed presentation frames or actual
separate-tree reveal suppression. Those remain required installed checks.

## Candidate build and installed state

Candidate Tasks app SHA-256 at this checkpoint:
`1f6090ea98dc05cf977d284d47ece98fd25cb0f551e63f6d20f9ec48930699ad`.
Candidate Tasks CSS SHA-256:
`3967dd6c8d1d19ec24de04b105d686f38066f4b1bdddf0e3a676bbcd7ef91942`.
These identify the final local build after the review correction, not a running
browser bundle.

Read-only installed-state snapshot on 2026-10-06 at 06:56 UTC:

- Tasks is enabled and running from
  `path:/Users/koen/.bb/local-plugin-sources/tasks-navigation-measurement/fresh-20261005T1732-thr_w7j752igff/after/bb-plugin-tasks-plus`.
  BB reports bundle `627c2e8f7a493079`. Disk app SHA-256 is
  `7e64cff100168573812835b325e20c35590588b7daedaa8b94eaa9dedd65dc4c`.
- Quota is enabled and running from
  `path:/Users/koen/workspace/bb-plugins/bb-plugin-codex-quota`.
  BB reports bundle `fb6ecfff6d1583c4`. Disk app SHA-256 is
  `77194ae36705c0e4204736a71ec52d0242edba3f28eea51d08ec2e7adcb61bce`.
- No browser was opened to prove its loaded resource URLs. Disk and CLI identities
  do not establish which bundles a personal browser has loaded.

## Paired measurements

No qualified before/after pair was run for BBP-63. Median, p95, worst, blank
intervals, long tasks, date/render/style/layout work and installed request counts
are all unavailable for this slice. Do not substitute jsdom test duration or
cached lookup completion for presentation timing.

The historical [BBP-60 paired baseline](paired-baseline-report.md) is context,
not BBP-63's before measurement. It cannot be paired with a new candidate on a
changed source composition. The current installed Tasks source is a separate
measurement snapshot, not this task's fixed baseline.

After explicit approval, use fresh owned baseline/candidate source snapshots,
with the exact pre-implementation commit above as the before source. Activate
only Tasks for each phase and keep quota's existing source and enabled state.
Use the same owned 100-task BENCH fixture after checking all ownership IDs and
saved revisions. Stop if it contains foreign or changed records. Do not create,
delete or edit user task data. Open a new dedicated browser, not an existing
personal session.

Follow the bounded protocol in `paired-baseline-report.md`: 1440x900, no CPU
throttling, current ten-task warm-up, at least 30 qualified Up/Down movements with
A-B-A returns, matching row/detail/title/rendered description at every presentation
opportunity, qualification ledger, and six-movement durable batches. Keep cold,
invalidation, eviction, oversize, rapid repeats, failed reads/saves and save-pending
samples separate. Profile date/CPU/style/layout in another run. Keep both plugins
enabled and record actual browser bundle URLs in both phases. Do not add nested
trace durations as independent costs.

Run native parked/closed/reopen, reveal-before-save, delayed-save tab switching,
Enter/Escape, description/title failure, task-owned comment/files and compact
layout checks. The existing BBP-50 compact host-remount issue is not fixed or
accepted by these repository tests. This slice has no adjacent preloading.

Before activation, re-read installed sources, enabled states, bundle/disk hashes
and active task state. Preserve the current Tasks source above for rollback.
Rollback, when approved, reinstalls that exact preserved source with
`bb plugin install path:... --yes --json`, not the older BBP-60 source. Stop if the
preserved source changed concurrently. Do not remove plugins, change quota,
clear settings or restart BB. Close only the browser created for this run and
remove only verified owned temporary records/resources after durable evidence is
attached. No activation or rollback command has run at this checkpoint.
