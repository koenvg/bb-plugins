# Local production navigation harness

PRODUCTION_BASELINE: READY

The production control and separate profile completed. The supervisor accepted this gate for allocation after valid local setup and full serial suites passed. This is a local mock baseline, not installed acceptance or a candidate improvement. Independent whole-change review remains a later parent-owned gate.

## What runs

- Actual `definePluginApp` registrations captured by SDK 0.6.37's collector, actual Tasks app, `BrowseWorkspace`, fixed native Ticket, detail and Tiptap editors. No replacement navigation UI.
- Production React and ReactDOM 19.3.0 with `react-dom/client.createRoot`. A harness-only adapter implements consumed documented `PluginSdkApp` methods at `__bbPluginRuntime.pluginSdkApp`. No Testing Library renderer or `act` in the browser bundle.
- SDK fake backend host, actual Tasks API/store, temporary SQLite and RPC input/output schema validation.
- Existing fixture, probe, qualification and report helpers. A visible selected row, exact row title, detail key/title, complete normalized description and exact link must match. Nested list text is counted once. Negative tests reject wrong identity, stale content, missing description tails and hidden rows/content.
- Actual quota footer adapter and `QuotaBadge` on the existing native footer fixture with synthetic unavailable quota. No OAuth, collector or real quota polling.
- 100 tasks, canonical labels, ten warm tasks and a separate long-description task. The fixture has no comments or files. Provision task-owned files separately for file checks. Downloads and real provider/thread/PR lifecycles are not acceptance claims.

The host is a fixed layout double, not the installed BB renderer or compact drawer. Context, RPC, navigation and fixed-tab controllers keep stable identity across selections. Each accepted route is delivered in FIFO order in its own `setTimeout` task after commit microtasks. Inputs are not coalesced. Disposal revokes queued delivery. Future control/candidate runs must use identical scheduling.

The production transition guard is unchanged. Synchronous host route publication caused save-commit reentry in the first production control attempt. A focused failing test reproduced the exact error using the actual edit-session and transition modules. The corrected host passes save success, failure/origin/retry, route ordering, mount lifetime and queued-delivery disposal tests.

Imported Tasks CSS remains `app.css`; local host/theme CSS is `lab.css`, loaded second. Host styles reset native row hit-target defaults, bound the synthetic footer SVG size and preserve hidden Ticket semantics. Both CSS hashes are recorded.

## Safety and ownership

No BB CLI, installed state, real database, credentials, existing browser, notifications, dispatch or external messages are used. Each phase creates a new exclusive output directory, temporary backend database, ephemeral loopback endpoint, fresh isolated browser process/profile and context. The ledger records their identities. Browser requests outside the owned origin are aborted. Service workers are blocked and CSP limits connections. Backend mutations are denied except owned `updateTask` save cases. Unsupported SDK actions and foreign navigation throw.

Cleanup closes only owned context/browser/server/database handles. Ledgers retain exact PIDs, browser arguments/profile, endpoint and database path. Existing output directories cannot be overwritten. Keep failures and raw evidence. Do not use broad process kills or temporary-directory removal.

## Failure evidence and teardown

`local-lifecycle.mjs` owns the run directory, evidence writes and exact acquired handles. `local-measurement.mjs` uses the existing probe and qualification ledger. Each capture and closure has its own outcome in `ownership-ledger.json`. A rejected detach, close, capture or write cannot skip later owned closures. The original execution error remains the reported failure. No cleanup retry, resource search, process kill or directory deletion is performed.

Warmup movements and the warmup probe export are saved before replacing the probe. On execution failure, distinct `partial-*` artifacts retain available movements, the active attempt, raw samples, qualification and profile evidence before UI disposal. The probe drains pending observations and records interrupted samples. Missing or failed captures are explicit ledger outcomes. Successful artifacts remain exclusive and unchanged. A failed run has no committed completion and must not be ranked.

`result.json` is a prepared record, not proof of completion. The only completion commit is `ownership-ledger.json` with `status: completed`, the same run ID and a saved result-capture outcome. Its embedded `summary` is the only new warm-ranking artifact. The runner no longer creates a separate `summary.json`. Ledger updates use an owned pending file followed by rename, so a rejected write cannot publish completion or damage the previous ledger. Failed pending files remain uncommitted evidence. Terminal result or ledger errors publish failure evidence; a late ledger error after an existing failure adds `terminal-failure.json` without replacing the first failure. No operation is retried.

BBP-198 changes the executable runner identity. The archived measurements and commit bindings below remain historical evidence for the old runner. They are not rebound to these modules. No new measurement or installed acceptance is claimed.
All recorded benchmark resources are closed and their removal is independently checked. One earlier timed-out quota test did not reach SDK disposal; its temporary directory identity is not in the log. Cleanup of that unidentified test directory is not proved. No broad deletion was attempted.

## Setup and checks

Inspect package lifecycle scripts, lockfile hook declarations and installed hook bodies first. Use existing frozen locks with hooks disabled. Native SQLite addons require an inspected build before SDK storage tests. Setup restored the existing Tasks and quota addons offline against cached Node 24.15.0 headers. No dependency, lock, SDK or production source changed.

