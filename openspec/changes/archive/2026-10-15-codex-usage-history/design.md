# Design

## Context

See `proposal.md` for motivation and the delta specs for the behavior contract. This crosses the existing host worker, server coordinator, strict RPC contracts, React dashboard, and a new installed Pi extension, so a design document is required.

Current `server.ts` owns an explicitly selected active enrolled host and a generation counter. It cancels requests and rechecks selection/connection before returning quota. `host.ts` owns authentication and its private quota cache. `app.tsx` owns one app-window quota refresh module; dashboard, footer, and passive icons subscribe to that state. Keep those responsibilities intact.

The source plugin is `/Users/koen/workspace/openforge-plugins/plugins/codex-usage`, licensed MIT in its package manifest. Its history uses compact JSONL events and `node:sqlite`, while its reporting views are Svelte. Its event schema contains Pi session ID and OpenForge Task/Project IDs but no workspace path. Its historical discovery assumes OpenForge candidate sessions and workspace-encoded Pi directories. Those host assumptions cannot be copied unchanged.

Read-only exploration established the following on BB 0.44.0 with installed SDK 0.5.29:

- `bb.sdk.threads.events.list` supports typed `thread/identity` filtering and bounded pagination. The event exposes `providerThreadId`, even though the thread DTO does not expose Pi's session ID.
- BB's Pi bridge defaults to `~/.bb/pi-bridge-sessions`, supports `BB_PI_BRIDGE_SESSION_DIR`, and names transcripts by provider identity. The current thread's identity matched its actual transcript filename, but did not equal the Pi session ID in that file's header.
- Pi session headers contain `cwd`. There were 201 retained headers in the default BB directory and one matched this thread's workspace. Only header metadata was inspected for this check; no costs or collector behavior were verified.
- BB's Pi launch code supplies `BB_THREAD_ID`; installed collector availability and correlation still require bundled/live verification.
- The public host context provides persistent plugin-scoped `experimental_paths.dataDir`, temporary worker storage, lifecycle cancellation, filesystem watches, worker retention, and disposal. Host runtime SQLite compatibility has not been proved.

## Goals / Non-Goals

**Goals:**

- Put capture, replay safety, coverage, retention, and report queries behind a small history interface, rather than distributing import/storage rules through UI callers.
- Produce useful workspace history when thread attribution is absent, without weakening exact-thread evidence.
- Keep recorded historical usage independent from whichever Codex account is signed in today.
- Preserve quota operation on a quota-only installation and when history or account activity fails.

**Non-Goals:**

- Modify BB core/provider implementations or import their private modules.
- Read OpenForge's existing event logs/database or migrate its Task IDs into BB thread IDs.
- Add pricing tables, subscription-cost allocation, reset redemption, completed-task metrics, or collectors for non-Pi providers.
- Treat collector installation, file existence, or a successful build as proof of complete history or live acceptance.

## Decisions

### 1. Keep host-local data and a narrow history interface

Use `context.experimental_paths.dataDir` for `history/usage-v1.sqlite`, collector logs, coverage/control metadata, and import generations. Install a distinct `bb-codex-usage` extension into Pi's resolved agent extension directory, never overwrite `openforge-codex-usage` or other extensions. The packaged extension receives this host's fixed data location through a validated, serialized install configuration, not a dependency on the source checkout or a live BB server connection.

The host history module exposes three operations: read a bounded report/status, control its collector, and control an import generation. Server RPC adds the existing host ID/generation guard and supplies bounded verified BB bindings. An independent activity module exposes a normalized read. Internal seams accept clock, filesystem, identity-discovery, and database adapters for tests. Avoid one public method per table, cursor, or maintenance step.

Only explicit installation creates the Pi extension. Install/repair use atomic file replacement and a version/hash check. Pause/resume update plugin-owned control metadata read by loaded collectors; retain the immutable first-observation timestamp and record pause intervals. Fail closed on missing, disabled, or incompatible control metadata. An installed extension is independent of BB's UI/plugin lifecycle; explain this and give pause controls rather than promising plugin disable can stop a writer on an offline host.

Alternative: keep the authoritative database on the BB server. Rejected because it moves detailed host-local usage across machines and makes disconnected-host ownership and pruning harder to reason about.

### 2. SQLite persistence with explicit runtime capability checks

Reuse the source plugin's transactions, indexes, resumable progress, and recovery algorithms behind a small synchronous SQLite adapter. Select the public runtime-supported SQLite implementation after a packaged host capability check, adapting `node:sqlite` calls if BB's actual runtime requires a different supported adapter. No private BB storage imports or server-machine fallback.

A missing capability returns a fixed history-unavailable state and leaves quota working. The first implementation checkpoint must exercise persistent create/query/transaction/reopen in the actual host bundle, plus installation/loading of the packaged extension. Do not develop the whole reporting stack against an in-process database mock and postpone this compatibility risk until acceptance.

