# Explicit historical import

BBP-22 adds import only. It does not change quota polling, account activity, collector installation, calendar reports or retention/recovery. Development checks use owned synthetic transcripts and persistent temporary SQLite. They do not prove installed or billed usage.

## Configure the selected host

Open Historical import below Collection and privacy. Enter this host's actual BB Pi source root, optional ordinary Pi source roots and known workspace paths. Use absolute POSIX paths, one ordinary root or workspace per line. Save import sources is explicit configuration. It validates directories and workspace evidence on the owning host, but does not enumerate sources or read headers/messages.

This is a plugin-owned configured-source contract. The root is not independently discovered effective BB configuration or proof of complete host coverage. There is no default root. The plugin does not use BB_PI_BRIDGE_SESSION_DIR, daemon environment, server home, private BB state, or the parents of the plugin dataDir to infer transcript locations. Supply custom BB roots explicitly. Missing configuration says BB Pi source root is not configured.

The browser RPC accepts only selected host/generation and a strict command. Configure accepts one BB root, up to eight optional ordinary roots and up to 50 workspace paths, each at most 4096 characters without control characters. No filename, provider identity, thread claim or workspace-evidence RPC is exposed to the browser. The server pages up to four public environment pages of 50 rows and forwards only paths recorded on the selected host, at most 50 per call. A scope outside this bounded metadata set cannot be verified and configuration fails closed. A missing/deleted workspace remains an omission, not a guessed match.

Use specific ordinary Pi session directories associated with the selected workspaces. Ordinary source discovery is flat and nonrecursive. Do not configure a home directory or a general filesystem root. No folder name encoding, basename or prefix proves a workspace. A transcript's validated header cwd must resolve to a frozen known workspace on its owning host. Root aliases are resolved on that host; redirected aliases, replaced directories and symlink transcript files fail confinement checks.

## Start, status, resume and cancel

Start import freezes the configured resolved roots, directory identities, owning-host verified workspace scopes, completed public provider-identity catalog and a retained UTC window. The window starts three calendar months plus nine support/margin days before Start and ends at Start's original UTC instant. Later account settings and prices cannot change it.

Only Start and Resume discover candidates or read transcript bytes. Each action performs one bounded cycle. A stopped generation can need several Resume actions. Check import status, readiness, quota/activity refresh, page opening and reload do not discover or read transcripts. Reload shows saved progress but never auto-resumes. There is one unfinished generation per host. Save sources and another Start are refused until that generation completes or is canceled. Resume revalidates the frozen root, workspace and source proofs, and cannot retarget a cursor.

BB candidates come from completed public provider identity evidence, not directory scanning or an arbitrary filename request. The provider identity names a confined candidate, not its Pi session ID or exact thread. Header verification records the separate provider/Pi-session/workspace relationship through BBP-19's internal interface. Unknown, conflicting or incomplete evidence cannot allocate exact usage to a thread. Use Check readiness to finish bounded identity delivery before Start when metadata is incomplete.

Ordinary roots contribute at most 256 directory entries per root. Larger directories report discovery-limit and partial coverage. BB identity discovery advances in durable 100-provider batches. Header cycles process up to 32 candidates and at most 64 KiB per header. Message cycles read at most 8 MiB and process at most 500 records in a transaction. Records over 1 MiB are omitted in bounded ranged steps. UTF-8 decoding is strict. Parsing yields after 25 records and checks request/lifecycle cancellation before reads and commits. Durable offsets never contain partial message text.

Cancel interrupts owned work and prevents queued cycles from starting. Already committed records remain. A browser cancellation or selected-host change is not a rollback of a committed host operation. Check status on the original host after reconnecting. Each active Start/Resume request owns a worker lease; completion, cancellation, error and lifecycle abort release it. There is no import timer or automatic background resume.
Cancel also invalidates Start/Resume waiting for identity preparation or environment paging on the same host and selection generation. It does not abort quota or account activity requests. Non-regular source files are rejected before opening. A nonblocking open and descriptor/path checks prevent a replacement pipe from blocking the host control queue.

