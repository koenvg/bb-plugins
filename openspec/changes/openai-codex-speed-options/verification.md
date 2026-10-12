# Delivery and verification

The BB implementation is present in `bb-plugin-pi-subagents-provider`. Acceptance and deployment remain incomplete. No package was installed or published, and no credential or live model request was used.

## Project ownership

- Standalone Pi delivery belongs to **pi-plugins**, thread @thread:thr_uie72ut9a8, branch `bb/openai-codex-speed-options-for-standalone-pi-thr_uie72ut9a8`. That owner reports 45 package tests, 42 baseline tests, both typechecks, and independent review complete. Token-audit is unchanged. Changes remain uncommitted.
- BB adapter delivery belongs to **bb-plugins**, thread @thread:thr_wmheh36xv4. Baseline: `d0f28467b0975ce36b859e26eb2229316b1530b3`. Branch: `bb/add-fast-and-ultrafast-options-for-openai-models-thr_wmheh36xv4`. The BB changes are prepared on this branch for a pull request; installation and live acceptance remain separate.
- BB core and bundled Pi have no implementation changes. No provider default, provider enabled state, credentials, or existing history was changed.

## BB implementation

The fork embeds reviewed `@koenvg/pi-openai-codex-speed@0.1.0` from its own versioned archive. SHA-256: `1642307063bd2867eb26e94853fd6906bc135c33161243de953012864b4718ff`. Runtime needs no sibling pi-plugins checkout or development package.

Native model metadata explicitly narrows every model's tiers. Fast-only, both-tier presentation, no-tier, failed discovery, scoped/selected-only models, other routes, and account changes have fixture coverage. Fast maps to verified `priority`. Ultrafast remains unavailable because its wire mapping is unverified.

The running Pi child restores and validates the saved speed before prompt, steer, and queued follow-up dispatch. Default stays usable when discovery fails. Unsupported selections block native prompt dispatch. Resume, account change, and non-Codex behavior have bridge coverage. Model and reasoning selection remain separate. Child sessions keep their existing settings.

`/speed refresh` uses the private channel, including during steering. It creates no model prompt and cannot settle a model run that starts during discovery. The BB generator specializes only the shared `SpeedError` constructor's recovery message. Private replies, native provider errors, and run settlement now use the same native-selector instructions before Pi converts errors into strings. The archive, standalone package, guard logic, and unrelated provider errors stay unchanged.

## Settled local checks

| Check                                             | Result                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| Full provider tests                               | Pass: 53 files, 533 tests                                                |
| Typecheck                                         | Pass                                                                     |
| Generated shared-source check                     | Pass                                                                     |
| Public import and production-only packaging tests | Pass within the pinned test environment                                  |
| Whitespace diff check                             | Pass                                                                     |
| Strict OpenSpec validation                        | Pass                                                                     |
| Current-host read-only SDK check                  | Pass after migration: SDK 0.6.37 on BB 0.46.0                            |
| Standalone build                                  | Pass after migration on BB 0.46.0                                        |
| Upstream compatibility checker                    | Inconclusive, exit 1: upstream response bound exhausted at tree coverage |

