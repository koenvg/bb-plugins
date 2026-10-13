# bb-orchestrator Specification

## Purpose

Define the retired BB Orchestrator feature's availability and data-compatibility boundary while preserving ordinary Tasks behavior.

## Requirements

### Requirement: Orchestrator entrypoints are unavailable

Tasks Plus SHALL NOT register Orchestrator commands, RPCs, agent tools, approval renderers, or the bundled bb-orchestrator skill. Removed entrypoints SHALL use normal host unavailable behavior, without aliases, deferred stubs, approval requests, or task mutations.

#### Scenario: Command discovery after removal

- **WHEN** an operator reads Tasks CLI help or lists available skills and agent tools
- **THEN** no Orchestrator operation or bb-orchestrator skill is offered

#### Scenario: A previous caller uses a removed operation

- **WHEN** a caller invokes an old Orchestrator command, RPC, or report tool
- **THEN** the host reports that the entrypoint is unavailable
- **AND** no scope record, report, approval request, claim, comment, or worker is created

#### Scenario: A new frontend loads

- **WHEN** the Tasks Plus frontend loads
- **THEN** no Orchestrator approval renderer is registered
- **AND** ordinary Tasks navigation and thread actions remain available

### Requirement: Ordinary Tasks remains unchanged
Retiring Orchestrator SHALL preserve ordinary task CRUD, dependencies, presets, manual delegation, task-start approval and recovery, task/thread links and progress-reporting guidance. Task comments and their notification targeting SHALL remain unavailable. Historical task-thread role metadata SHALL NOT impose new restrictions on retained ordinary actions.

#### Scenario: An operator starts work manually
- **WHEN** the operator uses an eligible task's composer or ordinary delegation command
- **THEN** Tasks starts and links the worker without an Orchestrator run or task comment

#### Scenario: Ordinary reporting and notifications
- **WHEN** a worker reports review readiness, completion, failure, a blocker or a required decision
- **THEN** progress-reporting guidance uses the linked work thread without a task comment or structured Orchestrator report tool

#### Scenario: Historical worker link remains useful
- **WHEN** an existing task has a worker link with historical Orchestrator role metadata
- **THEN** ordinary Tasks can still display and manage the link
- **AND** the link grants no Orchestrator execution or reporting authority

### Requirement: Historical storage remains compatible and inactive
Loading or upgrading Tasks SHALL preserve historical Orchestrator records and existing migration history without replay or conversion. Ordinary retained task records and worker links SHALL remain intact. Task comment storage SHALL be removed through the explicit comment-removal upgrade. Inactive historical report JSON SHALL NOT restore removed comment access.

#### Scenario: Upgrade an existing database
- **WHEN** Tasks opens a database containing runs, owners, claims, reports, report intents and capability contexts
- **THEN** those historical records and earlier migration versions remain unchanged
- **AND** ordinary retained task reads and writes remain available without comments

#### Scenario: Initialize a new database
- **WHEN** Tasks initializes an empty database
- **THEN** the versioned migration sequence completes successfully
- **AND** retained compatibility tables expose no Orchestrator functionality and active task comment storage is absent

#### Scenario: Reload with historical pending records
- **WHEN** Tasks loads or reloads while old approval, dispatch or report records exist
- **THEN** it does not replay them, register approval handling, issue notifications or start or resume workers

#### Scenario: A historical report references a comment
- **WHEN** retained report JSON contains the ID of a removed task comment
- **THEN** the historical JSON stays unchanged and inactive
- **AND** no runtime comment access or reconstruction is provided

### Requirement: Existing native work is independent of removal

Removing Orchestrator SHALL NOT stop or delete existing native workers, cancel accepted native work, or claim that old queued input has been canceled. Such work SHALL remain subject to separate operator action through existing BB controls.

#### Scenario: A native worker already exists

- **WHEN** the removed-feature package loads with an existing native worker
- **THEN** removal does not send input, stop, delete, or detach that worker
- **AND** removal does not represent its queued work as canceled
