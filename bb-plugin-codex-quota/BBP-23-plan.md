# BBP-23 implementation plan

## Baseline and limits

- Baseline: `70f0ab2b5b7a8d7338378125a91b96a348f783b3`. Initial worktree clean.
- Branch: `bb/bbp-23-retention-and-storage-recovery-thr_w8pz8n8azv`.
- Thread: `thr_w8pz8n8azv`. Environment: `env_8ri6hgfxij`.
- BBP-18 is the only native blocker and is done. BBP-23 attached and in progress.
- Read the approved change, delta specs, package docs, BBP-18 handoff and its original completion review through Tasks. No installed acceptance is inferred.
- All writes and failure tests use owned temporary fixtures. No live install, source change, session restart, account change, transcript read or quarantine is permitted.

## Public test interfaces, recorded before tests

Keep `HostHistory.read` and `HostHistory.control`. No public table or maintenance commands. Internal adapters accept the clock, database factory, bounded budgets and fixture evidence. Test real persistent SQLite through `openHistoryDatabase`, including reopen, transaction rollback, migration and interrupted resume.

Add an internal compact query interface with bounded UTC interval, workspace and optional verified thread scope. It returns local-day token totals, original captured priced-subset values, explicit detail availability and coverage. BBP-20/21 own full report and money presentation. BBP-19 owns verified thread discovery. Store its optional verified link separately from recorded workspace, host-local ownership and replay identity. Never derive a thread from a claim.

Coverage fixtures supply typed scoped interval evidence: writer activity, reliable inactivity, imported coverage, pauses, omissions and uncertainty. No transcript importer is added. Installation and the presence of events do not certify continuous activity.

## Storage design

Schema 2 adds an original-UTC compact projection, digest replay evidence, durable retention/backfill state, scoped coverage and recovery state. Migration and expiry run in bounded transactions. Preserve ranked workspace totals and counters atomically. Retention cutoffs advance monotonically; accepted event and entry evidence prevent replay resurrection. Expired token classes return unavailable, not zero.

The single completion review found four coverage/boundary defects. Fixes centralize scope and canonical interval validation in the internal coverage resolver, add durable reconciliation uncertainty, include broader negative evidence and retain a conservative open pause after paused recovery. Schema 2 includes `history_reconciliation` and bounded-source lookup indexes. No public history method changes.

Detail expires after 45 days. Compact expiry starts three UTC calendar months before today, with nine extra support/margin dates. Queries regroup original instants for any valid viewer timezone. Capture cost is immutable and missing prices remain missing.

Only SQLite corruption/not-a-database codes or a failed integrity result confirm corruption. Preserve unsupported versions before integrity or writable access. Quarantine only fixed database/sidecar names after safe path checks. Use a durable recovery receipt; reconstruct from retained collector sources, never transcripts. Mark the retained horizon incomplete, including older compact-only dates that cannot be rebuilt. Missing capability, IO, permission and control failures do not trigger quarantine.

## Management layout

Keep quota, countdown and official link unchanged. Keep readiness and bounded workspace totals in place. Add a collapsed storage-health disclosure under readiness, with health, retention cutoffs, pending bounded work and recovery gaps. At 375px, text and controls wrap with no page-wide table. Inspect early synthetic desktop and 375px screenshots before the complete UI matrix. No calendar chart is added.

## Completion gate

Run focused/full tests, typecheck, SDK compatibility check, synthetic bundle proofs, Node 22 packaged fixtures, strict OpenSpec and final build in order. Run exactly one fresh-context read-only global code review against the baseline, including untracked task files. Fix blockers and rerun affected checks. Commit only BBP-23, no push, and leave a clean worktree. Attach safe receipts and a child handoff. Live acceptance remains blocked on approval and belongs to BBP-25.
