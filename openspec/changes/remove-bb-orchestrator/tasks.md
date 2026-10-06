# Tasks

## 1. Remove runtime entrypoints

- [x] 1.1 Record the pre-implementation commit and add production host-harness tests outside orchestration/ for absent Orchestrator CLI commands, RPCs, and report tools, while ordinary Tasks entrypoints remain available. Verify that the absence assertions fail against the current registration before removal.
- [x] 1.2 Remove Orchestrator setup and imports from server.ts and remove Orchestrator parameters, imports, and command spreads from cli/index.ts. Verify the focused registration tests pass and old calls produce normal unavailable behavior without mutations.
- [x] 1.3 Add a frontend registration assertion that orchestrator-run is absent while ordinary Tasks slots remain, then remove its app.tsx import and registration. Verify the focused app tests pass.
- [x] 1.4 Delete orchestration/ and skills/bb-orchestrator/. Remove feature-only delegation options and obsolete shared-use comments after checking all surviving callers. Verify ordinary delegate tests pass and no production source imports the deleted module.
- [x] 1.5 Remove Orchestrator usage sections and broken links from the Tasks Plus README, and add a short breaking-removal and retained-data note. Verify documentation no longer offers removed commands or tools and the ordinary Tasks skill remains available.

## 2. Preserve compatibility and historical evidence

- [x] 2.1 Add database tests with historical runs, owners, claims, reports, intents, capability contexts, and a role-bearing task-thread link. Reopen the same database and verify records and migration versions are unchanged and ordinary task/comment/link operations still work.
- [x] 2.2 Verify empty-database initialization and repeated store initialization succeed with the existing migration sequence. Keep migrations 8, 9, and 10 and all later migrations unchanged; confirm this with the baseline diff and focused database tests.
- [x] 2.3 Add host-harness coverage for loading and reloading with historical pending records and existing worker state. Verify no Orchestrator replay, worker creation/input/stop/delete, approval request, notification, or link removal occurs.
- [x] 2.4 Mark openspec/changes/bb-orchestrator/proposal.md and tasks.md as superseded, link this removal, and identify unfinished tasks as withdrawn rather than done. Preserve its historical deltas and evidence; verify no old requirements are synchronized as delivered and no external tracker task status changes.

## 3. Verify the complete change

- [x] 3.1 Run npm test and npm run typecheck in bb-plugin-tasks-plus, plus npm run check at the repository root. Verify the complete surviving Tasks Plus suite and affected static checks pass, including ordinary delegation, notifications, dependencies, task starts, and task-start recovery.
- [x] 3.2 Run bb plugin build in bb-plugin-tasks-plus and inspect the generated package. Verify the Orchestrator skill and runtime modules are absent and ordinary Tasks assets and skills remain. Do not install or reload the live plugin without separate approval.
- [x] 3.3 Audit the full source and documentation diff for remaining Orchestrator registrations, operational guidance, and broken references. Verify remaining mentions are limited to removal tests/notes, historical specifications/evidence, inert migrations, and unchanged ordinary guidance that requires no orchestration run.
- [x] 3.4 Run openspec validate remove-bb-orchestrator --strict and complete one fresh-context read-only review of the complete implementation diff against the recorded baseline. Resolve blocking findings and rerun affected checks before reporting removal complete.
