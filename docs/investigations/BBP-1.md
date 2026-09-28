# BBP-1: BB-scoped Pi Codex token and captured-cost history

## Recommendation

Keep token and cost history out of quota V1. BB 0.44.0 does not currently provide enough normalized Pi data for trustworthy, complete assistant-message accounting through the supported thread-event API alone.

Prefer a BB/Pi provider improvement that emits durable, content-free usage records for every finalized assistant message. If that is not available, consider a separately approved, host-local Pi collector with explicit session binding. Do not ship the private bridge-file reader as an assumed working solution. It remains a possible, version-pinned fallback for bounded historical import or reconciliation, subject to the gates below.

The answer is therefore conditional: safe attribution is technically plausible, but neither the private file route nor a collector has passed the required installed acceptance. The old unavailable bridge gate remains failed. Nothing here revives the removed prototype or archives it as successful.

## Scope and evidence

Investigation date: 2026-09-27. Project: `proj_gjz4e6jtmg`. Task: BBP-1. Repository baseline: `fb1059b`.

Inspected local documentation and installed program code, not user conversation data:

- BB CLI 0.44.0 and bundled Pi provider built with Plugin SDK 0.5.29. Its manifest requires SDK >=0.5.22.
- Installed Pi coding-agent 0.87.1 and its bundled Pi AI implementation.
- Repository quota artifacts, which describe earlier BB 0.43.4 / SDK 0.5.9 feasibility. Those results establish quota access, not history access.
- OpenSpec inventory contains `bb-codex-quota`, not the removed `bb-codex-usage`. The only durable spec listed is unrelated code-cleanup guidance.
- A read-only plugin-list query confirmed Provider usage is disabled. It was not enabled or called.

No Pi session file, BB transcript, credential file, database, unrelated thread, or historical provider log was read. No collector was installed, no dependency or runtime configuration changed, and no model-verification turn was started. Findings about code are static evidence, not installed end-to-end acceptance. The earlier unavailable gate and its suspected cause are task-supplied evidence; its original logs were not independently recovered.

## Define the number before collecting it

The proposed primary measure is **observed Pi assistant-message usage for `provider = openai-codex`**, attributed to the BB thread that generated each message. Preserve the message's provider and model, not just the thread's current model setting.

Keep input, output, cache-read, cache-write, reported total tokens, and captured cost components separate. Preserve missing or invalid values as unknown. A reported zero is distinct from missing data. Pi's optional reasoning count is already part of output; its optional one-hour cache-write count is a subset of cache writes. Do not add either twice.

"Captured cost" means the value Pi recorded at the time, not an OpenAI invoice, marginal subscription charge, remaining quota, or reconstructed historical price. Pi AI's `calculateCost` uses model price metadata. Never silently reprice old messages with today's catalog. Preserve captured zero with its provenance; do not call it proof of free work. Do not recover billing identity from OAuth credentials.

This measure excludes compaction and branch-summary calls, cache warming, tool-reported nested usage, external agents, and requests lost before a finalized message was captured. Pi can record those in other entry types. They may be useful separate categories later, but combining them now would change the task and risk double counting child work.

Count generated work on abandoned branches too. An active-context view and an expenditure history answer different questions. A fork's inherited messages are context, not fresh usage by the fork.

## Route comparison

| Route | Privacy and scoping | Completeness | Recommendation |
|---|---|---|---|
| Supported BB thread events | Server-side thread and event-type selection can avoid transcript payloads | Current Pi adapter loses intermediate assistant usage and captured cost | Preferred transport, insufficient current producer |
| Private BB Pi bridge files | Exact file reads on the owning host can avoid unrelated sessions; selected transcript bytes still pass through the local parser | Persisted assistant messages contain usage and cost, but files have lifecycle, lineage, and crash gaps | Version-pinned experiment/import only after approval and acceptance |
| Consented Pi collector | Can project usage inside the already-running selected Pi process without rereading transcript files | Better live coverage; durable identity, persistence ordering, and crash recovery still need design | Preferred fallback for future-only collection if an upstream improvement is unavailable |

### 1. Supported BB APIs

The backend SDK documents `threads.list({ projectId, ... })`, `threads.get`, environment/host resolution, and `threads.events.list` with a non-empty typed `types` filter and exclusive sequence cursors. Paginate only the selected project's membership. Resolve the selected thread against that membership before requesting its events. Include archived and hidden threads deliberately when the requested scope includes them; do not substitute an unrestricted account-wide thread scan.