Alternative: aggregate transcript files or JSONL on each dashboard load. Rejected because routine reads would scan message content, repeat parsing, and lose durable deduplication/import progress.

### 3. Capture usage identity and actual workspace at message time

Adapt `piExtension.ts`, `usageEvent.ts`, `usageIdentity.ts`, and `collectorMarker.ts`. Use a BB-specific versioned schema with UUID usage identity, Pi session identity, optional claimed BB thread context, bounded provider-session file key from `ctx.sessionManager.getSessionFile()` when available, actual `ctx.cwd`, provider/model, original UTC instant, validated token classes, and positive captured cost or explicit missing-price state. Never add the fields of a message object wholesale.

Capture promptly on `message_end`. Retain the source's bounded confirmation mechanism to bind a live event to the persisted Pi entry without delaying or dropping the usage record. Serialize per-process appends; use fixed diagnostics rather than the source extension's raw exception logging. A captured BB thread ID is a claim until correlated with public BB identity evidence; malformed or conflicting claims remain workspace-only or ambiguous.

Host scope comes from the selected host and its plugin-owned storage. Account authentication fingerprints are not historical usage identities, are not persisted in history, and cannot establish that old records belong to today's account.

### 4. Use verified identity before workspace fallback

The server discovers Pi threads/environments through public SDK methods and pages `thread/identity` events, including archived threads and all identity changes within the retained scope. Discovery is bounded and cached with durable progress where needed. Ordinary report refresh does not fetch prompt/message payloads or enumerate an unbounded catalog.

Routine ingestion correlates collector-supplied provider-session file keys with public identity events and previously confirmed bindings, without opening transcripts. Only explicit import resolves a provider identity against a confined configured BB Pi session root, verifies the file/header, and records the relationship between provider identity, Pi session ID, and actual workspace. Do not compare the provider identity directly with the Pi session ID. Do not hard-code an absolute path on the server or send user-selected arbitrary filenames to a read operation.

A uniquely verified identity or validated collector claim resolves an exact thread. Missing exact evidence resolves only a workspace key consisting of selected host plus normalized full path. Resolve filesystem aliases on the owning host when possible; retain captured normalized keys for workspaces later deleted. Missing/unverifiable paths remain diagnosed rather than repaired through basename or prefix guesses. Never lowercase paths unconditionally across filesystems.

Persist original workspace ownership and resolved thread identity separately. Later metadata changes update display labels or evidence, not the source event's workspace. One event can be included in both alternative workspace and thread views, but those views are not additive totals. Workspace-only usage is never copied into several thread rows. Conflicting bindings and uncertain replay records are excluded from exact or duplicate-sensitive metrics until resolved.

Alternative: match the only current thread in a workspace and call its total exact. Rejected because past threads, shared checkouts, terminal Pi sessions, and workspace reuse make that claim false even when it looks plausible today.

### 5. Separate compact ingestion from explicit transcript import

Adapt the source ingester, historical importer, ranged JSONL reader, identity persistence, and compact projection. Routine report reconciliation reads compact event partitions and the index only. BB Pi transcript paths and ordinary Pi session paths are distinct discovery adapters; ordinary Pi paths are opt-in configured roots limited to known workspace scopes. Header `cwd` is evidence; an encoded directory name alone is not.

Start imports with a frozen retained UTC range and candidate cursor. Use bounded cycles and durable UTF-8 byte offsets, file identity checks, fixed diagnostics, and no stored partial message text. Suggested initial budgets reuse the source: 500 rows per transaction, 8 MiB collector work per cycle, 8 MiB per transcript slice, 32 MiB per import cycle, 256 collector sources per discovery batch, and 20 diagnostic samples. Imports can include the retained range before or across live collection, but overlapping records require shared event/entry evidence. Equality of cost, tokens, timestamp, or neighboring records is not enough.

Keep one unfinished import per host, explicit start/resume/cancel, and a stopped durable generation after worker reload. Active import work uses a worker lease only while needed and releases it on completion, cancellation, error, or lifecycle abort. A browser host switch cancels its active request/owned work and cannot publish old-host results; saved progress remains scoped to its original host.

Forked Pi transcripts can contain copied ancestry. Reuse confirmation/replay-alias logic where proven, and add BB fork fixtures. Do not assume session-local entry IDs alone establish a global usage identity. Unresolvable inherited/overlap records are quarantined with a partial-coverage diagnostic rather than silently double-counted.

### 6. Preserve local-day metrics beyond detailed retention

Keep detailed events/logs for 45 days. The compact projection retains stable usage/replay identity, original UTC instant, recorded workspace, verified thread identity if known, original captured cost/missing-price state, total tokens, and provenance for three calendar months plus seven rolling support dates and a two-day timezone margin. This differs from the source's cost-focused projection so older token charts do not silently become unavailable while cost charts work.

