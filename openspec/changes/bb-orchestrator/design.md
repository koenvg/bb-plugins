# Design

## Context

See `proposal.md` for motivation. The inspected versions were BB 0.44.0, Tasks 0.1.2, and the installed Plugin SDK 0.5.9. The installed Tasks-plus delegation implementation matches this checkout's `delegate/index.ts` and `delegate/contract.ts`.

### Confirmed existing behavior

- `db/store.ts` owns tasks, dependency queries, comments, attachments, and `task_threads`. Dependencies allow cross-project blockers and resolve when blockers are `done` or `canceled`.
- `delegate/index.ts` builds the ticket seed prompt, resolves presets and environments, calls `threads.spawn`, then attaches the thread and advances eligible task statuses inside a separate Tasks transaction. The RPC currently accepts task, preset, and extra instructions only.
- `api/index.ts` already batches dependency state and derives PR references from attached workers' environments. `lifecycle/index.ts` tracks worker activity through BB events with periodic reconciliation. Its `completed` activity value includes deleted or missing threads and is not ticket completion.
- `steer/index.ts` delivers `comment --notify` to the prior latest agent commenter. It does not find an epic coordinator.
- BB supports parented threads, cross-thread messages, pending interactions, plugin metadata, worktree presets, dispatch admission hooks, and native parent notifications. The installed concurrency-limit plugin already owns capacity admission.
- `package.json` already includes `skills` in package files and declares `bb.skills: ["skills"]`.

### Confirmed gaps and limits

- Current Tasks delegation always spawns. Its spawn and attachment are not atomic. There is no owning-worker designation or durable dispatch claim.
- CLI dispatch warns about open blockers but proceeds. Native dependency readiness is not equivalent to safe orchestration dispatch.
- Task detail supplies full subtasks but worker/report/decision state is not aggregated per subtask into one compact response.
- The inspected thread-create contract has no idempotency key. A retry cannot assume the first creation failed merely because the response was lost.
- BB's skill catalog and picker retain the invocation slug, not a separate display label. The accepted presentation is `bb-orchestrator` in the picker and `# BB Orchestrator` in the document.
- The installed BB Pi bridge passes staged skill roots with `--skill` and translates selected skills to `/skill:<name>`. Pi 1.0.0 parses `disable-model-invocation` and excludes disabled skills from automatic prompt advertising. An in-memory formatter check confirmed that native filtering. End-to-end invocation of the new bundled skill is not yet verified. Codex receives native extra roots; Claude receives a native skill-plugin directory. Their equivalent filtering remains unverified.

### Existing spec constraints

`task-dependencies` requires legacy CLI warnings and non-notifying "Unblocked" comments. Both stay unchanged. Worker reports and BB parent messages wake the coordinator; the dependency-comment path does not wake downstream workers or the coordinator. External status-only edits become visible on the next event-driven or user-requested status read, not through a new polling loop.

`tasks-fork` requires existing tracker behavior and identity to remain intact. Keep the plugin named "Tasks" and add commands without replacing existing ones. `task-thread-start` describes a composer-led launch contract, but that spec is not evidence that the inspected Tasks-plus RPC implements its claim/recovery behavior. Do not silently rewrite its composer workflow or treat it as an available SDK operation.

## Goals / Non-Goals

**Goals:**

- Put deterministic coordination bookkeeping behind a small Tasks-owned interface.
- Make a dispatch retry safe even when it cannot make progress automatically.
- Let the coordinator consume task and report summaries without repository or transcript investigation.
- Use existing BB execution, capacity, interaction, and notification mechanisms.

**Non-Goals:**

- BB core, SDK, or provider implementation changes.
- A scheduler, task planner, task-creation workflow, or dedicated inbox UI.
- Universal provider support based on an untested frontmatter assumption.
- Atomic transactions spanning the BB thread store and the plugin database, or unattended exactly-once spawn retries after ambiguous failures.
- A security sandbox for the agent's native repository tools. Coordination-only behavior is a role contract; plugin handlers themselves perform no repository inspection, implementation, tests, review, integration, or failure investigation.

## Decisions

### 1. Keep the skill and bookkeeping in Tasks-plus

Add a focused `orchestration/` module with typed contracts and store queries. Reuse and extend the existing delegation module for worker creation and ticket prompt construction. The CLI registration delegates to these modules rather than accumulating another orchestration implementation in `cli/index.ts` or `db/store.ts`.

