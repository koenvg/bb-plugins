# Tasks

## 1. Bounded host preparation

- [x] 1.1 Add a public host-interface regression with real temporary SQLite and synthetic collector event/confirmation logs appended after the first report. Verify the old preparation path fails to advance the graph while no management request runs.
- [x] 1.2 Extend retained-history callback lifetime to await asynchronous ingestion before closing storage. Verify held-file-read, cancellation, and queue tests prove the connection stays open and later history work cannot overlap it; existing read-only calendar tests still pass.
- [x] 1.3 Add bounded existing-log ingestion before identity reconciliation in host report preparation, reusing current parsing, projection, and durable cursors. Verify new original tokens and captured prices appear exactly once, a backlog exceeds one request safely, and unchanged logs require no body read.
- [x] 1.4 Add required ingestion-pending status and ingestion cursor progress to host preparation results and server settlement logic. Verify ingestion-only backlog remains pending with identity already settled, progress changes across batches, and malformed or older host results fail closed rather than reporting settlement.
- [x] 1.5 Add host/routing cases for paused collection, import-only storage, missing or incompatible history, malformed or incomplete log records, replay, confirmation ordering, logical expiry, and new unpriced current-day usage. Verify no collector control, import, migration, recovery, pruning, transcript read, or price recalculation occurs and unknown coverage stays unknown.
- [x] 1.6 Update the storage and preparation sections of `docs/CALENDAR.md` and the relevant history architecture description. Verify they explain bounded visible-page ingestion and async connection lifetime while keeping management-only side effects and read-only calendar reads separate.

## 2. Visible graph lifecycle

- [x] 2.1 Add a public SDK app regression with collection management closed, unavailable quota, and an independent synthetic clock. Verify the current quota-dependent preparation clock fails to start the next graph round after 60 seconds.
- [x] 2.2 Give the graph page its own testable clock and sequential preparation schedule, starting on visible activation and 60 seconds after settlement. Verify no quota snapshot or extra account request is needed, each settlement reloads the current graph range once, and extra views do not create another preparation loop.
- [x] 2.3 Preserve durable continuation and stop limits, with explicit Retry preparation. Verify progressing batches continue, unchanged progress and repeated failures stop within bounds, the absolute request cap stops safely, and visibility/focus alone does not restart a stopped round.
- [x] 2.4 Add lifecycle tests for hiding, resume after timer suspension, queued close/unmount, plugin disposal, and host changes before and after dispatch. Verify no new hidden-page work, no catch-up burst, immediate removal of previous-host values, and rejection of late results without claiming dispatched host work was undone.
- [x] 2.5 Keep usable same-selection values visible during preparation and show pending/stopped status independently of chart observation time. Verify a successful index read cannot hide failed ingestion, graph age advances without quota, date navigation remains read-only, and metric changes remain local.
- [x] 2.6 Update the usage and preparation sections of `docs/CALENDAR.md` with the independent visible-page cadence, preparing/stopped states, retry behavior, and limits. Verify the documented UI labels and actions match the public SDK tests and do not promise complete collection.

## 3. Package integration and handoff

- [x] 3.1 Extend the packaged history/calendar checks to append synthetic collector data and call the actual built host preparation handler before rereading the calendar. Verify a multi-batch update, replay, reopen, original captured values, and no management calls using only owned temporary storage.
- [x] 3.2 Run the full package tests, typecheck, `bb plugin types --check`, lint/format checks, build, and `npm run test:bundle`. Verify all affected checks pass and record runtime versions, any baseline failures, and synthetic-only evidence limits.
- [x] 3.3 Produce a short implementation handoff with changed interfaces, test results, a complete-package deployment/rollback plan, and the installed source left unchanged. Verify no live ingestion, billed model turn, collector setting change, or installed-plugin replacement occurred; request separate approval for any later live acceptance.
