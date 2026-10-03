# Verification

## Scope

- Change: `task-progress-reporting`.
- Pre-implementation commit: `3425edb839388a72fe8ac5ac5240cc573b8372b8`.
- Production changes: the bundled Tasks skill and delegated worker report-back text.
- The existing Tasks installation, user task records, stored presets, and pre-existing worker threads were not changed. With approval, an isolated test plugin and one bounded worker exercised temporary records; cleanup is recorded below.
- No new runtime dependencies, commands, migrations, UI behavior, or automation.

## Test-first checkpoints

- The initial skill contract test failed because the existing skill had no short-lead rule. It passes with the reporting section.
- The safe posting test failed because there was no multi-line example. It now verifies the documented command through a shell function standing in for `bb`. Real newlines, Markdown backticks, and literal `$(name)` text reach the body argument unchanged. No real CLI writes occur.
- The prompt tests failed for tasks with and without subtasks and for the actual fake-host dispatch prompt. They pass with the updated report-back contract.
- A public CLI-to-editor integration test passes for both a formatted agent update and a long user comment. It uses isolated SDK test-host storage, reads the stored body through `tasks show`, renders the real read-only comment editor, and checks the thread link. Posting does not change task status or notify a worker.

These are deterministic instruction and integration checks. They are not measurements of model compliance.

## Synthetic reporting checks

The following cases were checked against the skill and worker instructions. Each expected update is an authored example, not actual output from a test worker. References identify synthetic fixtures only.

### Completed child

Given: one of three children is done and its result enables the next child. The remaining children are not done.

Expected comment:

> **1 of 3 subtasks is done. Safe dispatch can now start.**
>
> - The compact-status result enables the next worker.
> - Next: implement safe dispatch, then recovery.
> - Whole-epic acceptance remains pending. [Child result](bbtask://RPT-2).

Check: the epic reports the effect and next work. The subtask retains its detailed result and handoff.

### Stale parent text

Given: an old parent comment says review is pending. The latest task read shows the child done, and its new result records the review outcome.

Expected comment:

> **The child review is complete. The next dependency is ready.**
>
> - The current child record and result replace the earlier pending-review update.
> - Next: continue the approved downstream work.
> - Full integration is still pending. [Reviewed result](bbtask://RPT-2).

Check: the parent instruction requires a current read. It does not use the old comment as the current source of truth.

### Current state unavailable

Given: a child reports completion, but the parent agent cannot read current task state.

Expected comment:

> **A worker reports completion, but current task state is unknown.**
>
> - I could not confirm the child status or the epic's done count.
> - Next: confirm current records when access is available.
> - [Worker evidence](bbthread://thr_abc123).

Check: no invented count or acceptance claim. The report is explicitly attributed to the worker.

### Duplicate report

Given: the same child result arrives again, current task state is unchanged, and there is no new blocker or decision.

Expected result: no comment. The existing child result and parent update remain the evidence references.

Check: the milestone rule combines related changes and omits unchanged updates. It does not add a progress ping.

### All children done, acceptance pending

Given: all three children are done, but whole-epic integration has not been verified.

Expected comment:

> **3 of 3 subtasks are done. Whole-epic acceptance is still pending.**
>
> - Individual worker results are available.
> - Next: complete integration and the acceptance checks.
> - [Result evidence](bbthread://thr_abc123). The epic is not yet complete.

Check: the instruction separates the child count from acceptance and keeps the remaining work visible.

## Local validation

- `npm test -- --maxWorkers=2`: 939 tests passed across 86 files.
- `npm run typecheck`: passed.
- `npx --yes --package oxlint@1.86.0 -- npm run lint`: passed with four warnings in unchanged files. Oxlint is not a package dependency; no dependency files changed.
- `npm run build`: passed. BB notes the existing SDK pin is 0.5.9 while the installed SDK is 0.5.29. The pin was left unchanged.
- Skill Creator `quick_validate.py`: passed through `uv run --no-project --with pyyaml` from `/tmp`. The first plain Python attempt lacked PyYAML; no project dependency was added.
- `openspec validate task-progress-reporting --strict`: passed.
- `git diff --check` and a whitespace/newline check of untracked files: passed.

## Completion review

- One fresh-context, read-only reviewer approved the complete working-tree change against the baseline above, including all untracked files. No defects or structural blockers were found.
- Review run: `ee8562b3-d9c6-4f58-ac41-f12a4fe44c8f`.
- The reviewer reran the focused suite: 16 tests passed across three files. It confirmed that production edits stay within reporting instructions. Installed-worker behavior was still unverified at review time; the later approved check is recorded below.
- No fixes or second review were needed.
- The later content-only skill revision below was not part of that review. No second review was run.

## Skill revision before the pull request

- Applied the user's `writing-for-agents` guidance. The main skill fell from 237 to 126 lines and from 1,487 to 753 whitespace-separated words.
- Kept the work sequence and reporting policy inline. Moved project listing, relationship, notification, and thread-repair details to `references/task-records.md`, with explicit conditions for reading it.
- Removed duplicated rules and command details available through `--help`. Corrected the epic example to use one lead sentence. No worker-prompt or runtime code changed in this revision.
- Re-ran all 939 tests, Skill Creator validation, and the package build. All passed; the existing SDK pin warning remains. Checked every new reference path and heading anchor.
- The live worker run below used the earlier skill text. It was not repeated after this content-only revision.

## Live behavioral verification

- Approved isolated test completed on 2026-10-03. One worker handled five phases using the packaged skill and actual dispatch prompt.
- The child and parent reports contained 56, 62, and 67 words, each with three bullets and a thread evidence link. The worker corrected stale parent text, separated child completion from epic acceptance, omitted a duplicate update, and reported unknown state after a failed current-state read. Both parent reports used two lead sentences rather than the requested one; exact format compliance was partial.
- The test plugin, owned records and preset, temporary source, and worker worktree were removed. The stopped worker remains archived as evidence. The existing Tasks source and app bundle hash are unchanged.
- [Expected and observed results, fixture differences, and evidence](live-verification.md).

## Remaining limits

- No implementation verification gate remains open. This is one controlled worker sample, not a guarantee across models, prompts, or future events.
- The production installation still uses its original source. No production rollout, commit, or OpenSpec archive was performed.
