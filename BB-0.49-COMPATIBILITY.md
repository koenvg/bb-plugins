# BB 0.49 compatibility

All 13 plugins pin SDK 0.6.132, matching BB 0.49.0. The four package-local BB build tools pin 0.49.0. The root Bun lockfile records these versions.

Changes, Codex Quota, and GitHub Insight require BB 0.49.0 and SDK 0.6.132 for their migrated APIs. Pi with subagents accepts BB 0.49.x and SDK 0.6.132 through 0.6.x. Other packages retain their existing engine ranges. This run tests BB 0.49.0 only.

## Changed contracts

- Changes reads status, branches, revision-bound patches, and file contents through the bundled `bb--git` plugin. That plugin must be enabled. Patch requests use at most 50 keys each.
- Changes and GitHub Insight register thread action tabs through `experimental_tab`. Existing tab IDs stay unchanged.
- GitHub Insight opens tabs through the panel controller. Its navigation badge uses `experimental_useBadge`.
- Codex Quota uses the native navigation badge. An asterisk after a percentage means some accounts are unavailable or unverified. The accessible label explains the qualifier. The footer retains its detailed allowance display.
- Threads with PRs uses BB's current activity fields. BB no longer exposes goal activity or a goal indicator.
- Codex Quota, Threads with PRs, and Tasks Plus keep the canonical SDK in production dependencies because their runtime contracts import it. Pi retains its matching runtime SDK alias.
- Changes and GitHub Insight use the new SDK's Zod 4.6.7 dependency range to avoid incompatible schema types across Zod versions.

The Git RPC schemas are copied only for the fields Changes reads. The [upstream Git contract](https://github.com/get-bb/bb/blob/main/plugins/git/contract.ts) documents the patch-key format. The installed BB 0.49.0 RPC inspection is the version-specific contract for this update.

## Verification

The final local run passed all 33 required checks. This includes root tests, lint, formatting, and tests and typechecks for all 13 plugins. Shared Markdown tests and typecheck also passed. The Pi provider passed 1,111 tests across 83 files, including its production-only install and artifact-loading test.

All 13 official plugin builds passed. All 29 generated JavaScript artifacts identify BB 0.49.0 and SDK 0.6.132. The four package-local build CLIs were invoked without desktop CLI redirection.

The Markdown preview watcher initially failed inside the filesystem sandbox. The unchanged test passed with macOS file-notification access, and the complete final lifecycle suite passed with that access.

Independent read-only Codex review approved the corrected source. It caught an absolute-path mismatch in Changes that the original fixtures missed. The new regression failed before the fix. Changes then passed all 363 tests, its typecheck and rebuild, and root lint and formatting. The reviewer independently loaded full context through the candidate backend against the real Git plugin.

The durable installed checkout was fast-forwarded to reviewed code commit `d850c4f`. All 13 plugins rebuilt there, and all 29 JavaScript artifact hashes matched the reviewed worktree. All 13 plugins reloaded successfully on their existing paths. Pi with subagents became available.

Live checks opened Changes and its context-expansion controls, opened the PR tab with the expected no-PR state for the owned thread, and observed both native navigation badges. Installed Changes loaded both README text sides, which matched the actual Git revisions. The owned browser space closed, and the thread's original closed-panel state was restored.

Tasks Plus passed all 75 browser checks using its supported cached Chromium override. Its historical captures stayed unchanged, and its owned listener and temporary directory were removed. Four other fixture suites require missing Chromium build 1248 and cannot select the cached browser. The user explicitly approved leaving those suites unverified and using live BB smoke checks instead. No browser was downloaded.

Exactly `continue` was accepted for all 29 approved existing Pi threads. Five messages dispatched immediately. The remaining 24 queued under the existing six-thread concurrency limit. The limit was unchanged. This records delivery and provider recovery, not completion of those tasks.

Pi's [compatibility document](bb-plugin-pi-subagents-provider/COMPATIBILITY.md) retains its previous lifecycle and persistence limits. This update does not certify new paid model behavior, compaction, or subagent retention beyond the checks explicitly recorded for this run.
