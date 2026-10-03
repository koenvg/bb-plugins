# Tasks

The user approved a temporary authorization boundary on 2026-10-03: trust BB-recorded user classification for identifiable exact explicit invocations and native decisions. This does not prove human identity. BB 0.44.0 agent self-sends can acquire user/null attribution. BBP-51 is the separate investigation follow-up and is not an epic dependency. All other authorization and approval checks remain required.

## 1. Verify plugin-only activation contracts

- [x] 1.1 Add focused provider-path fixtures for BB selected-skill mentions and exact native invocations using current SDK input/provenance. Verify Pi selection translation, BB-recorded user classification and persisted invocation references without modifying core or SDK. Test the accepted agent self-send user/null limitation and link BBP-51; do not claim actual human identity.
- [x] 1.2 Verify current BB behavior for queued first turns, dispatch-hook rejection, created thread rows, and lost spawn responses. Record the observed recovery rules and test that rejection never implies permission to spawn a replacement.
- [x] 1.3 Add activation guard tests rejecting quoted commands, automatic skill consideration, agent/system notifications, mixed messages without identifiable user invocation, stale invocations, and metadata-only claims. Verify no rejected case calls `threads.spawn` or changes Tasks.
- [x] 1.4 Document verified provider paths and fail-closed unsupported-path behavior in Tasks-plus documentation. Verify every support claim names an actual BB-path check rather than a frontmatter-only test.

## 2. Add Tasks-owned state and compact epic status

- [ ] 2.1 Add additive migrations and focused orchestration store methods for runs, tracker-scope fingerprints, nullable task-thread roles/ownership, dispatch claims, and linked reports. Verify migration of existing records, uniqueness constraints, and rollback-safe preservation with database tests.
- [x] 2.2 Implement the bounded read-only epic projection using Tasks dependency/association queries and bounded BB activity/interaction lookups. Verify the independent-subtask/dependent-subtask fixture, read-before-run behavior, and no spawn/send mutations.
- [x] 2.3 Expose `bb tasks orchestrate status <epic> --json` through the existing CLI/RPC conventions. Verify idle versus done, missing owner versus untouched, unknown/stale activity, report references, pending decisions, and epic acceptance state in contract tests.
- [x] 2.4 Enforce 100-subtask and 128-KiB response limits with explicit auxiliary overflow counts and complete-list errors. Verify large comments, attachments, results, and interactions cannot produce an apparently complete partial dispatch list.
- [x] 2.5 Document the compact response and state distinctions in the Tasks skill reference or README. Verify examples use real declared commands and preserve existing status and dependency semantics.

BBP-34 verifies items 2.2 through 2.5 through CLI/RPC and disposable Tasks/SDK
fixtures. BBP-35 adds run persistence. BBP-36 now wires effective runs, designated
roles and unresolved claims into the same read transaction. Reports, reported
decisions and epic acceptance remain unknown until their owning slices exist.
Item 2.1 remains unchecked because linked report persistence is not delivered.
Slice checks do not establish the integrated epic/provider acceptance in 6.3.

## 3. Implement authorized runs and safe dispatch-or-reuse

- [x] 3.1 Implement run begin, pause, and explicit resume bound to verified explicit BB-recorded user invocation/native decision, epic scope, presets, and baseline references. Verify duplicate invocation reuse, missing-parameter interaction, scope fingerprint changes, restricted-approval separation, and startup/enable without orchestration sends.
- [x] 3.2 Extend task-thread associations with explicit owner adoption and role selection while preserving manual attach/detach. Verify existing owner reuse without reseeding, ambiguous legacy attachments, in-progress and todo tickets with prior work but no owners, and missing/failed/manually stopped workers.
- [x] 3.3 Extend the delegation module with a transactionally reserved dispatch claim and parent/task/attempt metadata at spawn. Reuse preset/environment resolution and ticket prompt construction. Verify concurrent same-task requests across runs invoke spawn at most once and local association/status changes commit together.
- [x] 3.4 Add orchestration-specific dispatch and continuation admission checks using current dependencies, scope, handoffs, and approved run state. Verify blocked and reopened prerequisites, delayed capacity admission, paused runs, and unchanged legacy warning behavior.
- [ ] 3.5 Implement explicit reconciliation and operator recovery of known or ambiguous creation attempts. Verify failure before creation, response loss, attachment failure, worker activation before attachment, restart, unavailable listings, zero/multiple matches, and recovery without another spawn or compensation deletion.
- [ ] 3.6 Add explicit owner replacement/claim-resolution commands under the orchestration namespace. Verify fresh reconciliation, cross-project refusal, active-creation refusal, original-worker precedence, history preservation, duplicate-risk warning, and no spawn/resume side effect.
- [ ] 3.7 Document dispatch outcomes, adoption, ambiguous-failure recovery, capacity reuse, and disable/rollback limits. Verify documented recovery examples against disposable fixtures and confirm no scheduler or polling loop was added.

