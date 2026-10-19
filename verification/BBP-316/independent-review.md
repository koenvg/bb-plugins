## Verdict

`review` requests changes. Three findings remain.

1. **P1. Concurrent refresh can bypass refusal.**
   `bb-plugin-tasks-plus/creator-threads.ts:38-44` replaces the first lookup's token when another refresh starts. The first write can then resume against an old clear cache without awaiting the newer lookup.
   Isolated SDK reproduction returned `ok: true` and persisted `todo` plus a title change, although its lookup returned an unarchived creator. The later refresh restored blocking but left those edits saved. Share one in-flight lookup per thread, or await its replacement before allowing writes. Add an overlapping-refresh regression test.

2. **P2. Backfill can assign an ambiguous creator.**
   `bb-plugin-tasks-plus/db/schema.ts:15-19` selects source lines case-insensitively but extracts references case-sensitively.
   `Source bbthread://thr_one\nSource BBTHREAD://thr_two` returns `thr_one`. A malformed second Source URI is also ignored. Validate every Source candidate before assigning an ID. Add mixed-case and malformed-second-source tests.

3. **P2. Board refusal hides the required error.**
   `bb-plugin-tasks-plus/views/board/index.tsx:414-418` discards `creator_thread_open` and only refreshes. A refused drag or keyboard move snaps back without identifying the creator thread. Display the server error and test this board path. Current browser coverage exercises detail saves only.

## Verification

- Independently passed 5 files and 25 tests, typecheck, and diff checks.
- Read final logs showing 1,474 tests and 34 browser fixture cases passing.
- Recomputed build hashes. They match `artifact-identity.txt`.
- Inspected comments, suppressions, unnecessary code, and file growth manually. No additional structural blocker found.
- Installed acceptance was not run or authorized. Browser transport substitutes do not prove installed behavior.

Minimize Reader Load favors one lookup owner per thread. Test Behavior, Not Implementation drove the public-handler race reproduction.
