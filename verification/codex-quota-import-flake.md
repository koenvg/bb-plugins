# Codex Quota import timeout investigation

## Scope

Fix branch based on `e0132eaf1033ae745458ba5b94dea54c0acfe212`, separate from the archived OpenSpec branch. No installed-plugin or live-account changes.

Reported failure: [PR #281](https://github.com/koenvg/bb-plugins/pull/281), [attempt 1, job 116861453669](https://github.com/koenvg/bb-plugins/actions/runs/38866819340/job/116861453669). The calendar test `uses durable unfinished and canceled import evidence to prevent a false scoped zero` timed out after 5,130 ms against Vitest's 5,000 ms limit. The file took 14,822 ms; 975 other tests passed. [Attempt 2, job 116938707752](https://github.com/koenvg/bb-plugins/actions/runs/38866819340/job/116938707752) passed without a fix.

## Confirmed findings

- The failing test closes its setup connection before entering the host RPCs. Host history serializes operations, import callers wait for database cleanup, and import operations close SQLite in `finally`. There is no background import to await: each start/resume runs one bounded cycle. Cancellation is explicit and the header loop yields with `setImmediate` between candidates.
- Start discovers all 50 missing provider identities and leaves the generation stopped in the header phase. Resume checks the first 32 candidates, the production header-cycle limit. Each missing source previously wrote an omission diagnostic, marked the candidate omitted, and updated the byte counter even though no bytes were read.
- Instrumentation around the real `node:sqlite` adapter measured **96 standalone UPDATEs and 64 durable commits** in that resume cycle. A separate read-only connection's `PRAGMA data_version` observed committed changes. SQLite elides the unchanged byte-counter update, so statement count alone overstates the disk work. The database uses DELETE rollback journaling and FULL synchronous mode, not WAL.
- The fix commits the diagnostic and candidate state together, with no transaction spanning source I/O or cancellation yields. It skips an unchanged header byte counter. The same cycle now makes **64 UPDATEs in 32 transactions**, with no standalone updates. Real durable commits fall from 64 to 32.
- An event-loop cancellation scheduled during the first candidate runs at the existing yield. Exactly one candidate is omitted; 49 remain pending. The interruption diagnostic is a separate commit, so this path has two durable commits after the fix. Progress and omission counts survive close/reopen, and an explicit cancel leaves already committed evidence intact.

## Reproduction and limits

Eight unmodified targeted baseline runs passed locally. The original CI failure was not reproduced on the local filesystem without fault injection. CI used Ubuntu 24.04.5, Node 24.15.0 and Bun 1.4.3 with one Vitest worker. The failed file was not competing with other package test files inside that worker. The successful rerun's file took 15,213 ms and its full suite was slower than attempt 1, so whole-file or whole-suite time does not establish the failing stage.

A controlled experiment charged **85 ms only when the observer connection detected a real durable commit**. The old header cycle exceeded the unchanged 5,000 ms test timeout; the fixed cycle completed in **2,896 ms**, observing 32 durable commits. The cancellation variant completed in 182 ms with two commits. This confirms commit amplification can produce the timeout without a stuck promise, lock leak or cancellation race. The original runner has no per-stage timings, syscall trace, or disk/CPU telemetry. Its precise latency source and timeout stage remain unproved. Runner scheduling, filesystem latency and storage contention are possible contributors, not established facts.

An earlier experiment charged every standalone statement at 55 ms. It also timed out before the fix, but that model incorrectly charged unchanged UPDATEs. It is superseded by the commit-observed experiment above.

To repeat the controlled experiment, temporarily add the following immediately after `durableCommits++` in the new regression's `observeCommit` callback, then run its non-cancellation case against the old and fixed production implementations:

```ts
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 85);
```

```sh
CI=1 bun run --cwd bb-plugin-codex-quota test \
  src/history/import/import-header.test.ts -t 'cancellation=false' --reporter=verbose
```

The final regression has no injected delay, environment switch, timing assertion, retry, or timeout change. It asserts actual committed changes and bounded progress instead. The original calendar fixture and all its 50 identities, coverage assertions, cancellation checks and persistence checks are unchanged.

## Validation

Local runtime: macOS, Node 24.15.0, Bun 1.4.3. Frozen package install succeeded. All commands below exited zero unless explicitly described as red experiments.

| Check                                | Result                                                                                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regression before fix                | Both cases fail the commit-budget assertions; normal cycle observes 64 durable commits                                                                                                                                |
| Commit-latency injection before fix  | Expected failure: 5,000 ms timeout                                                                                                                                                                                    |
| Same injection after fix             | Both cases pass; 32 and 2 durable commits                                                                                                                                                                             |
| Repeated calendar file + regression  | 40 independent invocations, 28 tests each, all pass. First 30 used the initial transaction-count regression; final 10 also assert observer-measured durable commits. Original flaky test: 57–260 ms across those runs |
| Full package suite, first run        | 90 files, 1,006 tests pass, 69.88 seconds                                                                                                                                                                             |
| Full package suite, final run        | 90 files, 1,006 tests pass, 108.32 seconds                                                                                                                                                                            |
| Typecheck                            | Pass                                                                                                                                                                                                                  |
| Package lint and format check        | Pass                                                                                                                                                                                                                  |
| Official `bb plugin build`           | Pass                                                                                                                                                                                                                  |
| Packaged import fixture              | Pass                                                                                                                                                                                                                  |
| Packaged import live-overlap fixture | Pass; synthetic data only                                                                                                                                                                                             |
| Packaged calendar fixture            | Pass                                                                                                                                                                                                                  |
| Owned browser fixture                | 212 tests pass; synthetic RPC/host inputs only                                                                                                                                                                        |
| Cleanup                              | SQLite fixtures close/reopen and remove their temporary roots. Browser runner exited; its recorded port 56254 has no listener and its temporary cache root is absent                                                  |
| Installed/live acceptance            | Not run, as requested; not inferred from fixtures                                                                                                                                                                     |

The first long validation shell reached its outer command deadline after the full suite and 15 successful repetitions. No test timeout occurred. No task-owned test process remained. The remaining repetitions ran in a separate bounded command and completed normally.

## Evidence

Private, durable thread storage: `quota-flake-20261016-130348-26168` under thread `thr_nr2g76nb3g`. It retains original Actions logs, red/green regression logs, injected-latency logs, all 40 JSON repetition reports and exit codes, full-suite/check/build logs, packaged-fixture logs, and browser HTML/JSON/traces. No account data was collected.

Key files:

- `attempt1.log`, `attempt2.log`
- `commit-observed-red.log`, `commit-delayed-red.log`, `commit-delayed-green.log`
- `commit-observed-import-header.test.ts`, the diagnostic source snapshot before instrumentation removal
- `repeat-exits.txt`, `repeat-1.json` through `repeat-40.json`
- `full-tests-1.log`, `full-tests-2.log`, `final-targeted.log`
- `final-typecheck.log`, `final-lint.log`, `final-format.log`, `build.log`
- `bundled-import.log`, `bundled-overlap.log`, `bundled-calendar.log`
- `browser/results.json`, `browser/html/index.html`, `browser/exit-code.txt`

Independent routine review approved the final source change with no findings. The reviewer independently passed 55 calendar/import tests and typecheck, confirmed the original calendar test is unchanged, checked all 14 evidence/artifact hashes, and confirmed browser cleanup. The full report is retained as `independent-review.md` in the same thread evidence directory. Review approval is not live acceptance or merge approval.
