# Retention and storage recovery

## What remains available

The selected host owns its history. Quota and account activity use separate code and caches. A history error does not disable quota, its footer, countdown or official usage link.

Detailed events expire after 45 rolling days. New collectors write daily UTC log partitions. A partition can expire after its whole date is older than the 45-day cutoff and its stable contents have been indexed. Backlog or an interrupted maintenance cycle can delay physical removal. Use **Check readiness** to continue bounded work. There is no background history timer.

Compact records retain the original UTC instant, total tokens, original positive captured cost or missing-price state, provenance, immutable captured workspace and original storage-host key. They retain usage UUID, Pi session/entry replay evidence and optional verified thread metadata. The storage-host key is an immutable host-local UUID, not today's account or an inferred BB thread. The selected enrolled host remains the RPC scope. Claims are not verified links.

Compact retention starts three UTC calendar months before today, with seven support dates and two timezone-margin dates added. Month-end subtraction clamps to the last valid date. For example, at 1 October 2026 the compact cutoff is 22 June 2026. Maintenance cutoffs only advance. A clock rollback cannot restore expired records.

Original instants let reports regroup retained totals for a changed IANA timezone, including daylight-saving transitions. Full token classes can expire before compact tokens and prices. Their state is **unavailable**, not zero. Missing prices remain missing. Captured estimates are not subscription spending. No prices or thread shares are created.

## Maintenance and replay

`initializeHistory` owns the unified schema-4 migration. See [STORAGE-INTEGRATION.md](STORAGE-INTEGRATION.md) for the full contract. Schema 1 is a historical migration input. Its compact ownership backfill uses transactions of at most 500 rows and saves a durable cursor. Migration from schemas 2 and 3 preserves compact rows, original ownership, cutoffs, completed cursors and scalar values. It resets only the bounded identity projection backfill.

Reconciliation, identity resolution and import work wait for compact ownership backfill to finish, so a partial compact index cannot change replay ownership. Pruning also uses batches of at most 500 records. Log retirement advances at most 14 dates per check. Discovery uses fixed daily names, not a directory-wide or transcript scan.

Compact rows, detail, ranked totals, counters and entry ownership commit together during ingestion. Detail expiry does not remove replay evidence. Compact expiry removes retained numeric values but leaves minimal UUID tombstones and hashed entry evidence. Ordinary replay cannot restore expired history or change the first confirmed owner. Conflicting scalar evidence stays excluded without replacing original costs or workspace ownership. Ranked management reads still use their persistent index.

### Paused legacy-writer retirement

Earlier collectors wrote `events-v1.jsonl` and `confirmations-v1.jsonl`. An old process can finish an already-owned append after capture is paused. Quiet files, repair, idle sessions or one new event cannot prove that every old writer has stopped.

1. **Pause capture** on the selected host. No session is restarted automatically.
2. Choose **Prepare legacy stop proof**. This publishes protocol-2 control with a fresh revision. Obsolete protocol-1 writers reject it, including after later resume or repair. Preparation alone does not prove that queued old writes finished.
3. Stop every legacy process or load the new writer in each process yourself. Explicitly confirm the unchecked statement that every legacy process exited or loaded the new writer and no legacy writer can still append.
4. Choose **Retire stopped legacy logs** within 15 minutes. Consent binds the selected host's control revision and fixed source identities, sizes and nanosecond modification/change times. An invalid token, expiry, changed source/control, partial final line, unsafe path or IO error leaves visible incomplete work. No inactivity or complete coverage is inferred.
5. Use **Check readiness** to continue durable bounded ingestion and retirement. Capture remains paused; resume is a separate action. Only the fixed plugin-owned legacy sources and their owned retained/spool paths are used. No directory-wide or transcript scan runs.

The final tail is indexed before filtering. Each check copies at most 500 lines and 128 KiB into fixed private spools. In-window original event bodies stay unchanged in `events-legacy-retained-v1.jsonl`; their confirmation bodies stay in `confirmations-legacy-retained-v1.jsonl`. Outputs and receipts are synced and published before originals are removed. Reopen resumes verified owned work after interruptions. Rebuilding a damaged database indexes retained inputs before a pending confirmation copy continues. Retiring source progress preserves past uncertainty and replay ownership.

Once sealed retirement is complete, later readiness checks can expire retained legacy bodies in bounded steps without fresh stop consent. The writer fence remains required. Reappearing originals or changed sealed files stop this maintenance and require a fresh paused proof. Unrelated paths and symlinks are never adopted. The operation lock prevents concurrent retirement; checking its owner is not legacy-writer stop proof.

