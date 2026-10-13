# BBP-198 validation

## Scope and identity

Task branch: `bb/bbp-198-preserve-tasks-benchmark-failure-evidenc-thr_pydvt2bpzn`.
Pre-implementation baseline: `6b72d1cb74bf88d0aa3f9878da5d8b6a9247bfda`.
Thread: bbthread://thr_pydvt2bpzn.

The assigned checkout initially lacked the lab files. Its empty task branch was rebased onto the specified committed lab baseline before implementation. No main-branch change was transplanted into the lab. The implementation changes only the navigation lab, its documentation, tests and these verification files.

`local-lifecycle.mjs` owns evidence and exact acquired resource handles. The existing movement protocol now lives in `local-measurement.mjs`. It saves excluded warmups before probe replacement and retains the active failed attempt. Failure capture uses the unchanged probe export and qualification ledger. Every evidence operation and resource closure has an independent outcome. Cleanup failure prevents completion and warm ranking. No recovery retry, broad deletion/kill, SDK, lockfile, dependency version or production UI change was made.

The historical measurements, NO_CHANGE decision and their saved identities are unchanged. Future harness hashes include both new executable modules. No current-run identity was attached to an old measurement.

## Initial verified checks

- Node 24.15.0 and Bun 1.4.3.
- `node --test bb-plugin-tasks-plus/scripts/navigation-benchmark/{benchmark,qualification,local-identity,local-lifecycle}.test.mjs`: 41/41 pass, including ten new public lifecycle/measurement regressions. See `node-tests.log`.
- Focused Tasks Vitest checks: six files, 39/39 pass. Actual host/backend, linked-preview invalidation, task previews and transition safeguards. Exact command in `focused-vitest.log`.
- `bun run --cwd bb-plugin-tasks-plus typecheck`: pass. See `typecheck.log`.
- `node node_modules/oxlint/bin/oxlint bb-plugin-tasks-plus/scripts/navigation-benchmark/local-*`: pass, no diagnostic output. See `lint.log`.
- Oxfmt on the three new JavaScript modules and `git diff --check`: pass.

The initial test-first checkpoint failed because the new lifecycle module did not yet exist. `red.log` retains that failure. `lifecycle-green.log` records the first eight-test checkpoint; the initial ten-test suite is in `node-tests.log`.

## Limits

The new resource regressions use deterministic acquired-handle doubles. The movement tests run the public measurement and lifecycle functions with the real unchanged browser probe, controlled animation frames and page/CDP doubles. They do not establish real browser failure frequency or installed BB acceptance.

Existing lab dependency directories were linked into this checkout for local checks. No install, lifecycle hook, native rebuild or mutation of those directories was performed. Tasks and quota SDK versions were checked as 0.6.37. The installed Vitest reports 4.1.11, which is permitted by the existing manifest range. This is local validation, not a new frozen dependency identity for historical measurements.
The two local `node_modules` links are intentional untracked validation setup, not implementation files. Do not stage them. Their targets remain unchanged.

Full Tasks/quota suites, builds, new browser benchmarks and installed/live checks were not run. BBP-68 and its task/thread links remain unchanged. No additional substantial cleanup defect was observed outside the assigned failure paths.

## Initial independent review launch failure

The single fresh read-only reviewer selected `review`, with working-tree scope from the exact baseline above. Launch failed before the child started. Run ID: `78421c8c-8f09-44e6-83e0-10d2c4edc146`.

Exact tool error:

```text
Failed to start async run '78421c8c-8f09-44e6-83e0-10d2c4edc146': Background children require the host npm package (@earendil-works/pi-coding-agent) with its dependencies; /Users/koen/.pi/agent/install/releases/1.2.0/node_modules/@earendil-works/pi-coding-agent does not provide @earendil-works/chord, @earendil-works/chord/context.
```

At this checkpoint no verdict existed and no fallback was used. BBP-198 remained `in_review`. `pending-review.patch` retains the tracked diff from that stop point. Git whitespace check passed. The operator later approved one same-protocol retry.

## Review and finding disposition

The approved retry started as `7246985d-5fff-4f51-84de-733418c04ca6`. The single fresh independent review returned `request changes` for one P2 blocker in terminal publication. Its complete report is attached to BBP-198 as `review-retry.md`, also available at `/Users/koen/.bb/pi-subagents-bridge-sessions/subagent-artifacts/outputs/7246985d-5fff-4f51-84de-733418c04ca6/review-retry.md`.

The reviewer independently passed the original 41 Node tests and confirmed cleanup isolation, raw/warmup preservation and historical identity safeguards. It reproduced missing late failure evidence and a missing persisted successful-result outcome. Prior Vitest/lint/type results were inspected or worker-reported, not independently rerun.

