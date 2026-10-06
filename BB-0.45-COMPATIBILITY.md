# BB 0.45 compatibility

Compared BB release tags `desktop-v0.44.0` and `desktop-v0.45.0` in the local BB repository. The running CLI is 0.45.0 and its SDK is 0.6.15. The local BB working tree was not changed.

## Changes and fixes

| BB change                                                                                   | Plugin fix                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BB now ships SDK 0.6.15.                                                                    | All nine packages pin 0.6.15 and target BB >=0.45, SDK >=0.6.15 <0.7. Lockfiles match. Older BB builds need the previous plugin revision.                                                                                                               |
| `useComposerView` is absent from published types. BB retains a runtime compatibility alias. | GitHub Insight uses `useComposer` for its banner and navigation tests.                                                                                                                                                                                  |
| Environment PR results now include `autoMerge` and `inMergeQueue`.                          | GitHub Insight's typed fixture includes both fields. Production code already reads the fields it needs.                                                                                                                                                 |
| Voice controls now offer `Stop and add to draft` and a separate `Send voice input` button.  | Compose Chat recognizes the add-to-draft control. Enter never selects the voice-send button. Unknown or ambiguous controls still cause no voice action. Legacy labels remain covered.                                                                   |
| Providers can define service-tier ids instead of using only `default` and `fast`.           | Tasks accepts nonblank tier ids through its picker, RPC schemas, CLI, storage and dispatch. `--service-tier none` still clears the selection. Migration 11 removes the old database enum constraint and preserves preset data and existing constraints. |
| SDK changed minor versions.                                                                 | Markdown Reader's old `<0.6` limit no longer rejects the current host.                                                                                                                                                                                  |

Relevant BB commits include `c51f38c`, unified composer API, `7e13928`, provider-defined service tiers, and `8c14685`, PR status data. Voice labels were checked in the 0.45 release source, not inferred from a generated bundle.

## Verification

- All nine package test suites pass, 3,641 tests in total.
- All nine typechecks, `bb plugin types --check` checks and `bb plugin build` commands pass.
- Root `npm run check` passes with existing lint warnings. `git diff --check` passes.
- Codex Quota's full `npm run test:bundle` passes with temporary synthetic storage and OAuth fixtures.
- The single fresh-context completion review approved the diff with no blockers. It independently reran all 3,641 tests without cache, all typechecks without incremental state, and root static checks. Review report: `/Users/koen/.bb/thread-storage/thr_52uhzqgs8f/bb045-compat/completion-review.md`.
- Compose Chat's new-label test failed before the fix. Provider-tier CLI and dispatch tests also failed before the fix.
- Tasks tests cover legacy migration preservation, schema integrity, reload, provider-tier selection, CLI clearing and dispatch forwarding. The SDK test picker has fixed tier options, so its test adds one synthetic provider option.
- Built Compose Chat browser checks pass at 1280px and 390px. Synthetic keyboard events verify recording start, add-to-draft, no send during transcription or held Enter, restored focus, and a fresh Enter to submit. Screenshots show no clipped controls or page-width overflow.
- Browser evidence: `/Users/koen/.bb/thread-storage/thr_52uhzqgs8f/bb045-compat/voice-results.json`, `voice-1280.png`, and `voice-390.png`. These are fixtures, not installed native acceptance or microphone/transcription tests. Initial CDP driver attempts failed; the final bounded synthetic-event checks passed.

## Remaining limits

- At the time of this compatibility check, Tasks Orchestrator activation and native-origin reporting rejected BB 0.45. The later [Orchestrator removal](openspec/changes/remove-bb-orchestrator/proposal.md) withdraws those features instead of extending their allowlist. [BBP-140](bbtask://BBP-140) remains a historical follow-up record, not an active feature requirement. Ordinary Tasks tracking, presets and worker delegation remain separate.
- The installed `pi-subagents-provider` rejects BB 0.45 through its manifest. Its source is outside this repository and was not changed.
- Compose Chat's legacy browser-matrix CLI is already tracked in [BBP-137](bbtask://BBP-137). It was not changed. The checks above use the installed Browser Use Python helpers directly.
- No plugin installation source, enabled state, theme, existing task content, provider setting or running thread was changed. BBP-140 is the only new task record. Several installed plugins use recovery or deployment directories rather than this repository. Deploy from the intended durable source after review; do not replace those copies without checking their separate changes.
- Native desktop, live provider execution and cross-device checks did not run. No publication, commit or PR was made.