Until the operator supplies valid stop consent, legacy shared logs remain untouched and **legacy logs pending** stays visible. This code and its tests do not authorize live session changes or real-storage retirement during this task.

## Coverage and empty intervals

Coverage applies to one host, workspace or verified thread, and UTC interval. The internal typed evidence adapter separates writer activity, reliable observed inactivity, imported coverage, omissions, uncertainty and backlog. Pauses and recovery gaps apply only where they overlap the requested interval. Another workspace's activity does not certify this workspace. A workspace claim does not certify a thread.

UTC query and evidence bounds are normalized before comparison. Positive evidence must cover the exact scope. Host-wide negative evidence applies to narrower workspace and thread reads. Workspace gaps also apply to verified threads with that established workspace; without established workspace scope, broader negative evidence remains uncertain. No ownership is inferred.

The coverage resolver reads durable reconciliation state, source progress, invalid-source uncertainty, pauses and recovery gaps itself. Interrupted or budget-limited ingestion has unknown original scope and timestamps, so it prevents zero for all retained intervals on that host until reconciliation finishes. Invalid source records stay uncertain while the source remains unresolved. Retiring a log or its progress row preserves host-scoped uncertainty for the affected past interval; missing data does not become zero. Callers do not supply guessed activity or backlog flags.

No events means **unknown** unless reliable inactivity evidence covers the whole requested scope and interval, with no pause, omission, backlog or recovery gap. Writer activation alone is not inactivity evidence. Excluded observed events are still activity evidence; an empty accepted total does not certify inactivity. Imported evidence is separate from observed inactivity. This slice does not discover or import transcripts. Later import code can use the typed storage adapter without changing ordinary reads.

## Non-destructive recovery

Only a SQLite corruption or not-a-database code confirms corruption. Permission errors, IO failures, busy storage, missing runtime capability, invalid control and unsupported schemas are not corruption. They return fixed unavailable diagnostics. Raw errors and source bodies do not reach the browser.

Readiness and import share header, journal-mode and version-specific layout checks. Before SQLite access, the plugin reads the header to reject unsupported versions and WAL-mode files, even when their sidecars are absent or empty. An external or unsettled WAL can contain a newer page-one version. Required tables and ownership singletons must exist before writable access. Newer, partial or foreign layouts remain unchanged. The plugin never forces a checkpoint to make rejected storage usable.

After confirmed corruption, the plugin requires valid established control and its saved retention/ownership boundary. It checks fixed owned paths and rejects symlinks. It moves only `usage-v1.sqlite` and its `-wal`, `-shm` and `-journal` sidecars into a new `history/quarantine-UUID` directory. A durable fixed-schema receipt lets an interrupted move resume. It never deletes quarantine data, unrelated extensions, Pi settings, BB core data or OpenForge storage.

Reconstruction reads only retained observed collector records within the detail window, with bounded normal ingestion. It does not read transcripts, use account credentials, fall back to the server, resume an import or enable capture. Imported-only and compact-only loss remains a disclosed gap. The retained horizon remains an explicit incomplete recovery interval, even when some newer events are recovered. Missing control or boundary metadata makes recovery unavailable rather than starting a new observation boundary.

If established control is paused, rebuilding records a conservative open pause at the known recovery instant. The finite recovery gap covers the lost past; the open pause covers the continuing disabled state. Reopen preserves it, and explicit resume closes it. Recovery does not invent the lost pause start or resume capture.

The **Storage health and retention** disclosure shows healthy, maintenance or recovered state, cutoffs, pending work, legacy limits and a bounded recovery-gap interval. A recovered database is not proof of complete reconstructed history.

### Artifact rollback

Restore the prior plugin artifact without deleting or downgrading history. An artifact that supports only schema 1, 2 or 3 must reject the retained schema-4 database, including readiness and repair, before opening it. Leave the database, sidecars, control and owned agent files unchanged. Rejected history stays unavailable; it is not corruption and does not authorize quarantine or reconstruction. Quota remains separate.

`scripts/check-prior-schema3.mjs` checks this contract with the exact hash-pinned pre-integration schema-3 artifact. It is evidence for that artifact, not approval for every older build. Downgrading writer control is not supported; keep protocol 2 while obsolete writers could restart.

## Evidence limits

All tests for this slice use real persistent temporary SQLite and synthetic log/collector/UI fixtures. These are not installed acceptance, real account attribution, real prices or billed capture. No live source switch, install, session restart, host/account setting change, transcript read or real-storage quarantine/deletion was performed.
