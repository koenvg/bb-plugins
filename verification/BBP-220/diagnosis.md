# BBP-220 refresh timeout diagnosis

## Result

The fixture is sensitive to disk-sync latency, not refresh metadata lookup cost. Batch its writes in one real SQLite transaction. The controlled Linux reproduction times out before refresh completes on the old fixture and passes with the fix. No production code, timeout, rows, or assertions changed.

The historical CI job did not record disk or phase timings. Its exact runner slowdown remains unknown. These results explain a verified failure mechanism, not proof of the original runner's disk latency or CPU contention.

## Source and environment

- Task: BBP-220. Work thread: bbthread://thr_pwjtauthqw.
- Baseline: `939bd318cedb00239b73e1fd1c3d5d90c79ada70`.
- Original PR #251 head: `3004e24f0f8d8a5f206bb47071ad8d02479fe3c5`.
- The test has the same Git blob at both commits: `0fe15be51c8035db379d421df5d9dace2e0206c8`.
- Final test SHA256: `fe22ffa2abf1fb6b3283b5b37647d735755e35781ca6a020801ae3c32ef4c114`.
- Local Linux container: Debian userspace, Linux 6.18.36, aarch64, 2-CPU quota, 4 visible CPUs, 6 GB VM memory. Node 24.15.0, Bun 1.4.3, Vitest 4.1.11, SDK 0.6.37, SQLite CLI 3.40.1. Installs used frozen lockfiles.
- The GitHub runner used Ubuntu x86_64. The container is a Linux CI-equivalent check, not a hosted CI result.

## Historical evidence

[Attempt 1](https://github.com/koenvg/bb-plugins/actions/runs/38467235883/job/115537061017) failed at 23,899 ms with the configured 20,000 ms timeout. The suite passed 1,219 tests and failed this one. Total duration was 143.49 s.

[Attempt 2](https://github.com/koenvg/bb-plugins/actions/runs/38467235883/job/115544518217) passed the same test in 5,472 ms, with all 1,220 tests passing. Total duration was 143.88 s. Nearly equal suite durations do not show whether one worker had a short storage stall.

`gh run view --job` returned the latest attempt's log even for the old job ID. The failed log was therefore retrieved with `gh api repos/koenvg/bb-plugins/actions/runs/38467235883/attempts/1/logs`. The excerpts in [attempt1.log](attempt1.log) and [rerun.log](rerun.log) distinguish these attempts.

## Measured mechanism

The fake SDK opens a temporary on-disk `better-sqlite3` database. Its installed testing implementation sets `busy_timeout`, but does not change journal or sync mode. `createTask` uses its own transaction; each `upsertTaskThread` inserts in autocommit mode. The fixture makes 501 task commits and 1,503 thread-link commits before the refresh test starts.

The fix uses the existing `TasksApiStore.transaction`. Nested `createTask` transactions become savepoints. All 501 tasks and 1,503 links persist in one outer commit before RPC registration and rendering. Refresh still goes through the actual hook, contract validation, serialization, and backend reader. No database mocks or weakened durability settings were used.

Measured phases, in milliseconds:

| Run                           | Task writes | Link writes | Initial refresh | All-row assertions | Authoritative refresh | Test total |
| ----------------------------- | ----------: | ----------: | --------------: | -----------------: | --------------------: | ---------: |
| Linux isolated, old fixture   |         635 |       1,783 |             119 |                  7 |                    64 |      2,631 |
| Linux full suite, old fixture |         907 |       2,107 |             110 |                  6 |                    58 |      3,204 |
| Linux isolated, fixed fixture | 82 combined |    included |              55 |                  4 |                    55 |        206 |

The old isolated fixture spends 92% of test time on task and link writes. The initial-refresh phase includes registration, rendering, RPCs, and the assertion wait. The authoritative-refresh phase includes the click, RPCs, and assertion wait.

`strace -f -c -e trace=fsync,fdatasync` counted 8,028 successful `fsync` calls for the old test file, versus 16 with the fix. This includes schema and project setup. Strace adds overhead; its test times are not ordinary CI timings.

With `strace -f -e trace=fsync -e inject=fsync:delay_enter=2ms`, the old test spent 8,472 ms creating tasks and 25,391 ms linking threads. It failed with the unchanged 20-second timeout at 34,420 ms. Synchronous setup blocks the event loop, so the timeout is reported only after setup yields. The fixed instrumented test passed at 2,635 ms under the same injected delay. The final test, without diagnostic logging, passed at 2,692 ms under that delay.

This reproduces the timeout with successful disk-sync calls, without injecting RPC failures. It shows that per-row disk commits can consume the timeout even when metadata-sharing behavior is correct.

## Validation

Verified on the final test source in the Linux container:

- Isolated file: 3/3 tests passed. The 501-row test took 365 ms.
- Full Tasks suite: 122/122 files and 1,220/1,220 tests passed. The 501-row test took 279 ms. Suite duration was 173.37 s.
- Tasks lint: passed with 4 existing warnings and no errors.
- Tasks typecheck: passed.
- Root `bun run check`: environment setup tests, lint, and formatting passed. Root lint reported 18 existing warnings and no errors.
- Final isolated file with 2 ms disk-sync delay: 3/3 tests passed.
- `git diff --check`: passed.

Evidence: [final Linux checks](linux-final.log), [root quality checks](linux-quality.log), [final delayed-sync check](linux-final-delay.log).

Not run: hosted GitHub Linux CI on the fix, the other plugins' test matrices, browser matrices, and live plugin installation. This is a fixture-only change. Hosted CI remains a completion gate.

## Reproduction

From the baseline commit, apply [timing-baseline.patch](timing-baseline.patch) to log the old test's phases. From the fixed source, apply [timing-fixed.patch](timing-fixed.patch). These are diagnostic patches only; no timing code remains in the test.

In a Linux checkout with Node 24.15.0, Bun 1.4.3, SQLite CLI, and strace installed:

```sh
bun install --frozen-lockfile
bun install --cwd bb-plugin-tasks-plus --frozen-lockfile
bun install --cwd bb-plugin-codex-quota --frozen-lockfile
cd bb-plugin-tasks-plus
bun run test views/list/work-status-rich-refresh.test.tsx --silent=false --reporter=verbose
strace -f -c -e trace=fsync,fdatasync node node_modules/vitest/vitest.mjs run --config vitest.config.ts views/list/work-status-rich-refresh.test.tsx --silent=false --reporter=verbose
strace -f -e trace=fsync -e inject=fsync:delay_enter=2ms -o /tmp/bbp220-sync-delay.trace node node_modules/vitest/vitest.mjs run --config vitest.config.ts views/list/work-status-rich-refresh.test.tsx --silent=false --reporter=verbose
bun run test
bun run lint
bun run typecheck
cd ..
bun run check
```

On the baseline, the delayed-sync command is expected to exit 1 with a timeout. On the fix, it must exit 0 with all three tests passing. The delay is an independent diagnostic experiment, not a retry strategy or part of the normal test command.

Further logs: [old isolated](linux-before.log), [old sync counts](linux-before-strace.log), [old delayed sync](linux-before-delay.log), [old full suite](linux-full-before.log), [fixed isolated and sync counts](linux-after-strace.log), [fixed delayed sync](linux-after-delay.log). Full temporary logs were retained during the investigation; suite and historical logs here are selected excerpts. Other logs are complete apart from removed ANSI color codes.

No adjacent cleanup follow-up was identified.