## Usage and coverage

The panel shows frozen UTC dates/workspace scope, candidate/read progress, processed records, inherited replays and omissions. All imported coverage is scoped and partial, even with no omissions. A completed cycle means the bounded candidate set was processed, not complete account or host history. Empty files, unavailable paths, oversize/malformed records, changed sources, unknown aliases/identities, unresolved overlap and ancestry never certify successful zeros. Diagnostics are fixed codes, not source text or arbitrary exceptions.

Imported events preserve original UTC instants, validated token classes, positive captured cost or missing price and recorded workspace. They have imported provenance and do not establish live writer activation. No current pricing table or account identity repairs old values. Only scalar metadata reaches the database. Raw prompts, assistant text, tool payloads, credentials and partial records are not persisted or returned.

Canonical ingestion and first-confirmed usage_entry_owners remain authoritative. Shared verified Pi session/entry evidence resolves live/import overlap. Distinct entries with equal times, tokens or costs are not deduplicated. Unconfirmed live overlap excludes the imported identity explicitly. Excluded scalar identities remain excluded across new generations.

A fork claim alone is insufficient. Its parent must be another independently confined, verified, unchanged source in the frozen generation, with matching workspace and shared entry/parent-chain evidence. Confirmed inherited entries reference their original owner and add no tokens. New child entries must connect to the proved chain. Unsupported/cyclic/out-of-root ancestry, conflicting values or copied IDs without parent proof are excluded with unresolved-ancestry. The importer never chooses a new canonical owner or changes an original immutable payload.
Confirmed ancestry consumes the canonical ingestion owner decision, including accepted/excluded state. A parent already captured live keeps its original owner. Fork references use that owner, not the rejected imported duplicate. Captured thread claims do not change shared-entry usage evidence.

## Storage and sibling integration

Configuration, frozen progress, source stamps and scalar ancestry references live in additive import_* tables inside the selected host's plugin-owned history/usage-v1.sqlite. experimental_paths.dataDir locates that plugin data only. Import-only setup does not install a collector, set its first observation boundary or enable capture. Later explicit collector installation preserves imported records. Newer database schemas stay unchanged.

HostHistory exposes read, collector control and one controlImport command operation. There is no public per-table or maintenance interface. executeImport uses projectImportedUsage and confirmedReplay behind the internal canonical projection interface, in the same transaction as source offsets. These helpers preserve projectCompactRecord ownership and return the original owner's scalar facts and accepted/excluded state. Stable imported UUIDs derive from Pi session and entry identity, never cost/time/body similarity. A second path can supply evidence without rewriting the first immutable imported payload.

For BBP-23's schema-2 compact projection, retain projectCompactRecord and excludeCompactIdentity semantics behind the existing internal ingestion boundary. Publish original scalar identity and acceptance changes to identity_usage transactionally. Copying or expiring detailed payloads must not remove usage_entry_owners, confirmed relationships or import exclusions. Fork entries reference stable original event IDs and consume accepted/excluded state, not a second report projection. No retention, recovery or legacy-log retirement control is part of this slice.

## Synthetic verification

Run import*.test.ts* plus the existing history/identity tests, then the full package suite and typecheck. Run bb plugin types --check before building. The bundle suite includes scripts/check-bundled-import.mjs and its --live-overlap mode. Regression tests include cancellation during server preparation, hard-deadline FIFO/replacement probes, host queue recovery and live-overlap plus chained fork ancestry. Run the packaged history, identity and import fixtures on Node 22 and Node 24. They copy the self-contained artifact to an isolated directory, forbid network and use only owned synthetic roots and real persistent SQLite. Node 22 SQLite is experimental.

Build scripts/import-preview.tsx with Bun for the browser only. Serve the fixture with dist/app.css and scripts/activity-preview.html on 127.0.0.1:38722, with the preview JavaScript named activity-preview.js. scripts/check-import-preview.py checks isolated desktop/375px wrapping and keyboard controls, with non-local traffic blocked. This is not installed BB navigation or live acceptance.
