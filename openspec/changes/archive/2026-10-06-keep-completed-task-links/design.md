# Design

## Context

See `proposal.md` for the user-visible problem. The installed worker's history confirms that it ran `bb tasks update ALLERGIES-6 --status done --json && bb tasks detach ALLERGIES-6` at 2026-10-05 17:52:45 UTC. The detach command succeeded. Earlier history confirms that the worker read the Tasks skill's instruction to detach when work ends.

The repository and installed guidance both contain that instruction. `skills/tasks/references/task-records.md` also tells agents to detach a predecessor after handoff, replacement, or failure, and the README describes dropping threads that died or moved on. These routes must agree with the new rule.

The current header reads persisted associations through `getTasksForThread`. Neither the component nor `listTasksForThread` filters Done tasks. Its UI tests already cover an In Review to Done status update with a retained mock link. The delegate handler stores an association when dispatching; explicit detach deletes it. Changing status does not delete it.

A design artifact is needed to coordinate the guidance, worker prompt, documentation, and regression tests, and to distinguish a retained association from execution ownership.

## Goals / Non-Goals

Goals:

- Change the instructions agents receive, without adding a different source of task identity to the header.
- Keep the retention and detach rules consistent across the public guidance entry points.
- Prove the persisted association and the visible chip survive completion.

Non-goals:

- No inference from thread titles, message task cards, or comments.
- No new link history table, detach authorization service, or ownership state.
- No automatic repair of ALLERGIES-6 or any other detached task.
- No changes to stored presets, historical comments, or already delivered prompts.

## Decisions

### 1. Correct guidance rather than change status handling

Replace the completion-detach instruction in `skills/tasks/SKILL.md` with an explicit retention rule. Update the repair reference and README so failure, replacement, and handoff do not silently authorize detach either. Add the rule to the generated worker report-back contract in `delegate/index.ts`, so new workers receive it even if they do not load the skill.

Alternative considered: stop the status update from removing associations. Rejected because status updates already retain them; the separate detach command is the cause.

### 2. Keep explicit detach and persisted associations unchanged

The existing CLI/RPC and task-page controls remain available. For agents, task completion is not permission to detach; a user must explicitly request removal of the link. This is an instruction contract, not a new server-enforced permission check.

Retained links describe the thread's connection to the task. They do not create primary ownership, grant report authority, dispatch new work, or bypass existing orchestration checks. Existing active-thread status and ordering continue to apply.

Alternative considered: retain deleted associations in a separate historical table. Rejected because it adds schema and query changes that are not needed to stop completion cleanup from deleting links.

### 3. Test both instructions and public behavior

Add focused semantic assertions for retention and explicit detach in the skill, repair reference, and generated worker prompt. Reuse the reporting test fixtures and delegated-worker integration harness rather than snapshotting full prose.

Add an integration test that dispatches or attaches a worker, updates the task to Done through the public API, and confirms both task-thread listing and `getTasksForThread` still return the association. Cover explicit detach separately to show that removal still works and does not change task status or stop the thread. Extend the header tests for initially Done tasks and opening them, preserving the existing transition and compact-view tests.

Alternative considered: only add another header mock test. Rejected because the existing mock-based transition test already passes and cannot detect the problematic completion instructions.

## Risks / Trade-offs

- Old or active agents can still follow the earlier detach instruction. Mitigation: state that updated prompts affect new dispatches and updated skills affect agents that read them; do not claim retroactive enforcement.
- Retaining predecessor links can increase the number of linked threads and the header's task count. Mitigation: keep current ordering, counts, and manual removal controls; do not treat old links as active work.
- An agent can ignore guidance and call detach. Mitigation: document the instruction-only boundary and test the public guidance, not claims about model compliance.
- Restoring ALLERGIES-6 alone would hide the instruction problem. Mitigation: leave data repair out of this change and require a separate explicit request for any restoration.

## Migration Plan

1. Update the source guidance, worker prompt, README, and focused tests during apply.
2. Run the focused guidance, delegation/API, and header tests, then the plugin's relevant type and build checks.
3. Install and reload the updated Tasks Plus source only in a separately authorized deployment or verification step. The currently installed plugin is a separate local source copy, so editing this checkout alone does not update installed behavior.
4. Confirm a disposable completed task keeps its link and header chip, and explicit detach still removes the chip. Do not use production task data as a disposable fixture.

No database migration is required. Rollback restores the previous plugin sources and guidance; it does not delete links retained while the new guidance was active.