Prune and backfill in durable batches. Keep aliases/coverage uncertainty needed to prevent replay after detail expiry. Full token-class detail can expire with detailed rows; return an explicit unavailable detail state instead of pretending it is zero. Only confirmed corruption triggers quarantine and reconstruction from retained sources; a newer schema is not altered. Tests must use a real temporary database through the storage adapter, not fake SQL answers.

Coverage belongs to the requested host/scope/date range. Installation alone does not certify loaded writers or account-wide completeness. Track observed writer scope, pauses, import coverage, omissions, and outstanding reconciliation separately. Unknown writer activation and unresolved candidates make the affected report partial. A no-event date is zero only when coverage supports observed inactivity. Historical imports preserve original costs and never consult current prices.

### 7. React reports share one range, not one request lifecycle

Keep plugin ID and `quota` navigation route. The existing quota refresh owner remains the sole quota polling owner. The dashboard adds independent history and activity state keyed by host/generation, request sequence, grouping, 30-day range, and IANA timezone. History reads may reconcile compact logs; a throttled native watch while history is open can invalidate the index and coalesce reads. Closing history stops its watches/timers. Collector capture continues independently. Activity refresh is visibility/due-time driven while account details are open, coalesced and host-throttled; closing details stops its scheduling. Neither path invokes quota polling.

Layout:

```text
Host selector | quota refresh | current allowance and resets
History dates | Previous / Next | Workspaces / Exact threads
Metric selector
Daily chart and compatible prior-period summary
Ranked entities, initially ten, bounded to fifty
Daily detail and explanation of values
Account details and activity       [collapsed]
Collection and history management  [collapsed]
```

At 375px the controls stack/wrap and wide value tables scroll within their own labeled container, not the page. Keep quota/official-link access above a history error. Use host theme tokens and public navigation for verified thread links. Display exact token totals and priced-subset cost denominators; reasoning/cache classes are a breakdown, not additional total tokens. Default to daily tokens in workspace mode so unpriced records still give a useful first view. Missing prices and incomplete dates are labeled and shown as gaps or partial marks. Prior-period percentages require complete compatible coverage and a nonzero baseline.

Port calendar/range/aggregation/presentation tests as React-facing fixtures, not Svelte runtime dependencies. Reuse the source's compact and responsive disclosure ideas without replacing BB-owned navigation/footer DOM behavior.

### 8. Account activity is normalized and failure-isolated

Adapt `normalizeActivityResponse` and the profile endpoint read from `codexUsageAdapter.ts`, but use the existing BB host's private Pi authentication runtime and bounded response reading. Do not copy its email-bearing account presentation or raw error handling. Quota and activity caches remain separate, with same-host/account identity checks, fixed diagnostics, and the specified five-minute freshness/24-hour expiry. Activity failure cannot clear quota or block local history. Account-wide statistics are never blended into workspace/thread history or used to estimate missing prices.

## Risks / Trade-offs

- Private Codex activity fields can change. Mitigate with independent normalization, bounded reads, missing-field states, and failure isolation.
- Captured Codex prices can be zero or absent. Preserve tokens and label money unknown; do not promise monetary totals until real records contain valid prices.
- Provider bindings and fork ancestry can be incomplete. Prefer exact verified evidence, retain workspace-only totals, quarantine duplicate-sensitive records, and expose exclusions.
- Shared workspaces include more than one thread and can include terminal Pi usage. Label workspace scope explicitly instead of calling it exact BB-thread usage.
- Host runtime and collector packaging can differ from OpenForge. Prove both in the bundle first; fail history closed without changing quota behavior.
- Long imports and compact migration can block interactive work. Bound transactions/read cycles, yield, persist progress, and allow cancellation.
- Installed collectors outlive the dashboard/plugin. Provide pause controls and explain this lifecycle before installation; do not stop existing user sessions automatically.
- Storage can expire or fail before recovery. Retain supported compact metadata, preserve unsupported schemas, and make lost intervals visible.

## Migration Plan

1. Record implementation baseline, pin the observed public SDK contract, and pass packaged host persistence/extension-loading checks using synthetic temporary storage before expanding functionality.
2. Add versioned BB-owned collection/indexing and import schemas. Existing quota-only installations create no collector or import side effect. Copy applicable MIT notices when porting source modules.
3. Add history/activity RPC and React views while retaining existing quota/footer/countdown registration and scheduling. Document storage locations, cost meaning, attribution grades, and collector lifecycle.
4. Run local tests, static/SDK/bundle checks, and installed behavior checks from this exact checkout. Obtain required approval for installation/source switches, collector installation, session restart, or a new live model turn. Verify normal user-initiated capture or approved test work; synthetic fixtures do not establish live capture or real pricing.
5. Complete one fresh-context read-only completion review and resolve blocking findings. Report separately any live scope that could not be exercised.
6. Roll back by restoring the previous plugin artifact/source without deleting data. Pause the collector first when possible; explain separately how to remove only this plugin's installed extension. Older code must leave newer history schemas untouched. Never reset unrelated Pi/OpenForge/BB storage as rollback.
