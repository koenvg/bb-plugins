# BBP-63 completion review

Source merge is acceptable. BBP-63 is not complete until the approved installed checks and paired measurements pass.

## Scope and verdict

Reviewed the working tree against `ad329bec00731709a85fe69312e4fe87a54731b9`, including all eight untracked files. Read the global review skill, the supplied spec/design, and the three implementation contracts. No source or test files changed. No commits, task changes, installs, restarts, or browser use occurred.

No blocking source findings. The new stores keep request identity, retention, and invalidation inside session-owned modules. Selection and writes remain with their existing owners. `views/detail/index.tsx` grows from 645 to 673 lines; no changed source file crosses 1,000 lines. I found no clear structural regression that requires decomposition before merge.

## Non-blocking finding

- **P3: The fallback inventory lifetime does not survive effect replay.** `bb-plugin-tasks-plus/shell/task-data.tsx:114-126`, `useSessionData`, disposes its memoized local store immediately during effect cleanup when no `TaskDataProvider` exists. React Strict Mode then repeats setup with that same disposed store. `createTaskInventory.load` refuses further work after disposal. This can leave outside-provider inventory consumers without data. The provider path correctly delays disposal at lines 93-107. Use the same replay-safe lifetime rule for the fallback, or require a provider and remove the fallback. This does not block BBP-63: the shipped Tasks page and thread detail entrypoints reviewed here use the provider. Current Strict Mode coverage exercises that provider path, not the fallback.

## Acceptance evidence from source

- `shell/task-previews.ts`, `load` and `publish`, reuse normalized matching data, share same-key requests, reject wrong-key responses, and enforce both 32 entries and 2 MiB of UTF-8 task JSON. Eviction prefers unselected LRU entries. Oversized active reads are not retained.
- `invalidateKeys`, `invalidateTask`, and `canPublish` revoke old requests. `shell/task-data.tsx`, `TaskDataProvider`, connects task/project events and the refresh generation. Disposal also revokes publication.
- `views/detail/index.tsx`, `TaskDetail` and `DetailQuery`, retain keyed form ownership, overlay drafts, label stale matching data, and preserve guarded absence handling. Successful writes revoke reuse silently; surviving forms request revalidation after pending edits finish.
- `shell/browse-workspace.tsx`, `readyKey`, removes the extra settled-order readiness pass. `shell/ticket-panel.tsx`, `useOpenTicketPanel`, skips host reveal only for the same controller and a connected, visible owner. Hidden or uncertain cases still call the host.
- Shared project/label/preset inventories do not replace thread or PR queries. Adjacent warming is absent, as required for BBP-63. Later dependency/activity slices are outside this review.

## Validation

Personally ran:

- Focused preview/inventory/browse tests: **4 files, 25 tests passed**.
- `git diff --check`: passed.
- Fixed-point diff, full untracked status, and staged-file inspection: reviewed; no staged files.

The first focused-test command ran at the repository root and failed because that package has no test script. The corrected command ran from `bb-plugin-tasks-plus` and passed.

Parent-run logs confirm 119 files and 1,230 tests passed; typecheck, build, benchmark tooling tests with 19 passes, and lint with four reported pre-existing warnings. I did not repeat those full checks.

## Required acceptance gaps, not source defects

- No approved installed after-run exists for this diff. The 100 ms warm p95 target, blank intervals, native host screenshots, compact layout, and runtime work/request measurements remain unproved.
- The A-B-A test checks matching content after DOM changes, but its observer only records blanks when A's title exists. It cannot prove every accepted-route presentation frame is non-empty. The unchanged editor also initializes in a passive effect. Installed frame-aligned evidence must cover this interval.
- The SDK fixture shares one controller environment. Confirm controller matching and reveal suppression across the actual separate page and native Ticket trees, including tab switching, closure, parking, reveal-before-save, Enter/Escape, and failure recovery.
- Recheck installed source/bundle identity before measurement. The installed Tasks checkout is separate. Keep quota enabled and unchanged, use the paired fixture/protocol, and classify cold, invalidated, evicted, rapid, and save-pending movements separately.

**Merge verdict:** approve source merge, with the P3 note above. Hold task completion and any performance claim until operator-approved installed acceptance evidence passes.