The parent accepted and fixed the blocker. `terminal-red.log` preserves the three failing public regressions before the fix. Completion now has one authority: the final ownership ledger. `result.json` is prepared evidence; only a completed ledger with a matching run and saved result outcome permits ranking. The warm summary is embedded in the same ledger commit. A private pending file and rename prevent a rejected ledger update from committing completion or truncating the prior ledger. Result and final ledger errors publish failure evidence. A late ledger error after prior failure adds a distinct terminal failure record without retries or overwriting saved artifacts.

## Final verified checks

- Four Node files: 45/45 pass, including fourteen new lifecycle/measurement tests. `final-node-tests.log` records exit 0.
- Local `local-*` lint and Tasks typecheck: exit 0 in `final-lint.log` and `final-typecheck.log`.
- New modules formatted with Oxfmt; final `git diff --check` passes.
- The six focused Tasks Vitest files passed 39/39 before review. Their TypeScript source did not change during the terminal-publication fix, so they were not rerun. Final changes affect the lifecycle module, its Node tests and documentation only.

The terminal regressions cover result-path rejection, latency ledger publication rejection, persisted successful-result accounting and original failure preservation after late ledger rejection. Existing closure and failed-movement safeguards remain passing. `terminal-green.log` records the thirteen-test checkpoint before the last original-failure case; `final-node-tests.log` is the final state.

The reviewer verdict remains the historical request-changes verdict. The parent resolved its sole finding and verified the final regressions. No second review pass was launched, as required by the one-pass review instructions. The changes were uncommitted at task completion. The operator subsequently requested a PR; its preparation is recorded below. Full suites/builds/browser/installed checks remain unrun. Historical measurements, BBP-68 and dependency targets remain unchanged. No additional cleanup ticket is needed for the now-fixed assigned defect.

## PR preparation

The operator requested a PR for the current task branch. The unpublished lab harness is required by the fix, so this PR includes its nine original files along with BBP-198. The already-merged preview/footer prerequisite was removed from this branch's history. No production UI, SDK, manifest or lockfile change is included in the PR.

The branch was rebased onto `origin/main` at `430f14d5e754d5b74f33ae00d060761a35bfabea`. Rebased harness commit: `55e5e11`. Rebased implementation commit: `5601fac`. The new executable modules did not change during the rebase. This is a publication baseline, not a replacement identity for any historical measured run or review.

Post-rebase checks all pass with explicit exit 0:

- 45 Node tests: `pr-node-tests.log`.
- Six focused Vitest files, 39 tests: `pr-focused-vitest.log`.
- Tasks typecheck: `pr-typecheck.log`.
- Local harness lint: `pr-lint.log`.

The original raw logs and tracked-diff checkpoint remain byte-for-byte evidence in the BBP-198 attachment `raw-evidence.tar.gz`, ID `01M4TS11H2TNF18TGJHMP3AZ0K`. They are intentionally not rewritten to satisfy Git whitespace checks or included as duplicate raw repository files. The committed final and PR logs retain the verification results. The two local dependency links and local raw evidence files are not part of the PR.

## CI correction

The operator requested correction of PR #235's failed checks. Run `38409914582` on head `4bdeebb2cf90f2e6a796eb17b255f53d27fc168d` failed formatting and the Tasks typecheck. Its Tasks tests passed; the job failure was in typecheck, not the test suite. Formatting listed the eight inherited lab source files and this report. The typecheck followed `local-ui.tsx` imports into quota source, but the Tasks matrix job had installed only Tasks dependencies.

The fix formats those exact files and installs quota's existing frozen dependencies in the Tasks job before lint. Tests and typecheck require successful lab dependency setup but still run after lint or test failure. No check, type inclusion, dependency version, manifest, lockfile, SDK or production UI source is changed. The existing GitHub Insight integration setup remains unchanged.

An isolated temporary source copy reproduced the missing quota-module errors with only Tasks dependencies available. Making the existing quota dependency directory available made the unchanged typecheck pass. Only the exact owned source copy was removed. No local package install or dependency mutation was performed. This validates dependency presence, not the remote Bun install itself.

Verified local correction checks:

- Full root `bun run check`: setup tests, lint and whole-repository formatting pass, exit 0 in `ci-local-check.log`. Existing lint warnings remain warnings.
- Full Tasks suite: 130 files, 1,300 tests pass, exit 0 in `ci-full-tasks.log`.
- Benchmark safeguards: 45 tests pass, exit 0 in `ci-node-tests.log`.
- Tasks typecheck: exit 0 in `ci-typecheck.log` and the isolated dependency-present case.
- Parsed workflow assertions verify install-before-lint ordering, setup failure/cancellation gates, unrelated matrix jobs and running checks despite lint/test failure. Exit 0 in `ci-workflow-check.log`.

Failure logs and the isolated red/green reproduction are retained without rewriting in task attachment `ci-failure-evidence.tar.gz`, ID `01M4TT3XT7DG5QJ5NT5MGSGGYV`. Earlier coverage statements remain historical; the full Tasks suite is now locally verified. No performance measurement, new installed check or second independent review was run. Formatting changes future executable hashes, not historical run identities. A new remote CI run is still required to verify the frozen integration install.
