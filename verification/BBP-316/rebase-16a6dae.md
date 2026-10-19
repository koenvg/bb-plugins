# Rebase onto 16a6dae

Rebased the three PR commits onto `16a6dae4929413b9b8b222bfa23bcedd485c793e`. The pre-rebase remote tip was `3970ae612998bdf4eb8d71555f7fad1e10e0b018`. The rebased feature tip before the fixture compatibility fix is `49af062380028097d7ec839fd0946a007335c506`.

## Integration changes

- Kept main's new React effect hook and controlled due-date menu props in both task-property layouts.
- Kept the creator info tooltip and main's task-change IDs and separated board resource refreshes.
- Corrected the new board-resource browser fixture to return a contract-valid synthetic error instead of `{ ok: false }`. The RPC schema rejects the old payload because its required error object is absent.
- Preserved all card rollback and resource-count assertions. Added an assertion that the server error is visible. No production error fallback or policy change was added.

## Verification

The initial full browser run passed 48 cases and failed the new failed-move rollback case. The malformed fixture response caused error display to throw before the existing refresh could restore the card. The fixture now uses the shared boardMove output schema to validate its synthetic failure.

After correction:

- All three focused board-resource cases passed.
- The full browser suite passed all 49 cases on the current owned-port runner.
- The Tasks suite passed 134 files and 1540 tests.
- Typecheck, lint, formatting, SDK matching and the production build passed.
- Historical BBP-53 capture hashes were unchanged.

[Independent review](rebase-16a6dae-review.md) approved the narrow integration with no findings. Portable logs are available for the [tests](rebase-16a6dae/tests.log), [browser cases](rebase-16a6dae/browser.log), [typecheck](rebase-16a6dae/typecheck.log) and [build](rebase-16a6dae/build.log). Full logs, the original failed trace, final browser traces, artifact hashes and the range comparison are retained at `/Users/koen/.bb/thread-storage/thr_9e6riv42k5/bbp316-rebase2.saitka`. This verifies local fixtures, not installed acceptance.

No merge, deployment, plugin activation, production migration, settings change or secret access occurred.
