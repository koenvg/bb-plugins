# Evidence report and state ledger

Create the checklist and ledger before changing BB state. Update them during the run, including when a step blocks before installation. Keep full logs in the private per-run evidence directory and link only safe evidence in the user-facing report.

## Run identity

Record:

- Plugin ID and package path.
- Checkout commit plus relevant uncommitted changes, or the explicit comparison/acceptance scope.
- BB instance and relevant project/environment/host identifiers, without credentials.
- Original and observed installed sources, enabled state, activation result, and available artifact/generation identity.
- Actual browser process/profile identity, explicit endpoint without credentials, unique daemon name and ownership, strict health result, and recorded tab target IDs, including the daemon's provisioning tab. Record explicit session binding for page commands. Distinguish task-created tabs from user-selected tabs. Record signed-in Chrome approval or why browser checks are blocked/non-applicable.
- Evidence location and commands with exit codes. Record any unavailable tool, missing test script, or optional diagnostic channel.

## Check table

| Check | Expected result | Observed result | Status | Evidence |
| --- | --- | --- | --- | --- |
| Stable check ID and behavior | Observable acceptance condition | What happened, or the missing prerequisite | passed / failed / blocked | Command and exit code, safe log excerpt, screenshot, or blocker detail |

Keep automated checks, build/activation, live behavior, and cleanup distinguishable. Label walkthroughs and fixtures as such. Do not merge their results into a live check. List non-applicable checks separately with a reason; do not count them as passes.

### Result rules

- **Passed** means the expected result was observed on the intended target and supported by evidence.
- **Failed** means an executed check contradicted its expected result. A failing build or activation is a failed check even if the old plugin remains healthy. Attribute environment problems separately from product defects.
- **Blocked** means a prerequisite, permission, target identity, or access issue prevented a valid observation. It is not a pass or proof of a product defect.

Overall result:

1. Failed if any required check fails, including attempted cleanup that fails.
2. Otherwise blocked if a required check cannot run or cleanup awaits permission/conflict resolution.
3. Passed only if every required check passes and cleanup is confirmed complete.

Examples:

| Evidence | Overall result |
| --- | --- |
| Local checks, exact-source activation, all required interactions, and cleanup pass | passed |
| The page renders but the changed action raises a runtime error | failed |
| Tests/build pass; the linked PR required for a live badge is unavailable | blocked |
| All behavior passes; a newer user setting prevents safe restoration | blocked |

## State ledger

| Resource | Original state | Temporary state written | Ownership / approval | Intended final state | Cleanup observation |
| --- | --- | --- | --- | --- | --- |
| Exact setting key, source, test-record ID, daemon, tab target, or process | Non-secret value or absent | Value set by this run | User approval or bounded verification scope | Original value or explicitly approved retained state | Restored, intentionally retained, failed, or blocked |

Record test-data setup and deletion scope together. Store identifiers rather than unrelated record content. Do not copy secret configuration into the ledger.

Before restoring a value, re-read it. If it differs from the temporary value, preserve it and report a concurrent-change conflict. Confirm restoration through the same supported interface. A failed check does not cancel cleanup obligations. Keep evidence files promised in the report separate from disposable files.

For an explicitly approved destructive managed replacement, record the approved configuration losses and actual final state. Report deleted settings, secrets, and schedules as intentionally removed, not restored. Restoring the original source is not configuration recovery. If replacement or an agreed recovery step fails, report that failure and the remaining state rather than assuming the old setup is recoverable.

## Final reply

Lead with passed, failed, or blocked for the requested verification. Briefly name the demonstrated behaviors, link evidence, and list remaining failures or prerequisites. State the final plugin source and enabled state, restored selections, remaining test records, and cleanup outcome. Flag a retained worktree source's retirement risk. Ask one concrete question when permission or access is needed.

Never shorten a partially verified result to "verified" or "everything works." Report the installed plugin's result separately from any validation of this skill itself.
