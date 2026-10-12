# BB 0.46 source compatibility

## Rebase onto Bun tooling

The later rebase targets main `b4a5511ed0642f752e28e165adc2823e1367fecf`. It retains main's Bun 1.4.3 migration, GitHub Insight changes, and shorter cleanup tasks. Deleted npm locks stay deleted. Bun locks retain SDK 0.6.37 and the package-local speed archive. The Pi typecheck/upstream scripts remain on Bun; speed generation also uses Bun. Only generator command guidance and the generated header changed, not the embedded controller body or archive.

All 11 frozen Bun installs, SDK gates, typechecks, and builds pass. Tests: browser-annotate 110; changes 205; code-cleanup 103; codex-inspired 9; codex-quota 812; compose-chat 55; github-insight 1,545; markdown-reader 262; Pi 533; pr-thread-list 419; tasks-plus 1,290. Total: **5,343 passing tests**. Code Cleanup has no build script on main; the initial script attempt failed, then direct `bb plugin build` passed after its SDK gate. Root checks, generated-source check, strict OpenSpec validation, and whitespace checks pass.

A later parallel Pi rerun timed out in one resumed-session case at the existing 5-second deadline: 532 passed, 1 failed. The final full Pi run with `--no-file-parallelism` passed all 533 tests in 95 seconds. Both logs are retained. No test deadline or runtime recovery behavior was changed; contention is a suspected cause, not a proven diagnosis.

No installation or reload accompanies this rebase. [BBP-201](bbtask://BBP-201) remains a release prerequisite: installed BB 0.46.0 can silently replace saved Fast with Default after failed discovery and a reasoning-only edit. The local BB core fix is not published or installed. Limited earlier installed acceptance and its remaining gaps are recorded in [verification](openspec/changes/openai-codex-speed-options/verification.md). Historical scope, checks, and limits below are not current deployment approval.

## Initial migration scope

Koen approved upgrading all 11 repository plugins to BB 0.46 / SDK 0.6.37. Existing Codex speed work stays in its owning package. No plugin installation, reload, publishing, push, credential change, provider-default change, or session-history change is included.

All development SDK pins are 0.6.37. SDK manifest floors are >=0.6.37 within 0.6.x, and BB floors are >=0.46. Pi with subagents keeps its narrower BB 0.46.x range, exact runtime SDK alias 0.6.37, and build-tool pin 0.46.0. Lockfiles are updated together.

## Public API migration

PR thread list no longer uses the removed sidebar-actions API. Navigation uses `useBbNavigate`; pin, read, archive, and delete use row-bound native `experimental_useThreadActions` entries. Rename uses `sdk.threads.update`. Native archive and delete handlers retain the host safeguards. Missing or disabled native delete entries cannot dispatch.

Controls and styles are unchanged. PR thread list and GitHub Insight tests use current navigation, SDK, and native-action fixtures. Split-drag coverage checks forwarding to the public split hook, rather than a removed inspection field.

## Verification

All commands ran in the worktree against BB 0.46.0. Evidence: `/tmp/bb-046-upgrade.VA72Ac`.

| Package               | Passing tests | SDK check | Typecheck | Build |
| --------------------- | ------------: | --------- | --------- | ----- |
| browser-annotate      |           110 | Pass      | Pass      | Pass  |
| changes               |           205 | Pass      | Pass      | Pass  |
| code-cleanup          |           101 | Pass      | Pass      | Pass  |
| codex-inspired        |             9 | Pass      | Pass      | Pass  |
| codex-quota           |           794 | Pass      | Pass      | Pass  |
| compose-chat          |            55 | Pass      | Pass      | Pass  |
| github-insight        |         1,349 | Pass      | Pass      | Pass  |
| markdown-reader       |           241 | Pass      | Pass      | Pass  |
| pi-subagents-provider |           533 | Pass      | Pass      | Pass  |
| pr-thread-list        |           419 | Pass      | Pass      | Pass  |
| tasks-plus            |         1,285 | Pass      | Pass      | Pass  |

Total: **5,101 passing tests**. SDK checks use `bb plugin types <absolute-package-path> --check`; builds follow only passing gates. Repository lint, formatting, generated Codex-source consistency, and whitespace checks pass. Pi's suite includes the public-import scan and an isolated production-only install/build/load test at the new exact versions.

Initial missing SQLite bindings affected test setup in five packages. Rebuilding their package-local `better-sqlite3` dependencies resolves those failures. The six initial Codex Quota routing failures are not remaining source defects.

Impeccable's targeted mechanical detector reports no findings. Native BB 0.46 selector policy was inspected: explicit per-model service tiers narrow the provider vocabulary, and an empty list removes non-default choices. This is source evidence, not installed UI or real-account acceptance.

Independent migration review: **request changes**, one P2 native-stream recovery-text defect. The parent fixed it and added a regression using Pi 1.1.0's real native stream through BB translation and failed-turn settlement. Zero network dispatch is confirmed; unrelated provider errors keep their original text. The full 533-test Pi suite and affected gates pass after the fix. The original reviewer verdict remains unchanged; no follow-up review was launched. No SDK migration or native-action structural blocker was reported.

## Initial limits

- Nothing is installed or reloaded. Existing installed-plugin behavior is not certified by these checks.
- No browser or live-account speed acceptance was run. Existing OpenSpec selector/layout, session lifecycle, and account acceptance gates remain open.
- The reviewer confirmed that native BB normalizes unavailable effective tiers to Default, but did not establish an end-to-end saved-preference downgrade. Before speed acceptance, test saved Fast with revoked or failed discovery through the actual composer and bridge. This stays within the existing saved-preference acceptance gate.
- The bounded Pi upstream checker remains inconclusive because its response limit was exhausted. The provenance pin is unchanged.
- Ultrafast entitlement and wire behavior remain unverified and are not exposed by the shared controller.
- The standalone Pi package remains separate, on its owning project's PR branch.

See [Pi compatibility](bb-plugin-pi-subagents-provider/COMPATIBILITY.md) and [speed delivery gates](openspec/changes/openai-codex-speed-options/verification.md). The [BB 0.45 report](BB-0.45-COMPATIBILITY.md) records historical evidence, not the current target.
