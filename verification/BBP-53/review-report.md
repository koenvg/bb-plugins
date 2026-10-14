## Verdict: request changes

Two task blockers:

- **P1: CI cannot build Tasks.** `.github/workflows/tests.yml:167-169` runs `bb plugin build`, but no step installs BB. SDK 0.6.37 provides no `bb` binary. Local validation used the desktop application's global executable. Removing that ambient PATH dependency reproduced `bb: command not found`, exit 127. Add an explicit supported build-tool bootstrap and verify on a clean runner.
- **P2: Focus restoration misses active listboxes.** `bb-plugin-tasks-plus/views/detail/attachment-preview.tsx:262-275` checks dialogs and menus, but omits `listbox`. A newer listbox therefore cannot prevent deferred trigger focus restoration. This duplicates and diverges from `shell/shortcuts.ts:167-172`. Align the overlay policy and add desktop/compact close-to-new-listbox tests. This finding is source-evidenced, not successfully runtime-reproduced.

## Evidence and limits

- Inspected actual final logs: 4 shared tests, 1278 Tasks tests, 6 browser tests, typechecks, SDK check and local builds passed. Clean-build failures were deliberate baseline/sentinel checks.
- Inspected both final PNGs and geometry JSON. Controls fit; loading/ready geometry matches.
- Real-host authentication denial remains **BLOCKED**. Registration tests bypass middleware.
- Browser downloads were not activated; bytes/disposition were verified separately through registered-route tests.
- Exploratory jsdom probes failed or remained incomplete. They do not establish behavior.
- Four lint warnings are baseline issues. No new application comments/suppressions or file-size threshold crossings found.
- No files, commits, installation or BB state changed.
