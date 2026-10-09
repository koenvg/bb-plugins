# Proposal

## Why

BB can show a Pi thread as idle while an async subagent is still running. The fork emits native background tasks with `skipTranscript: true`, but BB 0.45.0 excludes those items from its active background-task count, so emitting a pending item does not establish native working activity.

## What Changes

- Make the fork's async subagent items eligible for BB's native background-agent count and normal background-work display.
- Preserve normal main-agent turn completion, existing run identity, authoritative terminal reconciliation, and Pi completion delivery. Do not fabricate a main-agent turn to keep the thread working.
- Add regression checks for countable item payloads through the existing observation and bridge tests. Require installed acceptance to verify BB's actual activity count and display, not just delta assembly.
- Accept BB's normal background task rows in addition to the detailed Subagents panel. Do not add a custom working indicator.

## Capabilities

### New Capabilities

- `pi-subagents-lifecycle`: Add a narrow requirement for countable async subagent activity. This capability is already planned by the active `pi-subagents-provider` change but has no archived spec under `openspec/specs/`. Reuse its exact path and add a distinct requirement rather than duplicate or replace its existing pending requirements.

### Modified Capabilities

None. This change supplements the pending lifecycle capability and fixes implementation that conflicts with its existing native-activity intent.

## Impact

- Implementation: `bb-plugin-pi-subagents-provider/src/bridge/subagents/observation.ts`.
- Regression checks: `src/bridge/subagents/observation.test.ts` and `src/bridge/bridge.subagents.test.ts` within that package.
- Documentation: explain native background-work presentation in `bb-plugin-pi-subagents-provider/SUBAGENTS.md` if needed.
- No new dependency, SDK contract, BB core change, bundled Pi provider change, child BB thread, concurrency-slot claim, or Pi package change.
- Installation and bounded live agent work need separate approval. The proposal does not authorize installation, provider reload, or paid execution. Existing lifecycle-retention acceptance remains required; this fix alone does not prove retention beyond the cleanup deadline.
