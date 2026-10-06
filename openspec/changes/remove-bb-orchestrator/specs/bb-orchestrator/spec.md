# Spec Delta

## Purpose

Define the retired BB Orchestrator feature's availability and data-compatibility boundary while preserving ordinary Tasks behavior.

## ADDED Requirements

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

Removal SHALL preserve ordinary task CRUD, dependencies, presets, manual delegation, task-start approval and recovery, task/thread links, comments, notification targeting, and progress-reporting guidance. Existing task-thread role metadata SHALL NOT impose new restrictions on these ordinary actions.

#### Scenario: An operator starts work manually

- **WHEN** the operator uses an eligible task's composer or ordinary delegation command
- **THEN** the existing Tasks behavior starts and links the worker without an Orchestrator run

#### Scenario: Ordinary reporting and notifications

- **WHEN** a worker posts an ordinary task comment or an operator uses comment notification
- **THEN** existing comment storage and notification targeting remain unchanged
- **AND** progress-reporting guidance remains available without a structured Orchestrator report tool

#### Scenario: Historical worker link remains useful

- **WHEN** an existing task has a worker link with historical Orchestrator role metadata
- **THEN** ordinary Tasks can still display and manage the link
- **AND** the link does not grant Orchestrator execution or reporting authority

### Requirement: Historical storage remains compatible and inactive

Loading or upgrading Tasks Plus SHALL preserve existing migration history and historical Orchestrator records without replay or conversion. Ordinary Tasks records, comments, and worker links SHALL remain intact. Retained storage SHALL NOT make any Orchestrator operation available.

#### Scenario: Upgrade an existing database

- **WHEN** the removed-feature version opens a database containing runs, owners, claims, reports, report intents, and capability contexts
- **THEN** those records and the migration version history remain unchanged
- **AND** ordinary Tasks reads and writes remain available

#### Scenario: Initialize a new database

- **WHEN** the removed-feature version initializes an empty database
- **THEN** the existing versioned migration sequence completes successfully
- **AND** retained compatibility tables do not expose Orchestrator functionality

#### Scenario: Reload with historical pending records

- **WHEN** Tasks Plus loads or reloads while old approval, dispatch, or report records exist
- **THEN** it does not replay them, register approval handling, issue notifications, or start or resume workers

### Requirement: Existing native work is independent of removal

Removing Orchestrator SHALL NOT stop or delete existing native workers, cancel accepted native work, or claim that old queued input has been canceled. Such work SHALL remain subject to separate operator action through existing BB controls.

#### Scenario: A native worker already exists

- **WHEN** the removed-feature package loads with an existing native worker
- **THEN** removal does not send input, stop, delete, or detach that worker
- **AND** removal does not represent its queued work as canceled
