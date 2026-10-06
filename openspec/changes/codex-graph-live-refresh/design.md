# Design

## Context

See `proposal.md` for the problem and scope. A design is needed because the fix crosses frontend lifetime, host RPC, mutable storage, and privacy rules.

Read-only inspection on 2026-10-06 found collector events through 12:40 UTC, but the compact database's newest event was 2026-10-05 at 21:16 UTC. The current day's calendar result had no accepted usage. These observations identify a missing indexing step, not failed collection or proof of complete capture. No live reconciliation was run during investigation.

The relevant paths are:

- `src/history/calendar/report-preparation.ts` owns visible-page continuation and retries.
- `src/history/report-preparation-host.ts` accepts identity batches and reconciles retained identity, but does not ingest collector logs.
- `src/history/identity/identity-server.ts` declares settlement from discovery and attribution alone.
- `src/history/history-maintenance.ts` invokes `reconcileCollector`, but also performs management, retention, recovery, and log pruning.
- `src/history/calendar/calendar-host.ts` opens a read-only report snapshot.
- `src/history/history-host.ts` serializes all history work through actual completion.
- `src/selection/selection-store.ts` publishes time only when quota has a snapshot or its status changes. Calendar preparation currently depends on that time.

`docs/CALENDAR.md` explicitly excludes ingestion from report preparation. This design changes that documented boundary. The pending `codex-usage-history` specs already call for incremental ingestion during ordinary history use. Their older reporting and layout descriptions differ from current code. Do not restore their old chart controls or edit that change as part of this fix.

## Goals / Non-Goals

**Goals:**

- Hide ingestion ordering and storage progress behind the existing report-preparation interface.
- Prove that events appended after page activation reach actual retained graph totals with management closed.
- Keep graph freshness and preparation scheduling independent of allowance data.

**Non-Goals:**

- Calling mutable readiness from the graph, or moving management side effects into preparation.
- Installing or changing a collector, reading transcripts, starting imports, changing retention, or repairing databases.
- Changing chart metrics, date rules, prices, identity policy, storage schema, or the quota refresh owner.
- Deployment or mutation of the installed host's usage data during implementation verification.

## Decisions

### 1. Extend report preparation, not calendar reads or management

Keep the existing `reportPreparation` frontend/server operation. Add ingestion of existing collector logs to `prepareHostReport`, before retained identity reconciliation. Use `withRetainedHistory` to require an existing safe schema-4 index and valid control state. Reuse `reconcileCollector` and the normal projection rules; do not add another parser or usage identity rule.

Use the existing host queue for the complete operation. Cancellation releases the caller, not the database queue. Check the signal before file work and between phases. An unavailable or incompatible index is a stopped preparation result, not permission to migrate, recover, or create storage.

`withRetainedHistory` currently closes its connection when a synchronous callback returns. Extend its callback lifetime to await asynchronous work before closing. Its read-only report caller must keep the same behavior. Verify with a held synthetic file read that the connection and history queue stay owned until ingestion finishes, including cancellation.

Reject calling `historyReadiness` from the page because it couples ingestion to retention, legacy retirement, recovery, and pruning. Reject ingesting in `calendarReport` because date navigation and chart reads must remain read-only. Reject a background host service because the approved scope is visible-page refresh.

### 2. Include ingestion in pending status and progress

Extend the host preparation result with a required bounded ingestion-pending field. The server's pending decision must include ingestion backlog, discovery/delivery, and retained identity backlog. Missing or malformed new host fields produce `unsupported`, not false settlement; deploy server and host artifacts together.

The host progress digest must include durable collector source progress and ingestion backlog as well as identity receipts. Read only bounded scalar cursor/status data for that digest. Never expose source bodies or raw identifiers through browser progress. Identity reconciliation follows ingestion so new records enter the same attribution flow as existing records.

Retain the ingestion limits of at most 500 source lines and 8 MiB per request, including confirmation records. Retain bounded identity discovery, delivery, and reconciliation. A preparation round uses sequential 250 ms continuations, not concurrent requests. Preserve the existing stop policy: three consecutive transport failures, three unchanged progress responses after the first response, or 2,048 requests. Reaching a cap means stopped, not settled.

Settlement means no remaining work found by the bounded preparation phases. It does not certify complete capture or that a concurrent writer cannot append again. New appends are picked up on the next round. Paused collection may drain existing recorded logs without changing its control state. Import-only storage with no collector logs remains readable.

### 3. Give the visible graph its own time source

Use a page-owned wall-clock source with a testable clock/timer adapter. It drives preparation deadlines and chart-age display without consulting quota snapshots. Keep one sequential preparation owner per mounted graph. Do not change the account refresh store merely to publish graph time.

Start on visible activation; after settlement schedule the next round for 60 seconds later. Clear queued timers on hide, selection change, unmount, and disposal. On visibility return, recalculate age and start at most one due round. An interrupted initial or pending round can resume through its durable cursors. A stopped round waits for explicit Retry preparation; focus alone does not reset the stop limit.

Keep date selection and metric changes outside the preparation key. These actions do not start another round. A preparation settlement increments the existing revision to reload the currently selected chart range once. Timer suspension must not create a burst of catch-up reads.

### 4. Keep status separate from report observation time

Keep usable same-selection graph values visible while preparation runs. Preserve the preparing and stopped messages and Retry preparation. A new calendar observation time says when the retained index was read, not when all collector events were indexed. Pending or stopped preparation must remain visible even when a chart read succeeds.

Do not change the DTO's recorded totals, captured prices, missing-value rules, or coverage claims. A current-day record remains a partial subtotal. No account call or second quota owner is introduced.

### 5. Verify through the real storage and page interfaces

Add a regression using a temporary configured schema-4 database and synthetic collector logs. Append valid event and confirmation records after the first report, prepare through actual host handlers, and prove the next report includes original token and cost values exactly once. Force more than one ingestion batch and hold identity state settled to prove ingestion alone keeps preparation pending.

At the public SDK page interface, keep management closed, make quota unavailable, advance an independent clock, and prove automatic graph reload after preparation. Retain tests for same-selection values, stopped status, explicit retry, hidden/unmounted cancellation, selection races, no navigation-triggered preparation, and no management or account calls. Packaged checks must exercise the self-contained host artifact with temporary SQLite, not just mocked status DTOs.

## Risks / Trade-offs

- More graph-open I/O. Mitigate with existing byte/line limits, unchanged-source skipping, sequential requests, and visible-page lifetime.
- Continuing collector writes can prevent settlement. Keep the absolute round cap and show stopped preparation; never turn a backlog into a complete-history claim.
- Partial or invalid source data can stall. Preserve source diagnostics and coverage uncertainty, and expose a stopped/retry path rather than spinning.
- Incomplete migration or ownership state can block readable totals. Return a bounded unavailable or pending status and leave management-only repair/backfill in management.
- Cancellation cannot retract frontend RPC already dispatched. Ignore late page results and retain serialization until host work actually finishes.
- Synthetic proof does not establish live capture or billing. Report those limits and request separate approval before live ingestion or deployment.

## Migration Plan

No database, collector, or dependency migration is planned. Build and test the complete package before deployment. Update `docs/CALENDAR.md` to describe ingestion in visible preparation while keeping controls, recovery, imports, and pruning in management.

Only after separate approval, retain the previous package snapshot and install or reload a complete durable package using the existing BB workflow. Confirm installed source and status, reselect the host after reload, and check that already-recorded new usage reaches the graph with management closed. Do not generate billed model turns for acceptance. Roll back to the previous complete package if needed; never delete logs, indexes, settings, or collector controls to roll back.
