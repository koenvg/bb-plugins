# BBP-23 shared-schema handoff

BBP-23 owns retention and safe recovery. This document is guidance, not a combined integration result. BBP-22 commit `11be5e0c04a5d9c5631e4626a9a4c5bf319ffb77` was inspected read-only. Its files were not merged here. Parent BBP-16 owns that work.

## Version and migration

This slice advances `HISTORY_VERSION` to **3**. Versions 1 and 2 remain supported migration inputs. Version 1 gets the bounded compact backfill. Version 2 gets the legacy-pending table without a new backfill. The only addition since the schema-2 checkpoint is `history_legacy_pending`; retirement filesystem receipts are independent of SQLite.

BBP-22 still checks `user_version === 1` in `src/history/history-host.ts`; `src/history/storage/history-projection.ts` publishes version 1, and `src/history/import/import-host.ts` has its own version guard. A plain cherry-pick cannot safely replace these paths. Consolidate every guard and migration before using the combined artifact. Prefer a new combined version, such as 4, that explicitly accepts existing versions 1/2/3 and both schema-1 table sets. Do not downgrade this slice's version or reset existing tables.

Preserve the schema-2 compact, tombstone/entry replay, retention/backfill, coverage/reconciliation, recovery and immutable host-ownership state, plus schema-3 legacy pending. Add BBP-22's `history_writer_observation`, identity tables/triggers and `import_*` tables through the same migration owner. Update storage header/WAL checks, recovery metadata and fixtures together. Unsupported versions must remain untouched before writable access.

## Observation, replay and attribution

- BBP-22 adds `provenance: observed | imported`. Preserve it in compact backfill and ingestion. Imported rows and import coverage must not prove collector activation or observed inactivity. Do not replace BBP-22's independent writer-observation table with a count of all accepted events. An already-observed writer remains observed after detail expires.
- Keep immutable `recorded_host`, original captured workspace/UTC instant/cost, and first confirmed session/entry ownership. Optional verified-thread metadata is separate. Consolidate identity triggers/backfill with compact-only rows; a trigger that sees only `usage_events` cannot attribute rows after detailed expiry.
- Merge BBP-22's provenance-independent replay comparisons with BBP-23's canonical digest and first-owner guards. A change in provenance alone is not contradictory scalar evidence. Import or replay must not restore compact values after expiry, change original cost/workspace, or clear conflicts.
- Keep `readCoverage` as the single scoped authority. Feed typed import coverage/omissions through it. Do not let an import clear ordinary reconciliation uncertainty or legacy pending. Legacy-only tail reconciliation deliberately does not clear the global source backlog.

## Collector control and recovery

Keep the **protocol-2 collector asset/control fence** and UUID revision. Reinstall, repair or resume must not publish protocol 1. Preserve BBP-22 import actions alongside `prepare-legacy` / `retire-legacy` and the typed explicit confirmation. Do not substitute import completion, installation, repair or a new record for stopped-writer consent.

Recovery reads retained observed collector sources only. Lost imported or compact-only history stays a gap unless a separately authorized import can rebuild it. A paused rebuild retains its conservative open pause. A retirement in progress must index retained sources again after recovery before filtering confirmation bodies.

Run combined real-SQLite migration/import/replay/retention/recovery tests on versions 1/2/3, mixed observed/imported duplicates, compact-only attribution, missing control, pending/blocked retirement, and reopen. Repeat Node 22/24 packaged fixtures, full tests, typecheck, SDK check before builds and UI checks. Neither this handoff nor the isolated fixtures prove installed acceptance; BBP-25 and any live test remain parent-owned.

Source task: BBP-23. Source thread: [BBP-23 worker](bbthread://thr_w8pz8n8azv).
