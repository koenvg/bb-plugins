# BBP-316 verification

## Scope and decisions

Baseline: `e9afeecce2d0b4675f3879bd04d2a5cd40af30fa`.

Koen approved refusal of todo writes while the creator thread is unarchived. CLI and UI share that rule. MCP is excluded by explicit approval. BBP-319 is a confirmed backlog follow-up blocked by BBP-316.

No production backfill, plugin activation, deployment, settings change, merge, or secret access occurred. Installed acceptance remains blocked by that approval boundary. Tests and builds are not installed acceptance.

## Plan and domain

- [x] Read task requirements and resolve the refusal and MCP decisions.
- [x] Capture failing public-boundary tests before implementation.
- [x] Add creator metadata, a one-time conservative backfill and blocker queries.
- [x] Connect CLI context, shared write guards, lifecycle refresh and task details.
- [x] Run package checks, isolated browser checks and a disposable-data build.
- [x] Complete independent review and inspect each finding's resolution.
- [x] Commit, push and open a PR. Leave it open.

Model the Domain kept creator lifecycle separate from task-to-task dependencies. A nullable creator ID identifies the source thread. Creator lifecycle contributes one additional open blocker without pretending that a thread is a task. Prove It Works led to isolated SQLite checks, SDK-boundary lifecycle tests, and real production UI components driven in Chromium.

One implementation owner. Storage, transport, lifecycle and UI were verified in order. Independent checks ran in parallel. The main risk was stale creator lifecycle state across reload and archive changes. SDK read tokens prevent an older response from replacing a newer lifecycle event. Disposal prevents late reads from writing to a closed database.

## Verification results

Bun 1.4.3, Node 24.15.0, SDK 0.6.49 and the package's pinned TypeScript 7.0.2 were used. Frozen dependencies were installed locally. The shared Markdown package was built before consumer checks.

| Check                          | Result                                                                                                                                                     | Evidence                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Test-first baseline            | Four new public-boundary tests failed because creator metadata and refusal did not exist                                                                   | [Red run](red.log)                                                                                                      |
| Tasks package                  | 132 files, 1479 tests passed, exit 0                                                                                                                       | [Suite](tests-reviewed.log)                                                                                             |
| Review regression checks       | Five new regressions failed before fixes. Four files, 33 tests passed after fixes                                                                          | [Red](review-regressions-red.log), [green](review-regressions-green.log)                                                |
| Typecheck                      | Passed, exit 0                                                                                                                                             | [Pinned compiler](typecheck-reviewed.log)                                                                               |
| Lint                           | Passed, exit 0, with four pre-existing warnings                                                                                                            | [Lint](lint-reviewed.log)                                                                                               |
| Formatting                     | Passed, exit 0                                                                                                                                             | [Format check](format-reviewed.log)                                                                                     |
| Browser regression suite       | 35 cases passed, exit 0                                                                                                                                    | [Chromium suite](browser-reviewed.log)                                                                                  |
| Creator screenshots and traces | Detail refusal at desktop and narrow widths, plus a real pointer drag refusal on the board                                                                 | [Desktop](screenshots/desktop.png), [narrow](screenshots/narrow.png), [board](screenshots/board.png), [traces](traces/) |
| SDK check and production build | Official local CLI 0.46.1 matched SDK 0.6.49 and built both bundles, exit 0                                                                                | [Build](build-reviewed.log), [artifact hashes](artifact-hashes-reviewed.txt)                                            |
| Shared Markdown prerequisite   | Eight files, 129 tests passed and typecheck passed                                                                                                         | [Tests](shared-tests.log), [typecheck](shared-typecheck.log)                                                            |
| Mechanical UI detector         | No findings, exit 0                                                                                                                                        | [Detail](design-detector.json), [board](board-design-detector.json)                                                     |
| Historical captures            | BBP-53 file hashes were identical before and after both browser runs                                                                                       | Run comparison, exit 0                                                                                                  |
| Installed acceptance           | Not run. Activation, real task mutations, settings changes and deployment were not authorized                                                              | Explicit user boundary                                                                                                  |
| Independent review             | Requested three changes. Parent inspected and fixed all three, with red/green regressions and final full checks. No second review was requested or claimed | [Original review](independent-review.md), [closure](review-closure.md)                                                  |

The SDK host substitutes only BB services and uses isolated SQLite for the real store, CLI and RPC handlers. Checks cover automatic CLI context, human UI null, JSON reads, atomic todo refusal through update and board move, direct store guards, combined task blockers, archive/unarchive/deletion, startup recovery, missing-thread classification, lookup failure, stale and overlapping SDK replies, disposal and cursor invalidation.

The migration check simulates a pre-13 schema. It verifies single, duplicate, multiple, missing, mixed-case and malformed source references, one-time execution, exact description bytes and skipped-task reports. Existing comment-removal and offline-import regression assertions remain intact, with the additive creator column and schema version 13 included.

The browser fixture renders the production task panel. Task RPC and lifecycle events are explicit transport substitutes. It proves metadata at 1280px and 390px, visible refusal naming the creator, unchanged fixture storage, Retry after archive, and metadata refresh after unarchive. The real refusal transaction is verified separately in the SDK/SQLite checks. A refused detail save retains an unsaved draft and a retry banner, consistent with existing autosave behavior.
The board fixture also performs a pointer drag to todo, verifies the error naming the creator and unchanged storage, then archives the creator and completes the move from the keyboard. This covers the board error path found by review.

Intermediate checks found expected schema-version assertion changes, a Node import-resolution issue, a post-disposal read, and a test-helper type mismatch. Each was corrected. No assertion was skipped and no dependency was upgraded. Cursor-only deslop and Comment Sicko were unavailable. The independent review covers unnecessary code, comments and suppressions instead.

The complete raw run directories and intermediate failure logs remain in `/Users/koen/.bb/thread-storage/thr_9e6riv42k5/bbp316-raw.NHDLtc`. The committed logs, screenshots and traces are the portable subset. The design context loader reported a stale design sidecar. It was left unchanged; the document command can refresh it in separate work.

## State and cleanup

| Resource                                | Final state                                                             |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Desktop plugin source and enabled state | Not changed by this run                                                 |
| Runtime settings and credentials        | Not inspected or changed                                                |
| Build toolchain data                    | Isolated under an owned temporary BB_DATA_DIR, removed after build      |
| Browser listener                        | Strict port 4193 owned by the fixture run, no listener after teardown   |
| Browser profiles and records            | Owned ephemeral Chromium contexts only, no sign-in or installed records |
| Historical BBP-53 evidence              | Unchanged by SHA-256 comparison                                         |
| BBP-319                                 | Intentionally retained backlog task, blocked by BBP-316                 |
| BBP-316                                 | In review, linked to this work thread and open PR #313                  |

Migration 13 is code only until a separately approved activation. A consistent backup and explicit deployment approval are required before running it against existing data. MCP policy and tools are unchanged.

## Publication

[PR #313](https://github.com/koenvg/bb-plugins/pull/313) is open and is not a draft. BB Tasks independently returned the same PR link for BBP-316. The implementation and executable evidence were committed as `6f167fec2c8878c3e06d8a29165b5a5e1883b11e`. The final publication update changes this report only.

GitHub CI was queued or running at the publication check. No CI pass is claimed. Auto-merge was null. The PR remains open for human review. GitHub CLI was used because no built-in PR tool or Origin executable was available.