Request only `thread/tokenUsage/updated`, not `timeline`, `output`, raw provider events, or lifecycle events containing `lastAssistantText`. Treat notification subscriptions as wakeups; reconcile from durable cursors. `bb thread context` reports latest context-window usage, which is not historical expenditure.

The installed Pi provider's `createPiDeltaTranslator` has a material limitation:

1. On `agent_end`, `findLastAssistantMessage` searches backward and chooses one assistant message.
2. `toAssistantUsageBreakdown` reads that message's token usage, combines cache-read and cache-write into cached input while retaining optional subdivisions, and does not copy cost.
3. It adds that one breakdown to an in-memory total. `resetThread` deletes that accumulated state.
4. Retry handling and assistant-error handling can return before emitting usage.

Thus a run with a tool-call assistant message followed by a final answer does not get complete assistant-message usage through this path. The normalized token payload also does not carry per-message provider/model identity or captured cost. A mixed-model Pi thread cannot be safely classified as entirely Codex using its current model setting. Missing numeric fields may be normalized to zero, further limiting downstream completeness claims.

Do not sum cumulative `total` snapshots, infer missing usage from context size, or subtract totals across session resets. Even summing unique event `last` values would represent only adapter-observed partial usage. Historical filtered BB events can support a clearly labeled partial series, not reconstruct information the adapter never emitted.

A supported improvement should expose an immutable usage-record identity, BB project/thread/turn binding, provider session generation, per-message provider/model, token and captured-cost fields, observation time, and explicit coverage. It should emit after finalization, persist before acknowledging delivery, support replay cursors, and omit content. The event producer should normalize locally on the execution host before transport.

### 2. Private bridge-file append contract

The installed BB Pi provider resolves its session root from `BB_PI_BRIDGE_SESSION_DIR`, otherwise `~/.bb/pi-bridge-sessions`. It trims the override and resolves it using the provider process's filesystem context. It names the file from a sanitized provider thread ID and passes the resulting path through Pi's `--session`, plus an explicit `--session-dir`.

This is not Pi's ordinary cwd-grouped session directory. `PI_CODING_AGENT_DIR`, `PI_CODING_AGENT_SESSION_DIR`, and a guessed server home directory do not establish BB's effective bridge root. Pi's explicit CLI session directory wins over its ordinary storage defaults.

The mapping is not permanently `<BB-thread-id>.jsonl`. BB can relocate a session after a cwd change, fork it into a fresh `pi_...` provider identity, and report that replacement. Explicit forks also copy session material. A reader needs an authoritative, generation-aware BB-thread to provider-session mapping and the effective root on that provider's host. If either is unavailable, stop. Do not search neighboring session trees to guess.

Pi 0.87.1's persistence implementation is append-oriented, not an immutable log contract:

- A new session can remain unwritten until the first assistant message. Initial persistence writes all buffered entries with exclusive creation; later entries use append.
- Loading an old session can migrate it and rewrite the file. Empty-file handling and branch creation also include rewrite paths.
- `forkFrom` writes a new header with `parentSession` and copies all non-header source entries, including their IDs. Checkpoint branching copies a selected path and can re-chain parents.
- BB's fork helper renames the generated file to the target bridge filename.
- Session headers contain Pi identity and cwd, not a trustworthy BB project assignment.

A reader must handle delayed creation, partial final lines, multiple writes per initial flush, replacement, truncation, migration, replay, and copied history. Neither a watcher notification nor a byte offset proves that one new billable message occurred.

Read only a server-authorized exact file on the selected enrolled host. The host parser may inspect selected transcript-bearing bytes, but must project a strict usage allowlist before persistence, logs, RPC, or UI. No content, thinking, tool arguments/results, arbitrary error strings, authentication material, or raw JSON should leave that parser. If "no transcript access" means even the collector process must never receive transcript bytes, this route is disqualified outright.

Do not use `SessionManager.open` as a supposedly read-only importer: loading can migrate and rewrite. Use a bounded, non-mutating format reader after separate approval. Never follow `parentSession` paths automatically. A parent outside the approved selection is a lineage gap, not permission to open it.

### 3. A consented Pi collector

Pi supports extensions in RPC mode and finalized `message_end` events. A narrowly loaded collector could project only usage metadata from the selected process and write a host-local, plugin-owned outbox. This avoids scanning ordinary Pi sessions and can capture intermediate assistant messages missed by BB's current adapter.

