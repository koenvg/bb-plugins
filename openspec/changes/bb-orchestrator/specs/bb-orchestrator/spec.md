# BB Orchestrator spec delta

## Purpose

Lets a user explicitly coordinate an existing Tasks epic through a short bundled skill while workers perform all repository and acceptance work.

## ADDED Requirements

### Requirement: Bundled manual skill

The Tasks-plus plugin SHALL bundle a skill named `bb-orchestrator` with document heading "BB Orchestrator". BB's existing picker SHALL continue to display the invocation name. Installing, enabling, reloading, discovering, or automatically considering the skill MUST NOT create a run, dispatch a worker, or resume orchestration.

#### Scenario: Install without invocation

- **WHEN** the plugin is installed or enabled while an unfinished epic exists
- **THEN** the skill becomes available without creating workers, changing tickets, or starting a run

#### Scenario: Accepted presentation

- **WHEN** the user selects the bundled skill in BB
- **THEN** its invocation name is `bb-orchestrator` and its document heading is "BB Orchestrator"

### Requirement: Explicit activation through verified provider paths

A run SHALL begin only from an explicit user invocation bound to an existing epic and approved scope. The system MUST verify manual-only activation through each supported BB provider path, rather than infer support from a frontmatter flag. Agent messages, quoted commands, worker notifications, and editable metadata MUST NOT authorize activation. An unverified or unsupported path SHALL refuse activation with an explanation. Missing or ambiguous initial parameters SHALL be resolved with the user before dispatch.

#### Scenario: Explicit approved invocation

- **WHEN** the user invokes the skill through a verified BB path with an existing epic, approved subtasks, and valid execution selection
- **THEN** one run is bound to that invocation and coordinator thread
- **AND** repeated processing of the same invocation returns that run

#### Scenario: Automatic consideration cannot authorize work

- **WHEN** an agent loads the skill or requests run creation without a corresponding explicit user invocation
- **THEN** no run or worker is created

#### Scenario: Missing initial parameters

- **WHEN** explicit invocation does not identify the epic or execution selection unambiguously
- **THEN** the coordinator asks the user for the missing parameters before creating a worker

#### Scenario: Unsupported provider path

- **WHEN** the current provider path cannot establish explicit invocation with existing BB interfaces
- **THEN** activation is refused without spawning and without changing core or SDK behavior

### Requirement: Coordination-only role

The orchestrator SHALL read compact epic state, dispatch or reuse eligible workers, receive reports and questions, relay user decisions, coordinate dependencies, delegate integration and whole-epic verification, and report the outcome. It MUST NOT inspect repositories, implement code, run tests, review changes, integrate changes, or investigate failures. Workers SHALL follow their assigned tickets, linked specifications, acceptance criteria, and applicable project instructions without an imposed discovery phase or OpenSpec-specific workflow.

#### Scenario: Worker failure

- **WHEN** a worker reports a failure or BB sends a generic suggestion to inspect the failed child
- **THEN** the coordinator delegates any diagnosis and reports the blocker without inspecting repository contents or investigating the worker transcript

#### Scenario: Task-specific workflow

- **WHEN** a ticket specifies a direct implementation, investigation, review, or non-code deliverable
- **THEN** its worker follows that ticket and project instructions without an added generic discovery phase

### Requirement: Approved scope and separate restricted approvals

An active run SHALL coordinate only its approved existing subtasks and the epic's approved integration/verification work. Routine eligible dispatches SHALL NOT require repeated approval. New tasks, scope suggestions, and changed tracker scope SHALL remain separate until user approval. Run authorization MUST NOT authorize publishing, merging, production actions, or other independently restricted operations.

#### Scenario: Routine dispatch

- **WHEN** an approved subtask becomes eligible during an active run
- **THEN** the coordinator can dispatch or reuse its owner without asking for another routine-dispatch approval

#### Scenario: Scope changes

- **WHEN** a new subtask appears, a worker suggests extra work, or approved tracker scope changes
- **THEN** the new or changed work is shown separately and is not dispatched under the existing approval

#### Scenario: Restricted operation

- **WHEN** a worker needs a merge, publication, or production action
- **THEN** the coordinator relays the separate approval request and does not answer it from run authority

### Requirement: Explicit pause and resume

Pausing a run SHALL prevent new coordinator-requested dispatches and continuations. A manually stopped worker MUST NOT be automatically restarted, retried, or replaced. Resuming paused or interrupted orchestration SHALL require an explicit user request. Plugin enable or restart MUST NOT count as that request.

#### Scenario: Pause with reports arriving

- **WHEN** a paused run receives a worker report
- **THEN** the report is retained but the coordinator does not dispatch dependent work until explicit resume

### Requirement: Delegated epic acceptance

Integration and whole-epic acceptance verification SHALL belong to a separate worker attached to the existing epic. The coordinator SHALL report epic success only from that worker's explicit acceptance outcome and result references. All subtasks being done MUST NOT automatically complete the epic. Failed acceptance SHALL remain visible and any repair outside approved scope SHALL require user approval.

#### Scenario: Subtasks complete but acceptance remains

- **WHEN** every approved subtask is done and no whole-epic acceptance report exists
- **THEN** the epic remains unverified and integration/verification is delegated rather than performed by the coordinator

#### Scenario: Acceptance gap

- **WHEN** the integration worker reports unmet epic acceptance criteria
- **THEN** the coordinator reports the gap and delegates approved repair or requests a scope decision without diagnosing or fixing it itself
