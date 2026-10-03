# Proposal

## Why

BB Tasks already records epic scope, dependencies, and worker threads, but an agent coordinating an epic must assemble state from several commands and cannot safely retry the existing always-spawn dispatch operation. A manually invoked, coordination-only skill needs compact status and recoverable worker ownership without replacing BB's execution and notification mechanisms.

## What Changes

- Bundle `skills/bb-orchestrator/SKILL.md` in `bb-plugin-tasks-plus`. Its heading is "BB Orchestrator"; BB's existing picker displays `bb-orchestrator`.
- Start runs only from explicit user invocation. Verify the actual BB provider path and guard activation in plugin code rather than relying on frontmatter alone. Installation, enabling, and ordinary task discussion do not start work.
- Add one bounded epic-status response with task readiness, blockers, owning and attached workers, activity, latest reports, result references, and pending decisions.
- Add orchestration-specific dispatch-or-reuse with hard readiness checks, parent-child threads, Tasks-owned dispatch claims, and recovery from partial creation failures. Ambiguous outcomes block another spawn.
- Add a small explicit worker-report contract and aggregate existing BB interactions. Route user answers to their originating workers; defer a dedicated decision-inbox UI.
- Deliver prerequisite result references and the intended integration baseline to consuming workers. Delegate integration and whole-epic acceptance verification to a separate worker attached to the epic.
- Keep approved scope separate from later suggestions. Preserve separate approval requirements for publishing, merging, production actions, and other restricted operations.

## Capabilities

### New Capabilities

- `bb-orchestrator`: Manual activation, coordination-only behavior, approved run scope, plugin packaging, and delegated epic acceptance.
- `epic-orchestration-status`: Bounded epic state derived from Tasks and BB worker/interaction state, without transcript reconstruction.
- `task-safe-dispatch`: Orchestration-specific ownership, readiness enforcement, dispatch-or-reuse, and fail-closed recovery.
- `task-worker-reports`: Explicit worker outcomes, artifact and baseline handoffs, notifications, and decision routing.

### Modified Capabilities

None. The new orchestration commands are additive. Existing `dispatch` warning behavior, task status semantics, comment notification targeting, and non-notifying "Unblocked" comments remain unchanged.

## Impact

- Extend the Tasks plugin's existing database migrations/store, delegation module, CLI registration, seed prompts, and lifecycle wiring. Add a focused orchestration module rather than orchestration logic inside the large CLI or database files.
- Reuse SDK thread spawn/update/send, parent notifications, interactions, plugin metadata, and dispatch hooks where verified. Reuse existing presets, environment providers, and concurrency control.
- Keep tasks, dependencies, attachments, worker associations, and reports in Tasks. Add only run authorization/scope metadata and durable dispatch bookkeeping; do not create a parallel task registry.
- No BB core, SDK, provider implementation, or picker-label changes. No new scheduler, task creation/planning workflow, mandatory discovery phase, or OpenSpec-specific worker workflow.
- Verify with disposable fixtures. TENET-30 and BBP-8 are read-only reference examples, never dispatch or migration fixtures.