It is not sandboxed. Pi extensions have the process's permissions and can access prompts, files, and credentials. Consent must cover the exact package/version, hosts, selected sessions, retention, enable/disable behavior, and collection start time. Prefer explicit BB-session loading over a global extension that observes unrelated sessions before deciding to ignore them. Do not install one merely because it has a callback API.

There are two unresolved correctness boundaries:

- `message_end` extension callbacks run before Pi appends the corresponding session entry. The event type contains a message, not the persisted entry ID. Later extension handlers can replace the message. Reading the current leaf during this callback does not identify the new assistant entry. A collector needs final post-transform identity or a tested reconciliation protocol; timestamps and content hashes are not acceptable substitutes.
- Inherited `BB_*` values, cwd, and writable plugin metadata are not authentication. A nested Pi child may inherit parent identifiers. Bind collection through trusted launch/session information and a host-local capability restricted to the authorized session generation. Keep such capabilities out of logs and RPC results. Whether BB can supply this binding to an optional collector through supported hooks remains a blocker.

A durable outbox needs stable record IDs, bounded storage, acknowledgement/replay, revocation, and crash-gap reporting. It cannot promise exactly-once accounting across the pre-persistence crash window until tested. Disable must stop future collection; retention and deletion of already collected records must be explicit.

## Attribution, confinement, and lifecycle requirements

### Project, thread, fork, and child ownership

Use BB membership and execution-host metadata as authority. File location, cwd, title, `parentSession`, environment variables, and plugin metadata are only hints. SDK documentation explicitly says plugin metadata is writable by other plugins and the thread's agent; it is not an authorization boundary and forks do not inherit it automatically.

Maintain separate concepts for generation ownership and display rollups:

- A normal BB child contributes to its own thread. A parent-plus-descendants view is a union of owned records, not parent totals plus potentially inclusive child totals.
- A fork receives no new charge for inherited entries. Track their origin using validated lineage and an enrollment baseline. Session ID plus entry ID alone will count copied entries again, while entry ID alone can collide across unrelated sessions.
- A Pi subagent without a BB thread needs an explicit trusted delegation binding. Inherited parent environment variables are insufficient. Otherwise show it as outside coverage, not silently charge it to the parent.
- A new provider session identity or moved environment must create a new mapping generation. Retain old mappings for historical ownership rather than assigning old records to the thread's latest host/model.

### Root overrides and remote hosts

Server code must validate project/thread/host selection and pass an explicit `hostId` to typed host RPC. Generic SDK file operations default to the server's primary host when `hostId` is omitted, so they are unsuitable as an implicit remote fallback. Never send a whole transcript through `files.read` for server-side filtering.

Resolve the provider's effective root on its execution host. Require exact allowed IDs and reject traversal, sanitized-name collisions, symlink escapes, unexpected file types, root replacement, and file replacement during validation/open. Canonical-path checks alone do not close a time-of-check/time-of-use race. Handle legitimate override changes through an explicit new binding; never broaden the scan root. If an old remote host is offline or a mapping is missing, retain unavailable status rather than read a similarly named local file.

### Worker idle eviction, leases, and restart

Both installed code and bundled SDK documentation confirm a five-minute host-RPC-worker idle timeout when there is no active call, native watch, or retained lease. A JavaScript timer or in-memory map does not itself keep the worker alive. `experimental_retainWorker()` is the supported experimental retention mechanism for independent background work; dispose the lease when work stops.

Important distinctions:

- Graceful idle eviction does not emit `experimental_onWorkerExit`; a crash does. A later RPC starts a fresh worker.
- Reload, disable, uninstall, and daemon shutdown can dispose the worker regardless of retention. Reconnect requires reconciliation. Signals are ephemeral, not durable delivery.
- Persist state under the plugin's host-local data directory, not its worker temp directory. Make cleanup idempotent and distinguish per-call cancellation from worker lifecycle cancellation.
- The documented idle policy applies to the host RPC consumer. The provider bridge can use the same artifact under a different subsystem with a separate lifecycle. Do not infer that the Pi provider itself was evicted after five minutes.

Idle eviction could explain a gate that stored enrollment or checkpoints only in memory, or a poller without a retained lease. It does not prove why the former gate returned unavailable. That requires non-sensitive worker-generation, gate-phase, mapping, and timing evidence from a newly approved test. An unavailable result must never be reported as zero usage or a successful gate.