Use existing `defineCli`/RPC conventions. The proposed CLI includes `bb tasks orchestrate status`, `begin`, `dispatch`, `pause`, and `resume`, plus `bb tasks report` and `bb tasks orchestrate answer`. Keep recovery and owner-selection commands under the same namespace. Exact flag spelling is an implementation detail; every mutating operation validates thread/run context at its handler.

Alternative rejected: a separate orchestrator plugin. It would still need Tasks-owned dispatch changes and would add cross-plugin RPC coordination without reducing ownership or recovery work.

### 2. Gate activation on an explicit BB-recorded user invocation

Ship the short skill with `name: bb-orchestrator`, an explicit manual-only description, `disable-model-invocation: true`, and heading `# BB Orchestrator`. Do not add automatic orchestration instructions through plugin installation or enable handlers.

The plugin must establish activation from an identifiable, exact explicit invocation in a BB submission recorded as `user`, with no sender thread. This is the temporary trust boundary approved by Koen on 2026-10-03. It does not prove that a human acted: BB 0.44.0 classifies agent self-sends as `user` with a null sender. Follow-up tracker task BBP-51 investigates stronger provenance. Inspect selected-command mentions before provider translation and recognize an exact leading native invocation only for verified provider paths. Bind authority to persisted invocation and decision references. Reject observed agent/system input, cross-thread notifications, stale or ambiguous input, mixed authors, quoted commands, and editable metadata claims. Test and document the accepted self-send limitation instead of claiming spoof-proof native provenance.

Bind the invocation reference to a proposed run's epic, coordinator, approved existing subtasks, preset selection, and baseline. If those parameters are absent or ambiguous, use one existing BB user-input interaction to obtain the initial approval. The skill invocation does not authorize guessing an epic or expanding scope. Repeated processing of the same invocation returns the same run. Routine eligible dispatches within an active approved run do not open another approval form.

Provider support is a verified capability. Test discovery, explicit selection/translation, provenance, idle continuation, and negative automatic-selection cases through the actual BB provider path. If a path cannot prove explicit activation with existing interfaces, refuse activation on that path and explain the limit. Do not add a core workaround or claim native prompt filtering alone proves the feature manual-only.

On plugin startup, migrations, or reload, reconcile bookkeeping read-only and register handlers. Do not spawn, send, resume a run, or recheck capacity to drain orchestration work. Paused or interrupted runs require explicit user resume. BB may finish already accepted work independently; plugin enable is never a new authorization.

Alternative rejected: frontmatter as the only activation gate. BB does not enforce it uniformly and native providers differ.

### 3. Store only coordination facts that Tasks cannot already derive

Extend Tasks storage additively:

- A run record holds epic ID, coordinator thread ID, explicit invocation/approval reference, approved task IDs and tracker-scope fingerprints, execution preset IDs, intended baseline/result references, phase, and timestamps. Scope is a membership snapshot, not copied ticket contents, statuses, or dependency edges.
- Extend `task_threads` with nullable role/primary-owner information. Orchestrator and integration associations attach to the epic; subtask owners attach to their tickets. Unique constraints prevent two designated primary owners for the same task/role. Existing associations remain valid and are not silently assigned ownership.
- A durable dispatch-attempt record holds task/role, run, correlation key, phase, and the resulting `task_threads` association when known. A unique live claim prevents concurrent orchestration attempts for the same task/role, including attempts from different runs.
- Compact report records link to the task-thread association, task comment, artifact references, and optional decision response. They are Tasks results, not a duplicate task store. Detaching a worker must preserve immutable report provenance even when its active association is removed.

Thread plugin metadata carries run/task/attempt correlation at spawn time for recovery. Validate it as untrusted data and compare it with Tasks records and BB identity/project/parent facts. It never grants authority. Do not put secrets in these records or copy readonly metadata as executable prompt directions.

Alternative rejected: an external task-to-worker registry. It would disagree with manual attach/detach and task changes.

Scope fingerprints cover tracker descriptions and linked-specification references, including epic acceptance text, not repository file contents. A changed fingerprint requires user confirmation before a new dispatch or continuation. Comments, statuses, and newly reported result artifacts do not count as scope edits. Workers report changes discovered in linked specification contents; the coordinator does not inspect those files to classify them.

### 4. Make compact status a read-only projection

`orchestrate status <epic> --json` works before a run exists. Query subtasks, dependency state, attachments, primary roles, dispatch claims, and latest explicit reports from Tasks in bounded batches. Resolve BB activity and interactions for the known attached workers with bounded concurrency, reusing the existing lifecycle cache and marking stale or unavailable data rather than guessing.