BBP-36 checks use public CLI/RPC/store/hook fixtures and one installed native
queue checkpoint on BB 0.44.0. The checkpoint uses a test-only wait gate and
fixture run authority. It verifies delayed rejection and retained native identity,
not human approval or a naturally exhausted capacity pool. Lost responses and
pre-attachment activity use failure injection. Role storage covers implementation,
orchestrator and integration; this slice dispatches/adopts implementation subtasks
only. Required prerequisite handoffs refuse as unknown until the report slice
supplies its authoritative reader. Items 3.5, 3.6 and the complete recovery examples
in 3.7 remain owned by BBP-37. Dispatch/ownership/rollback documentation is present.

## 4. Record reports, decisions, and artifact handoffs

- [ ] 4.1 Implement the bounded worker-report contract, task/comment links, contextual thread validation, and report retry identity. Verify all five outcome kinds, active-turn reports, recoverable pre-attachment reports, wrong-worker rejection, deduplication, and explicit task status behavior.
- [ ] 4.2 Reuse native parent notifications and add targeted report-reference delivery only where needed for active-turn or differently parented adopted workers. Verify coalescing/delivery identities, paused/unapproved runs, failed/ambiguous delivery state, and unchanged `comment --notify` and "Unblocked" behavior.
- [ ] 4.3 Aggregate existing BB interactions and unresolved free-form decision reports in epic status. Route recorded user answers to the original interaction or worker. Verify explicit BB-recorded decision references under the temporary BBP-51 boundary, stale/mismatched/conflicting decisions, identical answer retries, and no coordinator-generated restricted approval.
- [ ] 4.4 Extend worker seed/continuation context with prerequisite report/artifact references and intended baseline. Verify missing artifacts, canceled prerequisites, incompatible reported baselines, worker-specific instructions, and no duplicate handoff messages on dispatch retry.
- [ ] 4.5 Add integration/verification role dispatch attached to the existing epic using the same ownership and claim rules. Verify completed subtasks still require whole-epic acceptance, evidence/baseline reporting, failed acceptance, and separation of additional scope suggestions.
- [ ] 4.6 Document the report convention, decision routing, baseline references, and integration acceptance evidence. Verify sample reports validate and workers are not given a mandatory discovery phase or OpenSpec-specific workflow.

## 5. Bundle the coordination-only skill

- [x] 5.1 Add `bb-plugin-tasks-plus/skills/bb-orchestrator/SKILL.md` with the accepted name/heading, manual-only metadata, and short coordination instructions. Verify its text forbids repository inspection, implementation, tests, review, integration, and failure investigation by the coordinator, including generic native failure-inspection advice.
- [x] 5.2 Add only the necessary command/support reference outside the short skill and confirm existing manifest/package skill inclusion. Verify command discovery and package artifacts include the new skill without changing the plugin's Tasks identity or BB picker behavior.
- [x] 5.3 Verify bundled skill discovery and explicit activation through actual installed BB provider paths using disposable fixtures. Check install/enable/reload and ordinary task discussion perform no orchestration; explicit invocation starts one approved run; unsupported paths refuse safely. Record the tested provider/version matrix.

## 6. Verify the full plugin workflow

- [ ] 6.1 Exercise a disposable epic with independent and dependent tickets, worker reuse, an active-turn question, a user answer, and artifact handoffs. Verify event-driven coordination, no repeated routine-dispatch approval, and no coordinator repository/test/review/integration commands.
- [ ] 6.2 Exercise an epic whose subtasks are done but whose integration worker first fails acceptance and later reports verified evidence. Verify separate epic state, delegation of diagnosis/repair, approval of any added scope, and outcome reporting from worker references.
- [ ] 6.3 Run the package's focused and full tests, typecheck, lint, and `bb plugin build` after implementation. Verify compatibility of existing Tasks workflows, metadata migrations, startup inactivity, and the generated skill package; do not use TENET-30 or BBP-8 as mutable test data.
