# Epic orchestration status spec delta

## Purpose

Gives coordinators one bounded view of an epic's current Tasks state, worker activity, explicit outcomes, and pending decisions without reconstructing comments or transcripts.

## ADDED Requirements

### Requirement: Compact read-only epic status

The system SHALL provide one read-only epic-status response before and during a run. It SHALL include every supported subtask's identity, task status, dependency readiness, blockers, owning worker, other worker attachments, activity, latest explicit outcome, result references, and pending decisions. It SHALL include run scope, unresolved ownership/dispatch state, and epic integration/acceptance state when present. It MUST NOT require repository reads or transcript/comment reconstruction.

#### Scenario: Mixed dependency graph

- **WHEN** an epic has three independent subtasks and a fourth blocked by two of them
- **THEN** one response identifies the three dependency-ready tasks, the fourth task's blockers, and available worker/outcome/decision state for each

#### Scenario: Status before activation

- **WHEN** the user requests status for an epic with no orchestration run
- **THEN** the response describes existing task and worker state without creating a run or worker

### Requirement: Independent task and worker state

Status SHALL distinguish ticket completion from worker activity, dependency readiness from result-handoff readiness, and subtask completion from epic acceptance. Idle, deleted, missing, failed, or unattached workers MUST NOT establish task completion or prove a task untouched. Unavailable external state SHALL be marked unknown or stale with its observation time.

#### Scenario: Idle worker with unfinished task

- **WHEN** a worker is idle and its ticket is `in_progress`
- **THEN** status retains the unfinished ticket status and identifies the worker as idle, not complete

#### Scenario: Missing owner

- **WHEN** a previously owned or active ticket has no available attached worker
- **THEN** status identifies unresolved ownership instead of presenting the ticket as untouched and eligible for a fresh worker

#### Scenario: Native readiness without artifacts

- **WHEN** a prerequisite is done or canceled but a required deliverable reference is missing
- **THEN** native dependency readiness is shown separately from the unresolved artifact handoff

#### Scenario: Completed subtasks with incomplete epic

- **WHEN** every subtask is done but integration or acceptance work remains
- **THEN** status shows the remaining epic-level work and does not infer epic success

### Requirement: Bounded and honest output

The initial status operation SHALL support at most 100 subtasks and at most 128 KiB of serialized output. Growing text, auxiliary worker lists, artifact references, and decision excerpts SHALL have explicit limits and overflow counts. Required subtask identities and eligibility state MUST NOT be silently omitted. An epic that exceeds the supported complete-response limits SHALL return an explicit size-limit error with counts instead of a misleading partial ready list. Status SHALL expose generation time and external-state staleness rather than imply a cross-store atomic snapshot.

#### Scenario: Oversized epic

- **WHEN** an epic has more than 100 subtasks or its required compact state exceeds the response byte limit
- **THEN** the operation returns a size-limit error and counts without presenting an incomplete dispatch list

#### Scenario: Auxiliary overflow

- **WHEN** a task has more historical attachments or result excerpts than the compact response permits
- **THEN** the response caps those auxiliary fields and states the omitted counts and stable references without hiding task eligibility

### Requirement: Tasks remains authoritative

Status SHALL derive scope membership, dependencies, ticket status, worker attachments, and recorded results from Tasks. Run metadata SHALL contain only authorization, approved scope references, execution/baseline selection, and coordination bookkeeping. Manual task/attachment changes SHALL be reflected without a parallel task-to-worker registry.

#### Scenario: Manual attachment change

- **WHEN** a user detaches an owning worker or attaches an additional worker directly through Tasks
- **THEN** the next status response reflects that change and identifies any ownership ambiguity
