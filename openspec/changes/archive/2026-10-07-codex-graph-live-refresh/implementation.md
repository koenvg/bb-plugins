# Implementation handoff

## Result

The visible graph ingests existing collector records before identity reconciliation, then reads retained values. Its next preparation round starts 60 seconds after settlement, independently of quota availability. Calendar reads remain read-only. Usable same-selection values stay visible during preparation; stopped preparation needs explicit retry.

Review baseline: `bcc16b4e3e3078eb2dde0998fb7779d1a513162e`.

## Changed interfaces

- Host preparation returns required `ingestionPending`. Server validation rejects older or malformed results instead of claiming settlement. Deploy matching server and host artifacts together.
- Preparation reuses canonical bounded ingestion, durable cursors, projection and identity reconciliation. The progress digest includes bounded source cursor data, not event bodies. It does not call history management.
- Retained-history callbacks can be asynchronous. Storage and the history queue stay owned through actual completion, including caller cancellation.
- The graph has its own preparation deadline and visible-page age clock. Selection changes and disposal reject late results; hiding stops new work; resume starts at most one due round.

## Explicit storage upgrade

Approved live acceptance found an older schema-4 index without `identity_uncertain`. The old layout check accepted it, allowing ingestion before identity reconciliation failed. The initial package deployment was rolled back without deleting newly indexed records.

The separately approved BBP-167 follow-up adds a complete retained-layout check and an explicit offline upgrade. Graph preparation rejects the older layout before mutation. The operator command inspects by default and requires explicit apply with a new private SQLite backup outside the actual history directory. It adds only the known missing table/index and conservative identity markers, then advances the identity revision. Fresh positive ownership evidence can clear those markers through normal bounded preparation.

Recorded values, original dates, captured prices, exclusions, relationships, collector cursors, controls and logs remain unchanged by upgrade. Unsupported layouts are not repaired. Current storage is a no-op. Transaction failure or cancellation rolls back the upgrade.

Procedure and limits: `bb-plugin-codex-quota/docs/STORAGE_UPGRADE.md`.

## Verification

Runtime: Node `24.15.0`, Bun `1.3.14`, BB `0.45.0`, Plugin SDK `0.6.15`.

- All 700 tests in 65 files passed after the final code fix.
- Typecheck, `bb plugin types --check`, lint, format check, build and the full packaged suite passed.
- The packaged check indexed 501 synthetic confirmed events in three bounded batches and passed artifact reload and replay checks with original dates, tokens and prices preserved.
- The shipped upgrade command passed read-only inspection, backup-required apply, private-file and existing-file protection, nested symbolic-link ancestor rejection, idempotency and post-upgrade preparation settlement.
- Python preview resource tests passed, 11 tests.
- Desktop and 375-pixel browser checks passed for the earlier graph change: 26 calendar width/state cases and 20 money cases. This storage-only follow-up did not rerun those browser suites.
- Strict OpenSpec validation and `git diff --check` passed.

Initial verification found outdated timer assertions, a missing scanner allowance and stale frozen-date browser fixtures. These were corrected. There are no unresolved check failures. No separate pristine-baseline test run or Node 22-specific run was made.

## Review

The live-refresh implementation received one fresh read-only completion review, with no blocking findings. The separately approved storage-upgrade implementation received its own single completion review.

The latter review found a P2 backup-path defect: a nested symbolic-link ancestor could put a backup inside history. The fix resolves existing ancestors and the actual history directory before creating backup directories. Shipped-command regressions require rejection without backup, directory creation or index mutation. They failed before the fix and passed afterward. All affected verification was rerun. No second review pass was run.

Detailed receipts, private deployment paths and database backups remain in local thread storage and private backup storage. They are not part of this change.

## Approved live acceptance

A complete independent package snapshot passed its packaged checks and was installed after explicit approval. The operator command made a private, consistent SQLite backup and upgraded the existing index. The backup matched the original logical database; all original tables were preserved except the planned identity receipt update.

Live preparation settled after 201 bounded requests. The first manual check stopped at its 150-request acceptance cap while meaningful work remained. Continuation with `refresh:false` finished below the production 2,048-request limit. The installed calendar report then contained current-day recorded usage with no identity or ingestion backlog. Original immutable values, exclusions, collector control and existing log prefixes were verified unchanged. No collector settings or roots were changed and no billed model test turns were started.

These checks prove installed backend preparation and graph report data. The rendered native screen and its 60-second timer were not observed directly. Current-day capture remains incomplete and pricing remains partial. Settlement does not prove complete historical capture or billing.

BBP-166 remains a separate historical-partition discovery issue. The aging inventory cursor advances through pruning in management; preparation does not discover every older partition independently. No historical-discovery cleanup was implemented here.

## Deployment and rollback

Install a complete tested snapshot in a durable directory with its own dependencies and matching frontend/server/host artifacts. Do not install from a disposable worktree. Use the local-path installation procedure in `bb-plugin-codex-quota/docs/ARCHITECTURE.md`; do not uninstall to move sources.

Keep the previous complete package and private pre-upgrade backup. Reselect the host after installation and verify bounded preparation, recorded values and partial coverage with history management closed. Live application requires owner approval and must not change collector settings, repair arbitrary storage, import transcripts or generate billed model turns.

If package acceptance fails, restore the previous complete package. Do not delete logs, indexes, settings or controls. Do not automatically restore an older database after new records have been ingested. OpenSpec archival is not part of this handoff.
