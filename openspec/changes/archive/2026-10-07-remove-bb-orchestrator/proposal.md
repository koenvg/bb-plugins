# Proposal

## Why

The operator wants to remove the recently added Orchestrator entirely. Its current manual-first release adds scope approvals, report storage, ownership tracking, and recovery code but leaves worker coordination to the operator.

## What Changes

- **BREAKING** Remove every Orchestrator CLI command, RPC, agent tool, approval renderer, and bundled skill. Do not keep deferred commands or compatibility aliases.
- Delete the Orchestrator runtime, tests specific to that runtime, and its active usage documentation.
- Remove Orchestrator-only parameters and imports from Tasks Plus registration and ordinary delegation helpers.
- Keep ordinary Tasks commands, manual delegation, task/thread links, dependencies, comments, notification behavior, presets, task-start recovery, and progress-reporting guidance unchanged.
- Keep existing migration versions and historical database records for upgrade safety. Retained storage is not an available feature and must not register handlers or replay work.
- Mark the earlier `bb-orchestrator` planning change as superseded by this removal during implementation. Preserve its historical evidence rather than present it as future work to deliver.

## Capabilities

### New Capabilities

- `bb-orchestrator`: Define the retired feature's availability boundary and compatibility guarantees. There is no main specification at `openspec/specs/bb-orchestrator/`; the earlier requirements exist only in the active `bb-orchestrator` change. This delta establishes the replacement contract, not a new Orchestrator implementation.

### Modified Capabilities

None. Existing `task-thread-start` and `task-progress-reporting` requirements remain unchanged.

## Impact

- `bb-plugin-tasks-plus/server.ts`, `cli/index.ts`, and `app.tsx` lose all Orchestrator registration and dependencies.
- Remove `bb-plugin-tasks-plus/orchestration/` and `skills/bb-orchestrator/` from the shipped package.
- Update the Tasks Plus README, registration tests, and any remaining Orchestrator-only delegation options.
- Preserve migrations 8, 9, and 10 in `db/schema.ts`, including retained task-thread role columns, and all later migrations. No destructive migration is planned.
- Existing `bb tasks orchestrate ...` callers and report tools stop working. They receive the host's normal unavailable-command, method, or tool behavior.
- This source change does not stop native workers, cancel accepted BB input, modify installed plugins, or change tracker task status. Live install, queued-work inspection, and publication require separate operator approval.
