# Task worker reports spec delta

## Purpose

Records explicit worker outcomes and artifact handoffs in Tasks, brings actionable questions to the epic coordinator, and routes actual user decisions back to their originating workers.

## ADDED Requirements

### Requirement: Explicit task-linked worker reports

Workers SHALL report `completed`, `review_ready`, `blocked`, `failed`, or `needs_decision` with task/thread identity, a bounded summary, and relevant result or evidence references. Reports SHALL be recorded in Tasks and linked to a readable task comment. The reporting context SHALL match an attached worker or a recoverable authorized dispatch attempt. Report retries SHALL deduplicate by report identity. Reports MUST NOT infer ticket or epic completion from worker idle state, and task status changes SHALL remain explicit.

#### Scenario: Review-ready implementation

- **WHEN** a worker reports `review_ready` with its review artifact references
- **THEN** Tasks records that outcome without silently marking the task or epic done

#### Scenario: Repeated report

- **WHEN** the worker repeats the same report after losing its response
- **THEN** the existing report and comment are returned without duplicating them

#### Scenario: Wrong reporting worker

- **WHEN** a thread without a validated association or recoverable claim reports against a task
- **THEN** the report is rejected without attaching that thread or accepting its outcome

### Requirement: Actionable notifications without polling

Actionable worker reports and pending decisions SHALL notify the approved coordinator through existing BB parent notifications or targeted BB messages. A report made while a worker remains active or from an adopted worker with another parent SHALL still be deliverable without waiting for idle. Notifications SHALL use stable report/interaction references, prevent redundant delivery attempts for the same known outcome, and expose failed or ambiguous delivery in compact status. Notifications MUST NOT start an unapproved or paused run or require an agent polling loop. Existing `comment --notify` targeting and non-notifying "Unblocked" comments SHALL remain unchanged.

#### Scenario: Active worker asks a question

- **WHEN** an authorized active worker reports `needs_decision`
- **THEN** the coordinator receives an actionable question reference without waiting for the worker to become idle

#### Scenario: Adopted worker has another parent

- **WHEN** a worker adopted by the run reports a blocker but remains parented to another BB thread
- **THEN** the report reaches the run's coordinator without stealing that worker's parent relationship

#### Scenario: Notification failure

- **WHEN** BB cannot confirm delivery of a report notification
- **THEN** the report remains stored and its delivery uncertainty is visible for explicit reconciliation

### Requirement: Epic-level decision collection and answer routing

Compact status SHALL collect existing pending BB interactions and unresolved free-form `needs_decision` reports for run workers with their task, worker, and decision identities. Answers SHALL return to the originating interaction or exact worker and be recorded with their Tasks references. The temporary BB-recorded user decision boundary described in `bb-orchestrator` applies here too; it does not prove human identity, and the accepted agent self-send limitation is tracked in BBP-51. A coordinator SHALL relay only an explicit recorded decision, never invent an answer. Stale, mismatched, mixed, ambiguous, or conflicting answers SHALL be rejected. Identical answer retries SHALL return their prior outcome. General run authority MUST NOT approve restricted actions.

#### Scenario: User answers a worker question

- **WHEN** the user answers an unresolved question through the coordinator
- **THEN** the answer is recorded and routed to the original worker or interaction, not to the latest task commenter

#### Scenario: Answer targets a resolved interaction

- **WHEN** an answer names an interaction already resolved or no longer associated with the run
- **THEN** the operation reports the stale decision without applying the answer elsewhere

#### Scenario: Separate approval remains required

- **WHEN** a worker's pending interaction asks permission to publish or merge
- **THEN** it requires a separate explicit native decision under the declared BB-recorded provenance boundary, and the coordinator cannot authorize it solely because the epic run is approved

### Requirement: Deliverable and baseline handoffs

Workers consuming prerequisites SHALL receive stable prerequisite report/artifact references and the intended integration baseline with their assignment or deliberate continuation. Native `done` or `canceled` status alone MUST NOT establish delivery of required code or artifacts. Missing references, incompatible baselines, or a canceled prerequisite whose deliverable is still required SHALL produce a handoff blocker or explicit decision. Dispatch retries MUST NOT duplicate handoff messages.

#### Scenario: Downstream consumes completed work

- **WHEN** a prerequisite is done with usable result references and a compatible reported baseline
- **THEN** its downstream worker receives those references and the intended baseline without the coordinator inspecting the repository

#### Scenario: Done without deliverable

- **WHEN** a prerequisite is done but its required result reference is absent
- **THEN** downstream work remains handoff-blocked even though native dependencies are resolved

#### Scenario: Canceled prerequisite

- **WHEN** a canceled prerequisite still supplies a deliverable needed by approved downstream work
- **THEN** the coordinator requests an explicit handoff/scope decision instead of treating cancellation as artifact delivery

### Requirement: Explicit integration acceptance report

The epic integration worker SHALL report the baseline it integrated or verified, acceptance evidence references, and unresolved acceptance gaps. The coordinator SHALL summarize those reported facts without performing integration or verification. A failed acceptance report MUST NOT be converted to success based on completed subtasks.

#### Scenario: Whole-epic verification succeeds

- **WHEN** the integration worker explicitly reports that epic acceptance criteria are met and supplies baseline and evidence references
- **THEN** the coordinator can report the epic outcome from that record

#### Scenario: Whole-epic verification fails

- **WHEN** the integration worker reports a failed acceptance criterion
- **THEN** the failed outcome and references remain visible and any diagnosis or repair is delegated within approved scope or referred to the user for approval
