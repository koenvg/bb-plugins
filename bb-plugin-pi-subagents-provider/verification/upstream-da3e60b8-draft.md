# Upstream da3e60b8 draft reconciliation

Koen's goal is a package-only upstream reconciliation for review. This draft is inactive. Independent review is blocked by this run's no-delegation permission. It is not ready and does not advance incorporation.

## Fixed inputs

- Fork main is [760580f7eb170c8c6bdc832298ad7d2a20a4bf9e](https://github.com/koenvg/bb-plugins/commit/760580f7eb170c8c6bdc832298ad7d2a20a4bf9e).
- Incorporated base remains [fdd3de3b19b97e6cd1ef7300cbb54711431249d3](https://github.com/get-bb/bb/commit/fdd3de3b19b97e6cd1ef7300cbb54711431249d3).
- Draft target and proposed future baseline are [da3e60b81d560e114a2bec724bb59c997aaaae7f](https://github.com/get-bb/bb/commit/da3e60b81d560e114a2bec724bb59c997aaaae7f).
- Prior reviewed target is [e61446e15a0bb3e6df551e45c3aba5c5187ffad3](https://github.com/get-bb/bb/commit/e61446e15a0bb3e6df551e45c3aba5c5187ffad3). It was not the incorporated base.

GitHub commit APIs resolved both remote main revisions. Committed archives were extracted outside source checkouts. GitHub comparison confirms the incorporated base and prior reviewed target are ancestors. The target is 1,640 commits ahead of the incorporated base and 109 ahead of prior review.

## Package merge evidence

The temporary synthetic history maps both upstream package roots to the fork package root. Ours retains every fork-only file. The full incorporated-to-target delta has 50 paths, no detected renames and 43 raw conflicts, including one retained modify/delete regression. Seven paths merge cleanly and are unchanged from ours.

The [previous path accounting](upstream-e61446e1-draft.md) is historical evidence, not a reason to skip work. Current main contains [PR #393's squash commit](https://github.com/koenvg/bb-plugins/commit/29ea2399012fc0dce3c3d6789f3235cf9387a4a3). Its package is byte-identical to the previously published d77d6e6a candidate. The 15 later fork paths from PR #396 do not intersect any of the 50 upstream paths. This establishes that the earlier resolutions are present on actual main.

Current upstream differs from that reviewed upstream package only in package.json and four explicit void markers in rpc-session.ts. The markers are ported. They do not change queue or settlement behavior. The new monorepo-only lint script is intentionally excluded, not silently omitted.

After explicit resolutions, the synthetic staged code delta is exactly the same four-line port as this worktree. No merge markers or unmerged index entries enter project source. Preparation made no project merge, rebase or commit. Koen's later PR request authorizes publication of this draft.

Evidence is in `/tmp/pi-provider-rebase-thr_t9mif772j4.ap0fDh`. It includes merge-package.sh, committed archives, upstream-paths.tsv, raw-conflicts.txt, merge.log, merged-pr393-equivalence.diff, fork-since-reviewed-package.txt, overlap.txt and provider-since-previous.diff. The temporary synthetic index records resolutions without a merge commit.

## Provider path decisions

Each path is package-relative. Raw conflict describes the initial synthetic merge, not an unresolved draft file. Existing main behavior is retained where the prior reviewed adaptation is already present.

- `README.md`. Upstream M. Raw conflict yes. Keep standalone installation, identity, and safety limits; document current pins and installation-source detection.
- `app.test.tsx`. Upstream M. Raw conflict yes. Keep public-hook, long-title, submission-lock, and fork panel assertions instead of private QuestionForm tests.
- `app.tsx`. Upstream M. Raw conflict yes. Retain the public question-host adapter and package-owned controls. Upstream private UI is intentionally not imported.
- `package.json`. Upstream M. Raw conflict yes. Keep standalone identity, exact pins, engine ranges, runtime alias, TypeScript 5.9.3 and bb.skills=[]. Skip upstream's root-relative lint:type-aware script, private workspace dependencies, tsrs and prepare:bundled. Existing root lint and package typecheck remain authoritative.
- `server.test.ts`. Upstream M. Raw conflict yes. Retain pi-subagents provider identity and fork registration assertions.
- `src/bridge/bb-pi-extension.ts`. Upstream M. Raw conflict yes. Retain the current-main implementation and regressions with public runtime SDK alias and fork identity where required.
- `src/bridge/bridge-channel.test.ts`. Upstream A. Raw conflict yes. Retain the current-main implementation and regressions with public runtime SDK alias and fork identity where required.
- `src/bridge/bridge-channel.ts`. Upstream A. Raw conflict yes. Retain the current-main implementation and regressions with public runtime SDK alias and fork identity where required.
- `src/bridge/bridge.install-gate.test.ts`. Upstream M. Raw conflict yes. Retain the current-main implementation and regressions with public runtime SDK alias and fork identity where required.
- `src/bridge/bridge.interruption-recovery.test.ts`. Upstream A. Raw conflict yes. Retain stronger fork recovery coverage; retain structured errorInfo assertions.
- `src/bridge/bridge.launchers.test.ts`. Upstream A. Raw conflict yes. Retain the current-main implementation and regressions with public runtime SDK alias and fork identity where required.
- `src/bridge/bridge.lifecycle.test.ts`. Upstream M. Raw conflict yes. Keep existing lifecycle regressions and owned teardown; new transport has dedicated launch/context regressions.
- `src/bridge/bridge.manual-compaction-queue.test.ts`. Upstream A. Raw conflict yes. Retain the port on current main, including release and race behavior. Retain assertions.
- `src/bridge/bridge.model-resolution.test.ts`. Upstream A. Raw conflict no. Retain the port on current main. Retain exact host model-resolution assertions.
- `src/bridge/bridge.relocation.test.ts`. Upstream A. Raw conflict yes. Retain the current-main implementation and regressions with public runtime SDK alias and fork identity where required.
- `src/bridge/bridge.round2.test.ts`. Upstream M. Raw conflict yes. Keep fork tests and explicit command/speed boundaries. No missing runtime behavior after reconciliation.
- `src/bridge/bridge.ts`. Upstream M. Raw conflict yes. Keep observation/capture/native-turn owners and private speed-command handling. Upstream main-turn logic already present.
- `src/bridge/catalog.test.ts`. Upstream M. Raw conflict yes. Retain current catalog refresh, inherited-manifest, scope, and speed regressions.
- `src/bridge/catalog.ts`. Upstream M. Raw conflict yes. Use the fork's extracted PiSessionChannel for equivalent readiness/correlation/timeout behavior; retain account-confirmed speed discovery.
- `src/bridge/extension-ui-coordinator.test.ts`. Upstream A. Raw conflict yes. Equivalent coordinator tests already present. Retain fork scope assertions.
- `src/bridge/extension-ui.ts`. Upstream M. Raw conflict yes. Equivalent after formatting/import-path normalization. Keep public runtime SDK alias.
- `src/bridge/fake-pi-rpc.mjs`. Upstream M. Raw conflict yes. Retain the current-main implementation and regressions with public runtime SDK alias and fork identity where required.
- `src/bridge/npm-shim.test-support.ts`. Upstream A. Raw conflict yes. Retain the current-main implementation and regressions with public runtime SDK alias and fork identity where required.
- `src/bridge/pi-managed-install.test-support.ts`. Upstream A. Raw conflict yes. Retain the current-main implementation and regressions with public runtime SDK alias and fork identity where required.
- `src/bridge/pi-managed-install.ts`. Upstream A. Raw conflict yes. Retain the current-main implementation and regressions with public runtime SDK alias and fork identity where required.
- `src/bridge/provider-maintenance.bun.test.ts`. Upstream M. Raw conflict yes. Retain the current-main implementation and regressions with public runtime SDK alias and fork identity where required.
- `src/bridge/provider-maintenance.install-source.test.ts`. Upstream A. Raw conflict yes. Retain the current-main implementation and regressions with public runtime SDK alias and fork identity where required.
- `src/bridge/provider-maintenance.ts`. Upstream M. Raw conflict yes. Retain the current-main implementation and regressions with public runtime SDK alias and fork identity where required.
- `src/bridge/provider-maintenance.version.test.ts`. Upstream A. Raw conflict yes. Retain the current-main implementation and regressions with public runtime SDK alias and fork identity where required.
- `src/bridge/rpc-child.extension-ui.test.ts`. Upstream D. Raw conflict yes. Reject upstream deletion. Keep cancellation/forwarding regressions against the new socket-backed child.
- `src/bridge/rpc-child.ts`. Upstream M. Raw conflict yes. Retain the implementation on current fork main for portable spawn/kill and authenticated socket transport. Retain the fork's live-child teardown registry.
- `src/bridge/rpc-session.extension-ui.test.ts`. Upstream M. Raw conflict yes. Retain the current-main implementation and regressions with public runtime SDK alias and fork identity where required.
- `src/bridge/rpc-session.settlement.test.ts`. Upstream A. Raw conflict yes. Retain stronger real-Pi settlement/correlation guards; retain adapted transport mocks and structured error assertions.
- `src/bridge/rpc-session.ts`. Upstream M. Raw conflict yes. Apply all four new upstream void markers to intentionally unawaited delivery calls. Retain the tracked manual-compaction delivery promise and fork-extracted channel/input/launch owners, run-local settlement, speed validation and native observer accounting.
- `src/bridge/run-settlement.test.ts`. Upstream A. Raw conflict yes. Retain equivalent helper coverage and pinned Pi 1.1.0 aborted-event typing.
- `src/bridge/run-settlement.ts`. Upstream A. Raw conflict no. Equivalent helper already present.
- `src/bridge/session-cwd.test.ts`. Upstream A. Raw conflict yes. Equivalent relocation/invalid-header assertions already present.
- `src/bridge/session-cwd.ts`. Upstream A. Raw conflict yes. Equivalent after formatting normalization. Session root policy is unchanged.
- `src/bridge/test-support.ts`. Upstream M. Raw conflict yes. Retain fork fixture identity, process cleanup, speed and observation helpers. Transport regression support now uses sockets.
- `src/bridge/turn-input.test.ts`. Upstream M. Raw conflict yes. Retain the current-main implementation and regressions with public runtime SDK alias and fork identity where required.
- `src/bridge/turn-input.ts`. Upstream M. Raw conflict yes. Retain the current-main implementation and regressions with public runtime SDK alias and fork identity where required.
- `src/delta-translation.errors.test.ts`. Upstream A. Raw conflict yes. Retain the current-main implementation and regressions with public runtime SDK alias and fork identity where required.
- `src/delta-translation.test.ts`. Upstream M. Raw conflict yes. Retain the implementation on current fork main for retry/steer stream separation and errorInfo expectations; retain fork tool/history tests and add thread/parent/reset isolation.
- `src/delta-translation.ts`. Upstream M. Raw conflict yes. Retain the implementation on current fork main for failed-stream closure and all errorInfo sites; retain bounded tool bookkeeping and extracted pi-tool-shapes.
- `src/extension-ui-contract.ts`. Upstream M. Raw conflict no. Equivalent full-title contract, apart from the required fork-qualified extension kind.
- `src/image-read.test.ts`. Upstream A. Raw conflict no. Equivalent tests already present in current main.
- `src/model-list.ts`. Upstream M. Raw conflict yes. Keep the fork's account-confirmed Default/Fast narrowing. Other model behavior is equivalent after normalization.
- `src/native-roots.test.ts`. Upstream M. Raw conflict no. Equivalent recursive/ancestor-aware tests already present.
- `src/native-roots.ts`. Upstream M. Raw conflict no. Equivalent after formatting/import-path normalization.
- `src/session-params.ts`. Upstream M. Raw conflict no. Equivalent base parameters plus intentional captured service-tier state required by fork speed guards.

## Watched contracts

The full baseline inventory is full-watched-stat.txt. New-contracts.diff and new-contract-manifests.diff retain the post-review contract delta. Earlier contract conclusions are carried forward only where the committed archives establish no newer change.

- `plugins/provider-pi`. All 50 paths are accounted for above. Launcher replacement remains adapted through public portable-process helpers.
- `packages/plugin-sdk`. Public process, bridge, host and question APIs remain available at pinned 0.6.132. Upstream moves from 0.6.133 to 0.6.144. New header-row, header-title, hidden-navigation and custom panel-title APIs are additive and unused here. Setup failure detail is explicitly private. JSON-RPC result normalization keeps strict JSON validation while changing internal path construction. API-index tooling and harness registrations remain SDK-owned.
- `packages/provider-bridge-protocol`. New changes are the monorepo lint script and recording row counts. Previously reviewed protocol 2, grammar v3, optional cache TTL, background ownership and command contracts remain. No protocol source is copied.
- `packages/domain`. New provider-cli-install-jobs host notification, CPU-priority and WAL-checkpoint experiments, retired narrowPluginCss experiment and SDK version constant remain core policy. Default/Fast narrowing and captured model provenance remain local.
- `packages/agent-runtime`. Followed lifecycle ownership into runtime-provider-process.ts and runtime-turn-state.ts. New clearStaleTurn preserves a newer active turn when an older steer returns stale. The new regression checks exactly that interleaving. CPU priority applies to the managed provider process. Neither is plugin logic to copy.
- `packages/host-daemon-contract`. Protocol rises from 264 to 265. Session and policy replacement carry agentCpuPriority. STALE_TURN_ERROR_CODE is host transport vocabulary. The plugin continues to use the public provider bridge protocol, not host-daemon internals.
- `apps/host-daemon/src/runtime-manager.ts`. Unchanged since prior review. Existing idle release, maintenance retirement and open-work behavior remain host-owned. No retention claim follows.
- `apps/host-daemon/src/runtime-manager.test.ts`. Unchanged since prior review. Existing busy-maintenance and background-work fixtures do not replace installed idle/recovery acceptance.
- `packages/plugin-build`. Only the monorepo lint script is new since prior review. Existing SDK runtime placement, Zod handling and artifact metadata do not justify deleting the runtime alias or repinning.
- `packages/plugin-registry/flavors/components/ui/question-form-host.tsx`. Unchanged since prior review. Keep the public question-host hook and owned controls, not private UI imports.
- `packages/shared-ui/src/components/ui/button.tsx`. Unchanged from incorporated base. Keep the package-owned button.
- `apps/cli/src/commands/plugin.ts`. New saved-version-range upgrade advice and explicit --range confirmation remain CLI-owned. No install, update, range change or migration is run.
- `docs/provider-bridge-protocol.md`. Unchanged since prior review. Checked relevant capability, main-run, delivery, cache and background ownership descriptions against provider code. Pi still uses independent native background rows, not Claude-style held main turns.
- `docs/provider-plugin-api.md`. Unchanged since prior review. Public registration, environment forwarding, native roots, provider metadata and session/model contracts remain compatible with the retained provider.

Directly relevant external owners were followed into packages/process-utils/src/workload-priority.ts, host-daemon app.ts and server-connection.ts for CPU policy, and host-daemon command-handlers/thread.ts for stale-steer routing. CPU priority defaults off and is set by the host. No setting or scheduling code is added to this plugin.

## Safeguards and recommendations

All existing identities, upstream and Pi MIT notices, isolated roots and BB_PI_SUBAGENTS_BRIDGE_SESSION_DIR remain. Native observation, capture, lifecycle, bounded history, request/session/generation correlation, guarded child-model evidence, private commands, Codex entitlement and final-payload checks, public SDK imports, production runtime alias and all exact pins remain.

PR #396's separation of observed needs-attention activity from execution status is untouched, including native lifecycle counting, schema bounds and viewer regressions.

The prior sdk-process-packaging recommendation is now satisfied on current fork main by merged PR #393, matching production pins and passing baseline production coverage. That is a current-main finding, not resolution by this unmerged draft. The installed-lifecycle recommendation stays open. Historical limited live smoke does not prove full idle deadline and sweep, manual compaction or reload/resume recovery. BBP-201 remains an accepted execution-input ambiguity.

No workaround is removed. Private imports, upstream identity replacement, dependency and engine changes, monorepo compiler/build policy, test deletion and the root-relative type-aware lint script remain intentional exclusions. No incompatible provider behavior is silently deferred.

## Validation and limits

Locked setup and SDK audit pass on Bun 1.4.4, Node 26.12.1, BB 0.49.0 and SDK/runtime alias 0.6.132. Baseline root checks, package tests and package typecheck each exit 0. Baseline package tests pass 1,202 tests in 92 files, with five Windows-only skips. The focused post-port settlement, interruption and compaction suites pass 58 tests.

Final source checks and three-artifact build results are retained in this run's report. They are separate from installed acceptance.

The configured Playwright Chromium build 1248 is absent. Older cached builds exist, but this package configuration has no supported executable selector. No browser is downloaded and no configuration is changed to bypass the missing prerequisite. The owned browser fixture remains blocked.

Independent implementation and decision-trail review remain blocked by the explicit no-delegation restriction. There are no unresolved executable merge files. Required review and browser proof remain unmet, so the candidate remains a draft and the successful-review checkpoint is unchanged.

The existing .github/workflows/pi-compatibility.yml remains unchanged. Publication can trigger its existing pull-request checks. No manual dispatch, plugin installation, activation, reload or issue creation is part of this draft.

## Owned draft

Environment env_ynqt3hya2s is BB-managed instance thr_t9mif772j4-1. The worktree is `/Users/koen/.bb/plugins/environment-git-worktree/host-data/worktrees/thr_t9mif772j4-1/bb-plugins`, branch `bb/weekly-pi-provider-package-rebase-thr_t9mif772j4`. Initial HEAD is the fork input above. Publication commits the draft separately. The reference checkout and prior candidates are preserved.
