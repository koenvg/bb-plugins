# Proposal

## Approved first release

The operator approved the manual-first reduction in BBP-33. It supersedes the original automated coordination acceptance for this release.

Retain the bundled bb-orchestrator skill, compact status, stored worker outcomes/non-notifying comments, immutable provenance/retries, native-approved scope records and bookkeeping-only recovery/history. Existing Tasks operator controls stay unchanged.

Defer all new orchestrator agent input. No reachable command, RPC, tool, startup/reload/event callback, report retry, recovery or skill path may spawn, seed, send, queue, recheck, continue or wake a worker. Excluded operations return a clear deferred result before execution or claim-creation effects. The skill must not recreate them through ordinary Tasks or thread APIs.

Automatic decision routing, artifact delivery and integration/acceptance-role orchestration are deferred top-level backlog in BBP-39/40/41. They are not delivered by this change.

## Capabilities

- bb-orchestrator manages explicit approved scope records and summarizes Tasks records for operator decisions.
- epic-orchestration-status supplies bounded task/run/worker/report state with unknown, stale and omitted information.
- task-safe-dispatch retains ownership/claim history and bookkeeping recovery. Execution entrypoints are deferred.
- task-worker-reports stores bounded outcomes, immutable origins and non-notifying comments with honest manual/suppressed delivery.

Scope begin/resume requires the retained genuine native approval path. Scope pause does not stop workers or cancel native work. No report or task total accepts an epic.

## Implementation and integration

BBP-38 owns reporting and the runtime cut on cumulative baseline 1eee962a6a095ec7d30080c9823f28f00b5162a3. Preserve migrations 8/9/10 and all historical reports, capabilities and receipt intents. No extra migration, platform/SDK/provider/dependency change or scheduler is needed.

BBP-42 separately integrates BBP-37 recovery, BBP-38 and BBP-86 UI exactly once onto that baseline. It verifies no agent-input path returns through conflicts, full/static checks, browser acceptance and one complete integrated review. Child handoff is not whole-epic acceptance.

The original paused installed fixture remains untouched and loaded. Historical post-pause executions remain failed evidence with unknown cause. No new provider fixture, native form, full-access case or platform investigation is approved for this reduction. Local handoff is allowed after validation and one completion review; publication remains separate.