Both installed SDK versions must be exactly 0.6.37. No browser install is needed when the recorded Chromium executable is available.

```sh
# Only after inspecting the installed hooks and cached headers:
npm_config_build_from_source=true npm_config_offline=true npm --prefix bb-plugin-tasks-plus rebuild better-sqlite3 --build-from-source --offline --nodedir="$HOME/Library/Caches/node-gyp/24.15.0"
npm_config_build_from_source=true npm_config_offline=true npm --prefix bb-plugin-codex-quota rebuild better-sqlite3 --build-from-source --offline --nodedir="$HOME/Library/Caches/node-gyp/24.15.0"
node --test bb-plugin-tasks-plus/scripts/navigation-benchmark/{benchmark,qualification,local-identity,local-lifecycle}.test.mjs
npm --prefix bb-plugin-tasks-plus test -- --maxWorkers=1 scripts/navigation-benchmark/local-host.test.tsx scripts/navigation-benchmark/local-backend.test.ts shell/preview-invalidation.integration.test.tsx shell/task-previews.test.ts views/detail/safe-transition.test.ts views/detail/transitions.test.tsx
npm --prefix bb-plugin-codex-quota test -- --maxWorkers=1 src/footer/footer-work-isolation.test.ts
npm --prefix bb-plugin-tasks-plus run typecheck
node bb-plugin-tasks-plus/node_modules/oxlint/bin/oxlint bb-plugin-tasks-plus/scripts/navigation-benchmark/local-*
```

The full serial Tasks suite passed 127 files/1268 tests. The initial quota suite failed six routing tests with its native addon absent. That failure remains. After the supervisor authorized inspection and offline restoration of only the existing addon, the unchanged routing file passed 7/7 once and the full serial quota suite passed 73 files/776 tests. The swallowed original exception is not logged; do not label it captured proof or a quota source regression.

## Production protocol

Run phases serially with fresh absolute owned paths. Stop on setup/runtime/protocol failure, preserve evidence and obtain same-protocol recovery authority.

```sh
node bb-plugin-tasks-plus/scripts/navigation-benchmark/local-harness.mjs preview /ABSOLUTE/OWNED/NEW-preview
# Inspect early-ui.png before measuring.
node bb-plugin-tasks-plus/scripts/navigation-benchmark/local-harness.mjs latency /ABSOLUTE/OWNED/NEW-control
node bb-plugin-tasks-plus/scripts/navigation-benchmark/local-harness.mjs profile /ABSOLUTE/OWNED/NEW-profile
```

The minified production build records its esbuild graph. Gates require production React/ReactDOM inputs, exclude development/testing renderer inputs, check runtime production metadata and compare browser-loaded JS bytes with disk. Every run records source/dirty state, source and executable-harness hashes, SDK versions, fixture/JS/CSS hashes, browser/executable, UTC, 1440x900 and no CPU throttling.

Latency excludes 18 observed warmups and retains 36 warm movements only when the destination is current before and after with no interval invalidation. Exact content is checked again at the second frame. Cold BENCH-80, failed cold BENCH-99/retry, invalidation, delayed title save, failed-save origin/draft/retry and long-description presentation remain separate. Cold click timings include driver polling; saves use wall-clock observation. Neither is a warm percentile.

Profiling is a fresh separate phase with the same build/fixture/configuration. It retains CPU samples, timeline events and date work. Do not add nested trace durations or use profiled latency as the control percentile.

## Preserved evidence

Production archive: `/Users/koen/.bb/verification/tasks-navigation-lab-thr_rsrnshzk3z/production-harness-20261011-recovery`.

- `preview-01` exposed an oversized synthetic footer SVG. `preview-02` corrected its host-only size; its screenshot was inspected before control measurement.
- `control-latency-01` failed during save-wait transition reentry. Its 36 qualified warm movements are incomplete-run evidence only. Keep its failure, screenshot, DOM, logs and ledger.
- `route-regression-red.log` reproduces the reentry. Final passing coverage is in `route-regression-green-03.log` and `focused-final.log`.
- `control-latency-02` completed 36 warm movements: median 45.30ms, p95 46.80ms, worst 46.90ms and blank interval 0. No retained long tasks or browser console errors.
- `control-profile-01` completed separately with identical source, executable harness, bundle, CSS and fixture hashes. Profile-only date work was 2572 calls/47.20ms.
- `quota-full.log` preserves the initial six routing failures. `quota-sqlite-rebuild.log`, `quota-routing-valid-setup.log` and `quota-full-valid-setup.log` record authorized setup recovery and unchanged passing tests.
- `handoff-identities.json` and `harness-current.patch` preserve the pre-recovery checkpoint. Final commit binding records the unchanged measured executable-harness hash.

Earlier development diagnostics and failures remain in `/Users/koen/.bb/verification/tasks-navigation-lab-thr_rsrnshzk3z/harness-20261011`. They cannot rank candidates and must not be compared with this production mock or installed results. Independent completion review and live acceptance remain parent-owned gates.

LAB_STATUS: READY
