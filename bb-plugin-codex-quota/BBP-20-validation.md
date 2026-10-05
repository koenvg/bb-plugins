# BBP-20 validation record

Worker: `bbthread://thr_kt33mse6a5` · environment `env_s9rizxwxh4`.
Branch: `bb/bbp-20-30-day-calendar-token-reports-thr_kt33mse6a5`.
Fixed pre-implementation baseline: `ceb1ab8087f486a03a5193729232d0ad310436de`.
Parent: `bbthread://thr_2k7buag9sh`; only the parent owns epic integration and installed acceptance.

## Pre-review checks

All exits below are 0. Logs are owned synthetic worker evidence, not parent-independent acceptance.

| Check                                                   | Command/result                                                                                                                                                                        | Log                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Focused host/RPC/React, coverage, retention and storage | `npm test -- calendar-host.test.ts calendar-routing.test.ts calendar-app.test.tsx history-coverage.test.ts history-retention.test.ts storage-integration.test.ts`: 66 tests / 6 files | `/tmp/bbp20-focused-final.log` |
| Complete regression suite                               | `npm test`: 403 tests / 52 files                                                                                                                                                      | `/tmp/bbp20-full.log`          |
| Static types                                            | `npm run typecheck`                                                                                                                                                                   | `/tmp/bbp20-type-final.log`    |
| SDK compatibility, before builds                        | `bb plugin types bb-plugin-codex-quota --check`: package/host 0.5.29                                                                                                                  | `/tmp/bbp20-sdk-final.log`     |
| Final package build                                     | `bb plugin build bb-plugin-codex-quota`                                                                                                                                               | `/tmp/bbp20-build-final.log`   |
| Node 24.15.0 retained and new packaged proofs           | `npm run test:bundle`: nine persistent/runtime probes plus build                                                                                                                      | `/tmp/bbp20-bundle24.log`      |
| Node 22.23.3 retained and new packaged proofs           | Exact `test:bundle` Node probes, each invoked with `/Users/koen/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node` against the same built artifact                                | `/tmp/bbp20-bundle22.log`      |
| Desktop / 375px browser                                 | `uv run --with playwright python scripts/check-calendar-preview.py`: 18 state/size combinations                                                                                       | `/tmp/bbp20-browser-final.log` |
| Strict spec validation                                  | `openspec validate codex-usage-history --strict --no-interactive`                                                                                                                     | `/tmp/bbp20-openspec.log`      |
| Whitespace/integrity                                    | `git diff --check`; unchanged SDK pin, lockfile, schema and MIT notices                                                                                                               | Git / review scope             |

The nine Node probes are history; identity; import; combined live-overlap import; storage integration; new calendar; fresh OAuth; refresh OAuth; activity. The calendar proof includes persistent reopen, 12,060 accepted records / 60 entities, indexed full aggregates, bounded 50-row output, expired classes, immutable original cost/schema/control bytes, cancellation and import-only partial reporting. The older hash-pinned schema-3 artifact probe was not rerun: the artifact is not present in this worker's owned files. Schema/migration code is unchanged; the new path separately proves unsupported header/version/WAL data stays untouched.

## Acceptance matrix

- Thirty real local dates, excluding today: public host tests cover New York spring/fall DST, near-midnight UTC, Tokyo leap day and Brussels year/month boundaries. Navigation uses calendar dates, not 24-hour subtraction.
- Range retention: invalid/future/expired ranges fail closed, Previous/Next moves thirty dates, and a whole older range must fit retention. Every day/ranking/detail uses the same frozen query. Server rejects echoed wrong queries and wrong date arrays.
- SQL totals: all 12,060 accepted records contribute, including entities beyond top 50. Daily and whole-range distinct counts include hidden entities. Zero-token records can establish active entities without certifying zero interval activity.
- Coverage: persistent public-host fixtures distinguish reliable scoped inactivity from pauses, recovery gaps, uncovered dates, expired classes and scoped durable unfinished/canceled import evidence. Import-only reads need no collector asset and never confirm capture.
- Identity: verified exact threads survive deleted metadata without guessed links; ambiguous claims are excluded from exact shares. Ownership backfill and pending identity evidence fail closed. Original workspace, time, tokens and prices remain unchanged.
- Selection and privacy: public SDK routing and React tests cover selectionPending/revision, old-host immediate invalidation, pre-dispatch cancellation, disposal, late-result suppression and same-key stale results. Navigation makes no quota/activity/import/control or transcript discovery requests.
- UI: ten rankings initially, expansion at most fifty, scope Back, metrics, keyboard daily values/classes/exclusions/denominators, IANA display and unknown empty ranges. Synthetic large safe values, long workspace paths and unavailable states have no page overflow at 375px. Quota controls, official link and management remain reachable; existing app/footer regressions pass.

