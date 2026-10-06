# Explicit identity storage upgrade

Normal graph preparation now checks the complete identity layout before it writes metadata or ingests events. Older schema-4 databases without `identity_uncertain` are rejected. The graph does not repair them.

The offline upgrade is limited to that known older layout. It adds the missing table and index in one transaction. It preserves recorded events, original dates, tokens, captured prices, exclusions, collector cursors, relationships, controls and logs. It marks older thread links uncertain and advances the identity revision. Fresh positive ownership evidence can clear those markers through normal bounded preparation. Thread grouping can be temporarily less specific; workspace totals remain unchanged.

Other incomplete, malformed, newer, unfinished-backfill or WAL-mode storage is not repaired. Missing storage is never created. Already-current storage is a no-op. Cancellation or failure during the transaction rolls back the whole upgrade.

## Operator procedure, approval required

Use Node 24 or later and a complete built package. Do not run this against live storage until the owner approves the upgrade. Close the graph and history management during backup and apply. Do not pause collection or change settings for this operation.

Inspect without mutation:

```sh
node scripts/upgrade-identity-storage.mjs --data-dir /absolute/plugin/host-data
```

`ready` means the known older layout was found. `current` means no upgrade is needed. `unavailable` means stop; do not delete storage or attempt a broader repair.

Apply only with explicit approval and a new private backup path outside the history directory:

```sh
node scripts/upgrade-identity-storage.mjs --data-dir /absolute/plugin/host-data --apply --backup /absolute/private-backups/before-identity-upgrade.sqlite
```

The command takes a consistent SQLite backup before apply. It never overwrites an existing backup. The backup directory must be private and not a symbolic link; the file uses mode `0600`. The command resolves existing ancestors before it creates directories. A nested alias into the actual history directory is rejected before backup or upgrade. Apply rechecks the layout under the SQLite write lock. The result must be `upgraded` or `current`; `unavailable` is not success. Keep the backup private. Do not automatically restore an older index after new records have been ingested.

After the approved upgrade, install the complete matching frontend/server/host package using the local deployment procedure in `ARCHITECTURE.md`. Reselect the host, let preparation finish, and check recorded values and partial coverage. Do not infer complete capture or billing from a successful preparation round.

## BBP-167 verification

Public retained-preparation tests prove that the missing-table layout is rejected before metadata writes or source reads. Temporary SQLite tests cover read-only inspection, transaction rollback, cancellation, replay, preserved stored tables and controls, import-only storage, unsafe layouts, and conservative attribution followed by fresh verification. The packaged live-refresh check runs the actual shipped command against owned temporary storage, proves private backup and existing-file protection, then reaches settled preparation with unchanged report totals.

The automated checks use synthetic storage. A separately approved live run then backed up and upgraded the existing database, installed a complete package, and reached settled preparation. Original recorded values and collector controls were verified unchanged. Current-day coverage and pricing remain partial. The rendered desktop screen and its 60-second timer were not observed directly. See the thread deployment handoff for evidence and current installed source.