The approved compatibility migration targets BB 0.46.x, SDK 0.6.37, and build tooling 0.46.0. The current-host SDK gate, standalone build, and production-only packaging pass. [BBP-197](bbtask://BBP-197) is attached to this thread. See [the all-plugin migration report](../../../BB-0.46-COMPATIBILITY.md). The old SDK failure remains recorded as initial delivery evidence; no diagnostic exception applies. These gates preceded the separately authorized live/installed acceptance below.

The upstream check compared baseline `fdd3de3b19b97e6cd1ef7300cbb54711431249d3` with upstream head `3912f4aaefb7dff55c7e0cb5003b26b5cf1457dc`, but stopped before complete tree coverage. This does not establish compatibility or a code defect. No upstream source or provenance revision was changed.

## Independent review

The initial speed implementation received one fresh read-only delegate review using the strict `review` skill against the baseline and all relevant untracked files. It independently reran 530 pre-fix tests and local checks. Its original verdict was request changes.

Both initial findings were accepted:

1. A delayed idle refresh could settle a newly active model run. A processing-generation check now runs at the bridge settlement boundary. A paused-discovery/concurrent-Default-turn regression fails on the old behavior and passes after the fix.
2. Shared speed errors suggested the unavailable `/speed default` command. The initial fix covered private-channel errors and its regression. The migration review later found the same defect in late native payload-guard errors; the final BB recovery profile covers both paths.

The approved all-plugin SDK migration then received one fresh strict review of the complete working tree. Its verdict was request changes for the reproduced late native error message; it found no SDK or native sidebar-action structural blocker. The parent fixed the error-constructor message in BB generation, not the shared archive or guard logic. A regression fails before the fix and passes afterward through real Pi 1.1.0 native streaming, BB translation, and failed-turn settlement, with zero network dispatch. Another regression preserves unrelated provider errors. Final Pi results are 53 files / 533 tests, including production-only packaging; all affected checks pass. Neither original verdict was relabeled as approval, and no follow-up review was launched. No additional cleanup finding was reported.

## Host execution-intent prerequisite

The fresh rebase review returned request changes: BB 0.46.0 marks all execution fields explicit after any execution edit. Failed discovery narrows displayed Fast to Default; changing only reasoning then silently replaces saved Fast. [BBP-201](bbtask://BBP-201) records this demonstrated defect. Rebase validation passed 5,211 tests, but did not establish this safeguard.

The authorized BB core fix is isolated in `/tmp/bb-core-speed-intent-wmheh36xv4`, branch `fix/codex-speed-execution-intent-thr-wmheh36xv4`, local commit `348c46e3af627a6a49d062d5f10bc9741869b6b8`. Each field now uses its own touched state. Explicit choices remain observable even when the displayed value does not change. Public hook regressions fail before the fix for revoked and failed discovery and pass afterward. Server regression coverage preserves inherited Fast and accepts explicit Default. Adapter regressions change reasoning on restored Fast, reject unconfirmed Fast with zero additional prompt dispatch, then accept explicit Default recovery.

The new host scope received one fresh deep read-only review. Its verdict was block: the primary composer was sound, but `EmbeddedThreadChat` dropped source metadata. The parent fixed the shared embedded request fields used by send, queue, programmatic submission, and steer, while preserving explicit snapshot permissions. Embedded boundary tests failed before propagation and pass afterward; explicit Default with combined edits remains usable. Hook regressions also check that a thread reset clears touched state. Final targeted composer tests: 64 passed. These embedded tests stub the public hook result; the actual hook and server inheritance are covered in separate boundary suites. No browser/live full-path failure test is claimed. The original review remains block, and no follow-up review was launched; the fix is parent-verified, not independently approved.

Local validation: 5,712 app tests passed (6 skipped), 27 affected server tests passed, 533 adapter tests passed, both host typechecks and builds passed, and app lint passed with non-failing warnings. No core installation, reload, live request, or publication was authorized or performed. The installed BB 0.46.0 remains affected. The host fix must ship and receive installed verification before this feature is ready to merge or deploy. Earlier request-changes verdicts are unchanged.

Authorized installed acceptance before this finding used one disposable thread, now archived. Default and Fast each returned the expected reply; release/resume preserved Fast and prior context. Three turns made no tool calls or edits. Ultrafast was absent. A separate blocked pre-dispatch probe confirmed Fast constructs `service_tier: priority`; backend scheduling, billing, and latency remain unverified.

## Rebase onto current main

The current rebase targets main `b4a5511ed0642f752e28e165adc2823e1367fecf`, including Bun 1.4.3 tooling. npm lock deletions are retained; Bun locks carry the approved SDK pins and local archive. Generator command guidance and its generated header now use Bun. The embedded controller body and archive are unchanged. All 11 frozen installs, SDK gates, typechecks, and builds pass, with 5,343 tests. Code Cleanup's missing build script was handled with the existing direct BB build command after the gate, not a new script. Root quality, generated-source, strict OpenSpec, and whitespace checks pass. No installation or reload was performed. The host prerequisite and previous review/acceptance limits remain open. See [the compatibility report](../../../BB-0.46-COMPATIBILITY.md).

A later parallel Pi rerun had one 5-second resume-test timeout, with 532 passes. The final serial-file rerun passed all 533 tests in 95 seconds. This timing limit is retained in the evidence; no deadline or behavior was changed. Resource contention is suspected, not established.

## CI resume-test follow-up

After the rebase push, CI passed 13 checks but the Pi job failed the resumed-Fast discovery-failure case at its 5-second test deadline. A cleanup `ENOTEMPTY` error was also reported. The related local run had already timed out for the revoked-tiers variant. The test covers three session lifecycles; the follow-up assigns only this case a bounded 15-second test budget. No runtime timeout, test retry, global deadline, or parallelism setting changes.

Two waits also used literal `1`/`2` offsets even though the helper expects delta offsets, not turn counts. They now use the offsets returned after the preceding boundaries. This prevents an older boundary from satisfying the new-turn wait. All saved Fast, reasoning-only rejection, zero-extra-dispatch, and explicit Default recovery assertions remain.

Local checks after the change: 14 speed tests passed; two complete default-parallel Pi runs passed all 533 tests in 22.74 and 42.53 seconds; typecheck and build passed. Original failure logs are retained. These results do not establish installed acceptance or resolve the BBP-201 host prerequisite. Independent review and post-push CI results are separate completion gates.

## Remaining acceptance

- Task 3.3 is partial. Native selector, Default/Fast visibility, and model/reasoning independence passed authorized installed acceptance. Failed discovery and loading/layout behavior are not verified live.
- Saved Fast under failed discovery is a demonstrated BB 0.46.0 defect, not an unverified risk. The local host fix passes boundary regressions, but has not shipped or received installed acceptance.
- Task 4.3 remains incomplete. Local regressions, current-host SDK compatibility, standalone build, and production-only packaging pass. Upstream compatibility remains inconclusive.
- Group 5 is partial. The BB draft provider was installed with explicit approval; limited real-account requests and installed resume passed. Standalone/global installation, bundled-provider isolation, in-flight changes, compaction, and failed-discovery live acceptance remain incomplete.
- Live Ultrafast acceptance was not run. Synthetic presentation coverage does not prove entitlement or a verified wire mapping.

Select Default to stop requesting Fast while keeping the thread and its history. Any return to prior package versions requires separate installation/source-switch approval. Do not delete credentials, history, other packages, or change provider defaults.