## Historical import feasibility

Default to future-only coverage from a recorded enrollment boundary. Historical import is a separate consent decision, not a startup scan.

A bounded import is feasible only when BB supplies exact historical ownership mappings and the selected host still has the corresponding files. Ask for approval of the exact project/thread set, hosts, time interval, lineage policy, and local parsing of those transcript-bearing files. List scope from BB metadata first, then open only those files. Never enumerate `~/.pi/agent/sessions`, use "most recent session," search by cwd, or follow arbitrary parent paths.

Missing deleted sessions, unknown relocated roots, old provider identities, incomplete forks, disconnected hosts, and unsupported formats must remain visible gaps. A fork containing old assistant records does not prove those records were generated by that fork. Without provenance, exclude ambiguous inherited records rather than inflate its total. No retrospective collector can recover unpersisted usage or captured cost discarded by the normalized BB event stream.

An approved importer should preview eligible files and unresolved mappings without content, use bounded read-only parsing, deduplicate transactionally against live collection, and record source/version/import range. Do not assign an old message the current account or model price.

## Test plan and release gates

These are proposed tests, not tests run during this investigation. Use synthetic credentials and messages only. Keep Provider usage disabled and prohibit network/model calls in the offline suite.

| Gate | Cases | Required result |
|---|---|---|
| API coverage | One response; tool-use response followed by final response; mixed providers/models; retry/error/abort; reset | Every eligible assistant counted once with original cost, or explicit partial coverage. Demonstrate the current last-message-only limitation with synthetic events. |
| Numeric semantics | Zero, absent, negative, non-finite, fractional/oversized counters; cache subdivisions; reasoning; changed price catalog | Reject malformed data; unknown stays unknown; no double counting or silent repricing. Preserve captured provenance. |
| Selection isolation | Two projects with shared cwd, hidden/archived threads, pagination, stale UI selection, changed host/session generation | Only authorized records read; a selection race discards the response. No fallback scan. |
| Filesystem confinement | Default/custom/relative root, override changes, traversal, sanitization collision, symlink and replacement races, remote host unavailable | Open only bound regular files on the exact host; fail closed before unrelated reads. |
| Persistence | No first assistant yet; partial UTF-8/JSON line; huge line/file; initial flush; truncate/rewrite; rename; unsupported version | Bounded memory, resumable cursor, explicit format/gap state; never mutate source files. |
| Forks and branches | Full-copy fork, checkpoint fork, relocated session, abandoned branch, entry-ID collision, excluded parent | Charge new generation work only; inherited entries never counted again; unresolved lineage visible. |
| Children | BB child; nested Pi child inheriting parent env; external CLI child; parent rollup plus child detail | No spoofed parent attribution and no double counting. Missing bindings become coverage exclusions. |
| Collector ordering | Later message replacement, pre-append crash, restart/reload, session replacement, ephemeral session | Persisted identity is proven or gap disclosed; no stale-context attribution. |
| Worker lifecycle | Before/after five idle minutes, timer only, native watch, retained lease then disposal, crash, reload, disable, daemon restart, reconnect | Durable mapping/cursor survives; explicit rehydration; no reliance on idle-exit notifications; no leaked lease. |
| Delivery | Duplicate/out-of-order signals, lost acknowledgement, replayed batches, two workers, storage full | Idempotent commit keyed by origin; bounded outbox; no silent loss or fabricated zero. |
| Privacy | Sentinel text/credential strings in selected and unrelated fixtures, malformed input and error paths | No sentinel in RPC, logs, database, artifact, or UI; unrelated-file open counter remains zero. |
| Import | Overlap with live collection, deleted file, unknown old mapping, inherited fork prefix, repeat import | Dry-run scope matches approval; repeat is idempotent; gaps and exclusions reported. |

Recommended sequence:

1. Agree on future-only versus import scope and exact coverage terminology. Choose the supported producer improvement first, or explicitly approve a collector experiment.
2. Build offline synthetic contract tests for the pinned BB/Pi versions. Run privacy tests with filesystem-open auditing, not just output redaction checks.
3. After separate approval for any installation, verify host RPC routing and lifecycle with synthetic usage. Include the five-minute boundary and worker generation changes without a model request.
4. Only after a fresh decision and explicit billed-turn approval, run a bounded selected-turn acceptance with an agreed host/thread/model, budget, collection window, and cleanup. A single successful answer is insufficient: the gate needs intermediate assistant usage, restart behavior, and fork/child isolation evidence.
5. Compare sanitized expected records to the stored projection, then demonstrate disabled collection stays disabled. Publish exact versions, coverage, and failures. If unavailable, leave acceptance failed.

