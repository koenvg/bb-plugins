# Design

## Context

See proposal.md for motivation and specs/bb-orchestrator/spec.md for the behavior contract.

Orchestrator is embedded in Tasks Plus. server.ts creates its run controller, dispatcher, reporter, and status projection. cli/index.ts imports their command factories and accepts them as optional registration parameters. app.tsx registers the orchestrator-run approval renderer. The implementation and its tests are contained in orchestration/, while agent guidance lives in skills/bb-orchestrator/.

Migrations 8, 9, and 10 add historical tables and task_threads role/primary_owner columns. The schema has later migrations, and db.test.ts currently expects 11 applied versions. Rewriting old migrations would change the meaning of version numbers on existing installations.

The earlier bb-orchestrator change remains active, with four unsynced capability deltas. No corresponding main capabilities exist. The removal contract must not be confused with delivering that older change.

## Goals / Non-Goals

**Goals:**

- Remove the feature by deleting its registration and implementation, not by adding a configuration flag.
- Keep ordinary Tasks independent of the deleted module.
- Test absence at public registration boundaries and compatibility through the Tasks store.

**Non-Goals:**

- Add a replacement status dashboard, report system, or scheduler.
- Drop historical tables or erase comments, links, reports, or migration versions.
- Repair previous failed fixtures or update existing workers' prompts.
- Install, reload, publish, inspect signed-in native sessions, stop workers, or change tracker task status without separate approval.

## Decisions

### Delete registrations and the complete module

Remove all Orchestrator imports and setup in server.ts. Restore registerTasks to a single BbPluginApi parameter and registerTasksCli to its ordinary bb/store/status parameters. Delete the command spreads in cli/index.ts and the pending-interaction renderer registration in app.tsx.

Delete orchestration/ and skills/bb-orchestrator/ rather than keeping deferred stubs or aliases. A feature flag would retain the maintenance burden and permit accidental reactivation. Host unavailable behavior is the explicit breaking API contract.

Retain ordinary task-start recovery and approval. Those belong to Tasks and are not the Orchestrator run controls.

### Keep old migrations and records

Leave db/schema.ts migrations 8 through 10 unchanged, including role and primary_owner columns, and preserve all later migrations. Add no new schema version for this removal. Old records remain inactive storage, not a supported reporting or recovery interface.

Deleting migration entries would renumber later migrations. Dropping tables would destroy history and complicate rollback. Neither is needed to remove runtime behavior.

Test existing databases with representative historical rows, not only empty initialization. Include a task-thread association with role metadata and verify that ordinary link operations still work.

### Remove only feature-specific delegation options

prepareTaskWorker in delegate/index.ts has an attachmentState option introduced for shared Orchestrator use. Check callers when deleting the module. If ordinary delegation only uses the attached state, remove the unused option and obsolete sharing comment while preserving the actual delegation prompt and behavior. Keep ordinary progress-reporting guidance and link-retention rules.

Do not refactor unrelated Tasks internals.

### Replace active usage documentation, preserve historical evidence

Remove README sections that advertise scope controls, status, report tools, deferred dispatch, and Orchestrator recovery. Add a short removal and compatibility note without operational commands for the deleted feature. Audit remaining runtime source and skill references; historical specifications and immutable migrations are allowed references.

During apply, mark the older change's proposal and task list as superseded, link this removal, and state that remaining implementation tasks are withdrawn, not completed. Keep its original evidence and deltas as history. Do not archive it as delivered or synchronize its old positive requirements over this removal contract. Do not change external tracker tasks in this change.

The new delta uses the bb-orchestrator capability path with ADDED retirement requirements because there is no main specification to modify or remove. This is a durable unavailability contract, not a new feature. If another change creates that main spec before apply, reconcile the delta against the actual main requirements before synchronization.

### Verify at public boundaries

Add or retain host-harness tests outside the deleted module for production registration: ordinary Tasks RPCs and CLI commands remain, Orchestrator RPCs/tools/commands are absent, and initialization/reload has no Orchestrator worker-input effects. Test frontend registration without the orchestrator-run renderer.

Keep database compatibility tests in db.test.ts or db/ tests. Do not retain Orchestrator runtime code solely to construct fixtures. Use the retained schema directly for historical fixture rows.

Run the full Tasks Plus test suite, typecheck, root lint/format checks, and bb plugin build. Inspect the built package for deleted skills and module references. Complete one fresh-context read-only review against the pre-implementation baseline.

## Risks / Trade-offs

- Existing scripts and worker prompts use deleted entrypoints. Mitigation: document the breaking removal; users can post ordinary task comments. Do not silently convert or send reports.
- Historical storage remains in new databases. Mitigation: treat it as inert compatibility storage; defer destructive cleanup to a separately approved data migration.
- Native queues or workers can outlive the plugin. Mitigation: no automatic stop or cancellation. Any approved live install must first inspect pending approvals and accepted work, and resolve them through BB controls before unloading external fixture guards.
- Shared delegation code could be deleted with the feature. Mitigation: retain ordinary delegation tests and verify all surviving callers.
- The old planning change could reintroduce removed capabilities. Mitigation: mark it superseded during apply and do not synchronize its positive deltas.

## Migration Plan

1. Record the implementation baseline and add absence/compatibility tests.
2. Remove registrations, module, skill, feature-only helper options, and active documentation.
3. Mark the earlier planning change superseded without declaring its unfinished tasks done.
4. Run validation, build inspection, and the single completion review.
5. Stop at the source change. Installation and publication are separate actions.
6. If installation is later approved, inspect outstanding native work and approvals before reload. Do not unload fixture guards while native input remains queued.
7. Rollback can restore the previous source/package because storage was not changed. Rollback does not authorize resuming old runs or replaying input.
