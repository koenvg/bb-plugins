# Retention and storage recovery

## What remains available

The selected host owns its history. Quota and account activity use separate code and caches. A history error does not disable quota, its footer, countdown or official usage link.

Detailed events expire after 45 rolling days. New collectors write daily UTC log partitions. A partition can expire after its whole date is older than the 45-day cutoff and its stable contents have been indexed. Backlog or an interrupted maintenance cycle can delay physical removal. Use **Check readiness** to continue bounded work. There is no background history timer.

Compact records retain the original UTC instant, total tokens, original positive captured cost or missing-price state, provenance, immutable captured workspace and original storage-host key. They retain usage UUID, Pi session/entry replay evidence and optional verified thread metadata. The storage-host key is an immutable host-local UUID, not today's account or an inferred BB thread. The selected enrolled host remains the RPC scope. Claims are not verified links.

Compact retention starts three UTC calendar months before today, with seven support dates and two timezone-margin dates added. Month-end subtraction clamps to the last valid date. For example, at 1 October 2026 the compact cutoff is 22 June 2026. Maintenance cutoffs only advance. A clock rollback cannot restore expired records.

Original instants let reports regroup retained totals for a changed IANA timezone, including daylight-saving transitions. Full token classes can expire before compact tokens and prices. Their state is **unavailable**, not zero. Missing prices remain missing. Captured estimates are not subscription spending. No prices or thread shares are created.

## Maintenance and replay

Schema 2 backfills supported schema-1 rows in transactions of at most 500 rows. It saves a durable cursor. Reconciliation waits for backfill to finish, so a partial compact index cannot change replay ownership. Pruning also uses batches of at most 500 records. Log retirement advances at most 14 dates per check. Discovery uses fixed daily names, not a directory-wide or transcript scan.

Compact rows, detail, ranked totals, counters and entry ownership commit together during ingestion. Detail expiry does not remove replay evidence. Compact expiry removes retained numeric values but leaves minimal UUID tombstones and hashed entry evidence. Ordinary replay cannot restore expired history or change the first confirmed owner. Conflicting scalar evidence stays excluded without replacing original costs or workspace ownership. Ranked management reads still use their persistent index.

### Legacy log limit

Earlier collectors wrote `events-v1.jsonl` and `confirmations-v1.jsonl`. Already-running writers can keep appending to those files after repair. No public SDK check proves that all old writers have stopped. Rewriting or deleting a shared legacy file could lose a concurrent append.

The plugin therefore leaves legacy shared logs untouched and shows **legacy logs pending**. Repair does not retire them. Restarting sessions yourself can load the daily-partition writer, but installation or a new event cannot certify that every old writer stopped. Safe legacy log retirement remains an explicit BBP-23 completion gap. No live restart or storage deletion was authorized for this slice. Do not delete those logs to hide the warning.

## Coverage and empty intervals

Coverage applies to one host, workspace or verified thread, and UTC interval. The internal typed evidence adapter separates writer activity, reliable observed inactivity, imported coverage, omissions, uncertainty and backlog. Pauses and recovery gaps apply only where they overlap the requested interval. Another workspace's activity does not certify this workspace. A workspace claim does not certify a thread.

UTC query and evidence bounds are normalized before comparison. Positive evidence must cover the exact scope. Host-wide negative evidence applies to narrower workspace and thread reads. Workspace gaps also apply to verified threads with that established workspace; without established workspace scope, broader negative evidence remains uncertain. No ownership is inferred.

The coverage resolver reads durable reconciliation state, source progress, invalid-source uncertainty, pauses and recovery gaps itself. Interrupted or budget-limited ingestion has unknown original scope and timestamps, so it prevents zero for all retained intervals on that host until reconciliation finishes. Invalid source records stay uncertain while the source remains unresolved. Retiring a log or its progress row preserves host-scoped uncertainty for the affected past interval; missing data does not become zero. Callers do not supply guessed activity or backlog flags.

No events means **unknown** unless reliable inactivity evidence covers the whole requested scope and interval, with no pause, omission, backlog or recovery gap. Writer activation alone is not inactivity evidence. Excluded observed events are still activity evidence; an empty accepted total does not certify inactivity. Imported evidence is separate from observed inactivity. This slice does not discover or import transcripts. Later import code can use the typed storage adapter without changing ordinary reads.

## Non-destructive recovery

Only a SQLite corruption or not-a-database code confirms corruption. Permission errors, IO failures, busy storage, missing runtime capability, invalid control and unsupported schemas are not corruption. They return fixed unavailable diagnostics. Raw errors and source bodies do not reach the browser.

Before runtime access, the plugin reads only the SQLite header to reject unsupported versions. It leaves newer databases and sidecars untouched. An external or unsettled WAL can contain a newer page-one version, so the plugin leaves it untouched and reports unavailable rather than opening it or forcing a checkpoint.

After confirmed corruption, the plugin requires valid established control and its saved retention/ownership boundary. It checks fixed owned paths and rejects symlinks. It moves only `usage-v1.sqlite` and its `-wal`, `-shm` and `-journal` sidecars into a new `history/quarantine-UUID` directory. A durable fixed-schema receipt lets an interrupted move resume. It never deletes quarantine data, unrelated extensions, Pi settings, BB core data or OpenForge storage.

Reconstruction reads only retained compact collector sources, with bounded normal ingestion. It does not read transcripts, use account credentials or fall back to the server. Sources whose original events are already older than detailed retention are not permitted recovery input. Compact-only dates can therefore be lost after corruption. The retained horizon remains an explicit incomplete recovery interval, even when some newer events are recovered. Missing control or boundary metadata makes recovery unavailable rather than starting a new observation boundary.

If established control is paused, rebuilding records a conservative open pause at the known recovery instant. The finite recovery gap covers the lost past; the open pause covers the continuing disabled state. Reopen preserves it, and explicit resume closes it. Recovery does not invent the lost pause start or resume capture.

The **Storage health and retention** disclosure shows healthy, maintenance or recovered state, cutoffs, pending work, legacy limits and a bounded recovery-gap interval. A recovered database is not proof of complete reconstructed history. To roll back, restore the prior plugin artifact without deleting history. Older code must leave schema 2 untouched.

## Evidence limits

All tests for this slice use real persistent temporary SQLite and synthetic log/collector/UI fixtures. These are not installed acceptance, real account attribution, real prices or billed capture. No live source switch, install, session restart, host/account setting change, transcript read or real-storage quarantine/deletion was performed.
