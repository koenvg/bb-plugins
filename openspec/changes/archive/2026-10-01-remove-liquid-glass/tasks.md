# Tasks

## 1. Repository retirement

- [x] 1.1 Load the implementation skill, record the baseline commit and working-tree status, and run repository absence assertions before mutation. Verify that the existing Liquid Glass directory, README row, and CI entry produce the expected failing removal checks, and record the baseline and results in the historical verification record.
- [x] 1.2 Delete the tracked `bb-plugin-liquid-glass/` package, including tests, lockfile, documentation, and evidence assets. Verify directory absence and that the diff deletes only that package's tracked files.
- [x] 1.3 Remove Liquid Glass's row from `README.md` and its entry from `.github/workflows/tests.yml`; replace the README's stale seven-plugin CI claim with coverage of all remaining plugins. Verify no live Liquid Glass installation or CI reference remains in those files, the five matrix entries exactly match remaining plugin manifests, and triggers, permissions, prerequisites, and test commands are unchanged.
- [x] 1.4 Rerun the removal assertions and classify remaining Liquid Glass search hits as capability records, this change's artifacts, or historical evidence. Verify the assertions pass and `openspec/changes/archive/` and existing `plugin-verification-skill` records have no task diff; record the results in the historical verification record.

## 2. Local BB retirement

- [x] 2.1 Recheck `bb status --json`, `bb plugin list --json`, `bb theme show --json`, and `bb theme list --json` against the intended local installation. Resolve any installed Liquid Glass ID and record its source, current theme, favicon color, and unrelated plugin identities in the historical verification record, without exposing secrets. Verify whether the observed no-op path still applies before choosing any mutation.
- [x] 2.2 If Liquid Glass is selected, run `bb theme set default --json` and verify default is selected with favicon color preserved; otherwise issue no theme mutation and verify the selected non-glass theme is unchanged. Record the outcome in the historical verification record.
- [x] 2.3 If installed, use `bb plugin remove <resolved-id> --json`; if absent, record a no-op instead. Verify plugin and theme lists no longer contain Liquid Glass, unrelated plugin identities remain present, and the intended non-glass theme and favicon color are preserved. Stop and report incomplete removal if any command or postcondition fails.
- [x] 2.4 When a client still displays glass styling, reload the signed-in Arc session and verify normal remaining-theme rendering, navigation, and composer behavior without changing the client mode preference. Record browser evidence when exercised, or explicitly record that no stale client was observed or browser verification was unavailable; do not claim an unperformed live check.

## 3. Integration and completion

- [x] 3.1 Run `npm ci` and `npm test` for the five remaining CI plugins using the documented compatible Node 24 runtime and SQLite prerequisite. Verify each suite succeeds, separately record any infrastructure blocker or skipped check, and confirm no check targets the deleted package.
- [x] 3.2 Run `openspec validate remove-liquid-glass --strict` and `git diff --check`; verify both succeed and record repository and local-runtime outcomes separately in the historical verification record. Keep durable spec synchronization and any retirement-purpose wording update for the explicit archive workflow.
- [x] 3.3 Load the code-review skill and run its single fresh-context read-only completion review against the recorded baseline, including untracked change artifacts. Resolve blocking findings, rerun checks affected by fixes, and record the review result and remaining verification limits before declaring implementation complete.
