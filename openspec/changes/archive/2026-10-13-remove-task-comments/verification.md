# Removal verification

## Scope and safety

Change: `remove-task-comments`. Baseline: `cace8bed65418e9a0a6d50d545f457ad7c219659`. Verification covers the working tree, including new migration fixtures and tests.

No production install, reload, migration or existing worker/task operation was performed. Automated database/import tests used disposable paths. The operator later approved an isolated live loop with a separately named test plugin and owned fixtures; those resources were removed after verification. Existing native messages, inactive Orchestrator records and stored presets were not targeted. Production deployment still requires explicit approval.

## Automated results after review fixes

From `bb-plugin-tasks-plus`, all commands exited 0:

| Command | Result |
| --- | --- |
| `bun run test --maxWorkers=2` | 120 files, 1,212 tests passed |
| `bun run typecheck` | Passed |
| `bun run lint` | No errors; four warnings remain |
| `bun run format` | Completed |
| `bun run --cwd .. format:check bb-plugin-tasks-plus` | 322 files passed |
| `bun run build` | Server, app and CSS artifacts built |
| `node --test scripts/navigation-benchmark/*.test.mjs` | 19 tests passed |
| `git diff --check` | Passed |

Logs: `/tmp/remove-task-comments-test.log`, `-typecheck.log`, `-lint.log`, `-format.log`, `-format-check.log`, `-build.log` and `-benchmark.log`, with the same `remove-task-comments` prefix.

The warnings concern the existing list-preference spread, attachment control-character regular expression, unused keyboard-test helper and array constructor. They are not errors. No retained safety assertion was relaxed to make validation pass.

Migration tests use a frozen migration-11 fixture and real SQLite storage. They cover a populated upgrade, fresh/repeated startup, retained task and historical records, attachment identity/metadata, foreign keys, integrity and transaction rollback. API tests verify migrated blob bytes at the original fork URL and reject legacy selectors before side effects. Import tests preserve the source and files and refuse a populated target.

## Independent review and repairs

One fresh read-only `delegate` used the `review` skill. Original verdict: **request changes**. No second review was launched.

[Original report](/Users/koen/.bb/pi-subagents-bridge-sessions/subagent-artifacts/outputs/cd943d18-c0be-482b-a73f-9c5094c74633/remove-task-comments-review.md).

All three findings were addressed:

- Deleted the unused editor submission prop, refs, Enter/modifier/IME handler, coarse-pointer dependency and enter-key-hint effect. Removed submission-only tests. Retained tests prove multiline/Shift+Enter typing, mention selection and file staging.
- Replaced positional survivor slices with named ownership groups. Both task and project deletion now assert nonempty surviving file sets, metadata, file existence and exact bytes.
- Corrected current benchmark fixture/procedure descriptions. Separately provisioned task files and title/description edits replace activity/comment checks. Original baseline identities and activation/rollback requests are clearly historical; migration 12 has separate backup-based instructions.

The review's other cleanup items were also resolved within the removal scope: unused `authorName` inputs and attribution callers were deleted; complete attachment reads now share the canonical enumeration; the editor's unused read-only mode was removed. No unresolved cleanup follow-up remains. The parent reran the full checks above after these repairs. This is not a new independent approval.

## Source audit and live verification

The current TypeScript/TSX audit found task-comment references only in historical migrations, explicit removal/compatibility tests, legacy ownership rejection, inert Orchestrator report JSON and unrelated PR presentation. Current benchmark JavaScript and bundled Tasks guidance contain no comment entrypoints or posting instructions. Editor submission/read-only options and status attribution fields are absent.

With explicit operator approval, tasks 5.2 and 5.3 were completed on a separately named copy in live BB. Standalone detail, native Ticket, thread-side Task, keyboard help, saved edits, files, real delegation and retained thread/review state were checked. The actual installed skill and references had no comment, activity or notification procedures. [Live evidence, commands, identities and limits](live-verification.md).

The test plugin, owned project/worker, browser/profile and test data were removed. The production `tasks-plus` retained its original source, version, enabled state and app bundle hash. It still uses the earlier checkout and guidance; it was not upgraded or migrated.

The core chat timeline's `Working...` text differed from the authoritative idle API/log and the Tasks panel's Idle indicator. This host display limitation is recorded, not claimed fixed. Automated checks remain the evidence for the wider failure/race/compact-layout matrix.

All 25 implementation tasks are complete. Production deployment remains separate and needs explicit approval plus [the consistent backup and paired deployment procedure](../../../../bb-plugin-tasks-plus/COMMENT-REMOVAL-UPGRADE.md).

## Spec sync and archive

The seven delta specs were merged into main specs before archiving. The merge applied 6 additions, 21 modifications, 2 removals and 2 renames. Existing titles, Purpose sections, surviving scenarios and 30 unrelated requirement blocks were preserved. All 60 main specs passed strict validation, and every delta operation was verified against the merged files.

The archive command used `--skip-specs` only to avoid applying the already-synced deltas again. All artifacts and 25 tasks were complete. The change metadata moved with the directory; production was not changed.