Return task status separately from worker activity, native dependency readiness separately from artifact-handoff readiness, and epic integration/verification separately from subtask totals. Include actual worker IDs for primary roles and a capped list of other attachments with totals. Use stable report, comment, attachment, interaction, and thread references instead of full content.

Initial limits are 100 subtasks and 128 KiB serialized output. Cap summaries, other attachments, result references, and decision excerpts with explicit totals and overflow indicators. If the complete required task list cannot fit, return an explicit size-limit error and counts, never a partial list that looks complete. Report generation timestamps and external-state staleness; the response is not a cross-store atomic snapshot.

Alternative rejected: repeatedly reading task comments and thread output. It is unbounded, cannot identify unresolved questions reliably, and gives the coordinator investigative work.

### 5. Use fail-closed dispatch claims, not a new scheduler

The orchestration dispatcher consumes an active approved run and a ticket/role. Its behavior is:

1. Validate run ownership, project membership, approved scope, task status, current blockers, prerequisite handoffs, preset, and required environment intent. Read current Tasks state, not a readiness flag cached by the agent.
2. Resolve the existing primary association. Reuse it without sending another seed or interrupting it. If only one plausible legacy worker exists, return a proposed adoption for explicit owner selection. Multiple candidates, a missing/deleted worker, a failed or manually stopped owner, or a ticket with recorded prior work but no owner require resolution rather than another spawn.
3. Reserve a unique durable claim in a Tasks transaction, rechecking eligibility there. Do not hold a SQLite transaction open across SDK calls.
4. Persist the attempt phase before invoking BB. Spawn with `parentThreadId` and correlation metadata, using existing preset/environment resolution and the existing ticket prompt builder.
5. Save the worker identity, attach it, designate its role, and update the ticket as one local Tasks transaction. Record success and publish existing invalidations.
6. On retry, inspect the claim and reconcile through BB's child/plugin-origin listings and metadata. Link a discovered existing thread without spawning or reseeding. A lost response, interrupted listing, zero matches after a timeout, or multiple matches leaves the attempt unresolved.

This sequence is not atomic across BB and Tasks. A worker can become active before attachment commits. Its initial prompt and creation metadata already identify its task and parent, so recovery can attach that same active worker. Do not delete or replace it as compensation for an attachment error.

Use the existing BB dispatch hook to recheck dependencies and approved run state when a queued orchestration worker actually begins, and before any coordinator-requested continuation. Reject invalid work rather than warning or relying on capacity queue order. Confirm the queued creation/rejection behavior with failure-injection tests; it must not release the claim or create a replacement. A rejected or deferred first turn still needs reconciliation if BB has created its thread row. Do not use an orphanable plugin wait as the sole protection for an unattached worker. Admission enforcement requires the plugin to be active; disabled plugins are not an authorization or scheduling mechanism.

After a definite pre-creation refusal, the claim can become retryable only when BB's observed contract establishes that no worker row exists. After ambiguous outcomes, keep the claim until an operator explicitly resolves it. Claim release requires a fresh successful reconciliation and a warning that an operator release cannot prove a delayed creation impossible; it never spawns as a side effect. A replacement owner requires explicit approval and preserves prior association/report history.

BB and concurrency-limit decide capacity, provisioning, and dispatch timing. The coordinator makes bounded dispatch requests and reacts to reports; it does not count slots in a polling loop.

Alternative rejected: an in-memory mutex or lease timeout as proof of failure. Neither survives restart nor rules out a delayed first spawn.

### 6. Persist explicit reports and reuse BB notifications

Add one validated report entrypoint accepting completion, review readiness, blocker, failure, or decision-needed outcomes. Infer the reporting thread from CLI/tool context, validate its task association or recoverable spawn claim, and use a report ID for retry deduplication. Store a bounded summary and typed artifact references, link a normal task comment, and keep task status changes explicit. A report cannot set the epic done merely because it says completion.

The seed prompt tells a worker to follow its ticket, linked specifications, acceptance criteria, and project instructions, then report outcome and references. It adds no mandatory discovery phase or OpenSpec-specific workflow. Workers can report while still active; do not wait for idle to represent blockers or questions.

Native child outcome and pending-interaction notifications remain the default wake mechanism. A durable report notification routes to the run's coordinator only where the native notification does not convey an actionable report promptly, including reports during an active turn and adopted workers parented elsewhere. Use report references, delivery identity, and bounded coalescing to prevent redundant wakeups. If delivery fails or is ambiguous, keep its state visible in status and allow explicit reconciliation. Do not add report polling or replay notifications automatically on plugin enable.