## Visual evidence

Early owner-inspected React images were attached to BBP-20 as `01M43FGN64RY3S1JBWXR7ZWE25` (desktop) and `01M43FGNBW56XQAKEZ655RG85S` (375px). The approved test-interface note is attachment `01M43EJHV5Z3WSH8GS86SET290`; the earlier layout/plan is retained with the task.

Final browser evidence is `/tmp/bbp20-evidence/calendar-{1280,375}-{partial,unknown,inactive,expired,stale,unavailable,loading,deleted,huge}.png`. The worker visually inspected representative desktop, narrow, huge-value and unknown images. Browser checks use isolated Chromium, controlled clocks, fake SDK/account data and localhost-only traffic. They do not use installed BB or a signed-in browser.

## Review and delivery

Exactly one fresh-context read-only generic `delegate` reviewed the complete working tree, including untracked files, against the fixed baseline. Run: `3faf7d49-b9ee-41f8-aec7-95d02982aba4`. The request-changes report is attached as `01M43JG2K96GFSFKFNJC7884QK` and saved at `/tmp/bbp20-completion-review.md`. Its two reproduced P1 blockers were accepted and fixed by this writer. There was no second review and no independent post-fix approval.

1. Established-control safety: `collector-control.ts` now provides shared `readHistoryControl` for readiness and calendar reads. Malformed, oversized or symlinked present control and missing established control fail closed. Genuine import-only storage still needs no collector assets or control. Report reads change no owned files.
2. Dormant retention: canonical `effectiveRetentionState` uses the later of saved and current `retentionCutoffs(now)`. The frozen clock drives range validation, Previous, `compactFrom` and indexed detail eligibility. Expired class payloads do not enter the SQL join. Physical cleanup can wait; logical expiry cannot. Saved high-water cutoffs prevent rollback from restoring expired detail.

Public-host regressions were red for six reproduced failures before fixes. All seven new regressions now pass, including the saved-cutoff rollback case. Logs: `/tmp/bbp20-review-red.log` and `/tmp/bbp20-review-green.log`.

Post-fix validation is complete. All checks exited 0: 82 focused tests / 8 files; 410 full tests / 52 files; typecheck; SDK --check before builds (0.5.29); targeted calendar proofs on Node 22.23.3/24.15.0; all nine retained/new packaged probes on both runtimes; 18 desktop/375px browser cases; strict non-interactive OpenSpec; and final build. Logs use `/tmp/bbp20-review-{focused,full,types,sdk,build,calendar22,calendar24,bundle22,browser,openspec}.log` plus `/tmp/bbp20-review-bundle24.log`. The final host matches the Node proof artifact SHA256: `b30e83ae4708c793ca54ef4ee0e2e689470d7d5bf91d7fa066467e6ee1040764`.

The worker inspected the final desktop, 375px partial, unknown and unavailable images after the fixes. The clean slice commit and task evidence packet are the remaining delivery steps; their receipts are recorded in the final task/thread handoff.

## Limits

No installed plugin/source switches, real transcript access, existing-session restarts, real capture pause, real host/account/Pi settings or roots, billed turns, live deletion/quarantine, push, PR or publication occurred. Synthetic owned recovery fixtures are not live actions. No monetary UI, prices or comparisons were added. Parent integration and installed/live acceptance remain unverified.