## Blockers and compatibility risks

- Current supported Pi token events do not contain complete assistant-message usage, captured cost, or sufficient per-message model identity.
- A supported authoritative mapping from historical BB ownership to effective host-local Pi session paths has not been established here. Private path conventions alone are insufficient.
- Collector launch binding, final message identity, ordering, and crash reconciliation are unproven. Global installation would violate the intended narrow scope.
- Fork inheritance and child identity need explicit provenance. Deduplicating by timestamp, content, or filename is not trustworthy.
- The old installed gate is still unavailable/failed; its cause is unconfirmed.
- BB host APIs used for workers, leases, signals, and native watches are experimental. Private Pi bridge path/fork behavior can change independently of the public SDK.
- BB 0.44.0 / SDK 0.5.29 differ from the old quota feasibility versions. The provider package declares Pi 0.84.0 development dependencies while the inspected installed CLI is 0.87.1. Do not assume this is an exact tested compatibility pair.
- Pi session migrations, extension replacement semantics, new usage entry types, custom model pricing, and the configurable Pi launch command/arguments can change assumptions. Unknown versions or launch overrides need capability checks and a failed-closed state.

Investigation is ready for review. Implementation and live verification remain unapproved.

## Evidence references

Repository references:

- [Quota scope](../../bb-plugin-codex-quota/README.md)
- [Earlier quota-only feasibility](../../bb-plugin-codex-quota/FEASIBILITY.md)
- [Quota design and non-goals](../../openspec/changes/bb-codex-quota/design.md)

Installed evidence locations below are version-specific, not new plugin dependencies. No implementation should import private BB code.

Let `BB_APP` be `/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app` and `PI_PACKAGE` be `/Users/koen/.nvm/versions/node/v24.14.0/lib/node_modules/@earendil-works/pi-coding-agent`.

| Evidence | Location and locator |
|---|---|
| SDK selected-thread filtering, event cursors, metadata trust, file host default | `BB_APP/server/dist/builtin-skills/bb-plugin-authoring/references/backend-sdk.md`, lines 56-82, 145-155, 180-182, 207-245 |
| Worker lifetime and leases | Same references directory, `backend-foundation.md`, lines 234-285 |
| Pi normalization, root resolution, relocation, fork | `BB_APP/server/dist/builtin-plugins/provider-pi/dist/host.js`; retained function names `createPiDeltaTranslator`, `findLastAssistantMessage`, `toAssistantUsageBreakdown`, `resolvePiBridgeSessionDir`, `resolvePiSessionFilePath`, `piSessionNeedsRelocation`, `handleThreadConstruction`, `handleThreadFork` |
| Actual daemon idle timeout | `BB_APP/host-daemon/dist/daemon-bundle.mjs`; `scheduleWorkerIdle`, default `j_e=5*6e4`, guards for active calls, watches, retained leases |
| Build versions | `BB_APP/server/dist/builtin-plugins/provider-pi/package.json` and `dist/host.meta.json`; `bb --version` |
| Pi append/rewrite/fork behavior | `PI_PACKAGE/dist/core/session-manager.js`, `_loadEntries` around line 717, `_rewriteFile` 754, `_persist` 785, `createBranchedSession` 1201, `forkFrom` 1374 |
| Callback before persistence | `PI_PACKAGE/dist/core/agent-session.js`, lines 579-598 and 747-764; `dist/core/extensions/types.d.ts`, `MessageEndEvent` around line 669 |
| Usage categories and semantics | `PI_PACKAGE/docs/session-format.md`, `message-types.md`, `sessions.md`, `extensions.md`, `sdk.md`, `environment-variables.md` |
| Price-derived captured costs | `PI_PACKAGE/node_modules/@earendil-works/pi-ai/dist/models.js`, `calculateCost`, lines 533-551 |

SHA-256 fingerprints of inspected installed bundles:

- Pi provider `host.js`: `4883b50840edd9f9ff34e11d7e67bcb727a358ec53b504467378dae1ab71f9d3`
- Host daemon `daemon-bundle.mjs`: `90257970b5f814a876566b1be85dc8705967e51d934aa3cdecce53b390ceae05`