Native parent messages can advise inspecting a failed child. The skill instead delegates diagnosis to the owning worker or another approved worker; it must not obey that generic advice by investigating transcripts or the repository itself.

Alternative rejected: `comment --notify` for reports to the coordinator. Its latest-commenter targeting is correct for the existing feature but wrong for this role.

### 7. Aggregate decisions without building an inbox UI

Status lists the ID, originating worker/task, bounded question, kind, and unresolved state of existing BB interactions. For a free-form `needs_decision` report, the report ID is the decision ID and its recorded response closes it. No separate decision registry is needed.

Route a user's answer to the original BB interaction or to the exact reporting worker and record its reference in Tasks. Validate that the question is still pending and belongs to the run. Retrying an identical answer returns its prior outcome; conflicting or stale answers require user resolution. Never resolve an approval automatically from run authorization or a coordinator-generated answer. Publishing, merges, and production operations keep their existing approval mechanisms.

Alternative deferred: a dedicated epic decision panel. The existing interaction UI and compact response are enough for this change.

### 8. Pass artifacts, then delegate epic acceptance

An upstream `done` task supplies result references and, when code is involved, the baseline/commit/branch or patch information its consumer needs. These are worker-reported facts, not data the coordinator verifies through repository commands. Missing reports, incompatible baselines, or a canceled prerequisite whose deliverable is still needed produce a handoff blocker or user decision even when native dependencies are resolved.

Every downstream seed or explicit continuation includes its current ticket context, prerequisite report/result references, and the approved intended baseline. Existing owning workers receive changed handoffs through a deliberate deduplicated message, not through automatic reseeding on dispatch retry.

Integration and whole-epic verification are a separate role attached to the existing epic. Dispatch uses the same claim/reuse rules but explicitly selects that role; it does not spawn an implementation worker for the epic by accident. The integration worker consumes subtask results, checks the epic's actual acceptance criteria, and reports evidence, baseline, and any gaps. The coordinator reports the outcome from that record. It does not run tests, integrate, review, or diagnose the gap.

All subtasks being done permits considering integration; it does not imply epic success. New suggestions are recorded separately from approved work, without creating tickets or expanding the run. If a reported repair is within an existing approved ticket, coordinate its owner under the same restrictions; otherwise ask the user to plan or approve the additional work elsewhere.

## Risks / Trade-offs

- Lost spawn responses sacrifice unattended progress. Mitigate with durable claims, metadata reconciliation, and explicit operator resolution instead of duplicate workers.
- Spawn can run before attachment commits. Mitigate with parent/task correlation seeded at creation, fast local attachment, recovery of the original child, and no automatic compensation delete.
- Provider skill handling differs. Mitigate with actual BB-path acceptance checks and fail-closed activation on unverified paths. Native prompt filtering is only one check.
- Native repository tools remain available to providers. Mitigate with the short explicit role contract and workflow verification; do not claim a plugin-only security sandbox.
- External BB state can race a Tasks snapshot. Mitigate with staleness markers, dispatch-time rechecks, and admission checks for delayed execution.
- Legacy workers may have multiple attachments or missing outcomes. Mitigate with explicit ownership adoption and worker-supplied reports, not heuristics based on newest, idle, or missing threads.
- Existing full-permission presets do not grant new restricted-operation approval. Keep those actions outside routine run authority and relay actual user approvals.
- Plugin disable removes plugin admission checks. Document that runs must be paused and queued orchestration work resolved before disabling; do not treat enabling as permission to resume.

## Migration Plan

1. Add forward-compatible Tasks migrations for run records, claims, nullable association roles, and reports. Preserve all existing task, comment, attachment, preset, and worker records.
2. Ship compact status first, then dispatch/recovery and reports. All reads work without an active run; all writes require their validated run/worker context.
3. Bundle the skill only after activation guards and failure-path tests pass. Keep startup and enable handlers free of orchestration sends or spawns.
4. Verify the package build and installed skill through disposable BB tasks and threads with a non-publishing preset. Do not modify TENET-30 or BBP-8.
5. Before rollback or disable, pause runs and inspect queued/in-flight work through existing BB controls. Preserve Tasks data and reports. Reverting the package does not cancel already accepted BB work or migrate results back to bundled Tasks.

No new external dependencies, separate plugin package, or core deployment is planned.
