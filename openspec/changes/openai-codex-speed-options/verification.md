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

The approved compatibility migration targets BB 0.46.x, SDK 0.6.37, and build tooling 0.46.0. The current-host SDK gate, standalone build, and production-only packaging pass. [BBP-197](bbtask://BBP-197) is attached to this thread. See [the all-plugin migration report](../../../BB-0.46-COMPATIBILITY.md). The old SDK failure remains recorded as initial delivery evidence; no diagnostic exception or installed/live acceptance is claimed.

The upstream check compared baseline `fdd3de3b19b97e6cd1ef7300cbb54711431249d3` with upstream head `3912f4aaefb7dff55c7e0cb5003b26b5cf1457dc`, but stopped before complete tree coverage. This does not establish compatibility or a code defect. No upstream source or provenance revision was changed.

## Independent review

The initial speed implementation received one fresh read-only delegate review using the strict `review` skill against the baseline and all relevant untracked files. It independently reran 530 pre-fix tests and local checks. Its original verdict was request changes.

Both initial findings were accepted:

1. A delayed idle refresh could settle a newly active model run. A processing-generation check now runs at the bridge settlement boundary. A paused-discovery/concurrent-Default-turn regression fails on the old behavior and passes after the fix.
2. Shared speed errors suggested the unavailable `/speed default` command. The initial fix covered private-channel errors and its regression. The migration review later found the same defect in late native payload-guard errors; the final BB recovery profile covers both paths.

The approved all-plugin SDK migration then received one fresh strict review of the complete working tree. Its verdict was request changes for the reproduced late native error message; it found no SDK or native sidebar-action structural blocker. The parent fixed the error-constructor message in BB generation, not the shared archive or guard logic. A regression fails before the fix and passes afterward through real Pi 1.1.0 native streaming, BB translation, and failed-turn settlement, with zero network dispatch. Another regression preserves unrelated provider errors. Final Pi results are 53 files / 533 tests, including production-only packaging; all affected checks pass. Neither original verdict was relabeled as approval, and no follow-up review was launched. No additional cleanup finding was reported.

## Remaining acceptance

- Task 3.3 is partial. Pinned native-selector code and metadata contracts were checked. No frontend or DOM override was added. Installed selector, loading/layout behavior, and operator approval remain unverified.
- Saved Fast with revoked or failed discovery must be checked through the actual composer and bridge. The migration reviewer observed native effective-tier normalization to Default; whether execution-source handling preserves the saved preference remains unverified. This is not a demonstrated end-to-end downgrade.
- Task 4.3 remains incomplete. Local regressions, current-host SDK compatibility, standalone build, and production-only packaging pass. Upstream compatibility remains inconclusive.
- Group 5 remains unapproved. No standalone/global installation, BB installation/reload, real-account Fast request, installed resume, or bundled-provider isolation test was run.
- Live Ultrafast acceptance was not run. Synthetic presentation coverage does not prove entitlement or a verified wire mapping.

Select Default to stop requesting Fast while keeping the thread and its history. Any return to prior package versions requires separate installation/source-switch approval. Do not delete credentials, history, other packages, or change provider defaults.
