# Combined host storage (BBP-16 integration)

This combines reviewed identity/import work at `11be5e0c04a5d9c5631e4626a9a4c5bf319ffb77` with retention commits `b7b7a46db5518f635dceb02ff7bc8d9d6b618a94` and `856410f63657c03672f62ab665a2c42d6788b554`. Their history stays intact. BBP-23 remains done. This document does not certify the full epic or live installed use.

## One schema owner

`initializeHistory` owns the transactional migration to **schema 4**. It checks the supported version and base layout before mutation. It initializes retention, writer observation, identity and import together, then publishes `user_version=4` last.

- Schema 1: resumable, bounded compact ownership backfill. Supported additive identity/import layouts keep their configuration and receipts.
- Schemas 2 and 3: keep compact rows, original ownership, cutoffs, completed cursors and scalar values. Reset only the bounded identity projection backfill.
- Frozen import roots, generations, cursors, omissions and cancellation state stay unchanged. Reload does not start transcript work.
- Readiness and import share header, journal-mode and version-specific layout checks. Required tables and ownership singletons must exist before writable access. Newer, partial or foreign layouts stay unchanged. WAL-mode files are refused before SQLite access, even if their sidecars are absent or empty. Only a confirmed owned corruption diagnosis permits quarantine.

## Ownership, retention and identity

`src/history/collection/usage-evidence.ts` supplies content-free scalar proofs. New proofs compare canonical original values separately from optional claims, file keys and capture provenance. Historical opaque proofs still support schema-2/3 overlap. First confirmed entry ownership, original host/workspace/time/tokens/cost and existing proofs are not rewritten.

Replay uses retained compact evidence, not expired detailed payloads. Verified fork ancestry remains necessary. A matching copy does not add usage or restore expired classes. Imported first ownership stays imported; independently observed overlap can mark writer activation without changing ownership. Import admission cannot mark live activation, even when an input claims observed provenance.

Unconfirmed observed overlap is checked at the canonical compact admission boundary through an indexed session lookup. Detail expiry cannot make an unresolved copy safe to import.

Identity resolves retained compact rows after detail expiry. Compact expiry removes numeric identity rows while relationship and entry evidence remain. Identity resolution and import work wait for incomplete compact ownership backfill. Import-only readiness/status checks perform bounded storage maintenance without enabling capture or reading transcripts.

Coverage remains host-local and scoped. Imported records are not live-observed evidence. Indexed existence checks distinguish their provenance. Pauses, recovery intervals, migration/reconciliation backlog and source uncertainty prevent a false certified zero. The bounded import adapter consumes frozen scope, committed unfinished/canceled progress and actual omission counts from the same durable import ledger. Empty imports remain uncertain. Unlocated omissions affect every scope; known workspaces and nonoverlapping dates constrain other evidence. Internal calendar totals remain an integration seam; no calendar chart or monetary UI is added.

## Recovery and delivery

Recovery rebuilds only retained observed collector records within the detail window. Imported-only and compact-only loss remains a disclosed gap. It does not discover transcripts, resume an import, enable capture or infer stopped writers.

If host recovery loses its identity receipt while the server retains an acknowledged catalog cursor, the host rejects the partial restart without hiding storage health. Unknown attribution asks the server to reset only that host/generation delivery cursor. The next bounded request sends the unchanged catalog from offset zero. Its fingerprint and generation remain unchanged; no extra metadata refresh is necessary. Request cancellation still runs immediately before dispatch and after return.

Protocol-2 fencing, fresh paused stopped-writer consent and all BBP-23 legacy retirement checks remain required. Quiet files, repair, installation or a new event are not stop proof.

## Isolated checks

All database work uses persistent temporary SQLite. Source files, agent folders, credentials and metadata are owned synthetic fixtures. No installed source, real transcript, real account or billed turn is used.

- `src/history/storage/storage-integration.test.ts`: schema-1/2/3 migration/reopen, protected layout/header/WAL cases, compact replay and identity expiry, import backfill gating, independent observation, observed-only recovery and import-only retention.
- `src/history/storage/storage-delivery.test.ts`: public SDK host harness plus persistent server storage, recovery/redelivery, stable catalog fingerprint/generation, unchanged metadata call count and quota isolation.
- `scripts/check-prior-schema3.mjs`: verifies the exact old artifact hash, creates actual combined schema 4 through packaged handlers, and proves old readiness/repair reject it before database open. Database, control, WAL/SHM and owned agent files remain unchanged.
- Existing history, identity, import, live-overlap/fork, FIFO, OAuth and activity bundle proofs remain. The schema-1 overlap fixture retains its original scalar and owner assertions and now exercises the real combined migration.
- `scripts/check-storage-preview.py`: 28 desktop/375px combined states, including recovery, incompatible storage, legacy phases and frozen/completed/canceled import. Keyboard access, thread navigation, quota, official link and overflow are checked. Scoped plugin CSS and theme are present.
- `scripts/check-storage-integration.mjs`: actual packaged partial-schema/singleton and absent/empty WAL non-mutation, plus compact-only unconfirmed overlap exclusion after import/reopen. The exact pre-review artifact reproduces the three failures.

The single integration review requested changes for four P1 findings. The worker fixed them with targeted persistent and packaged regressions. No second review or independent post-fix approval is claimed.

Node 22 SQLite remains experimental. Physical pruning can lag bounded pending work. Cancellation cannot undo a committed host action. Installed-source switching, real capture pause, existing-data recovery and live acceptance remain parent-owned approval gates.
