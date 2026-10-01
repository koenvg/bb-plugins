# Spec Delta

## Purpose

Make the Tasks sidebar show how many unfinished top-level tasks remain in each project and overall, without changing task visibility or agent-activity indicators.

## ADDED Requirements

### Requirement: Project badges count unfinished top-level tasks

Each project's sidebar badge SHALL count each top-level task once when its status is `backlog`, `todo`, `in_progress`, or `in_review`. It SHALL exclude tasks whose status is `done` or `canceled`, and SHALL NOT count subtasks independently.

#### Scenario: Mixed task statuses

- **WHEN** a project contains one top-level task in each of the six supported statuses
- **THEN** its sidebar task-count badge displays `4`

#### Scenario: Subtasks and multiple agents do not inflate the count

- **WHEN** a project contains one unfinished top-level task with two attached agent threads and two unfinished subtasks
- **THEN** its sidebar task-count badge displays `1`

#### Scenario: An unfinished subtask belongs to a finished parent

- **WHEN** a project's only top-level task is `done` or `canceled` and has an unfinished subtask
- **THEN** its sidebar task-count badge displays `0`

### Requirement: All tasks badge sums project counts

The All tasks sidebar badge SHALL display the sum of the unfinished top-level task counts across all projects, regardless of the selected project, folder collapse state, or task-list filters.

#### Scenario: Multiple projects

- **WHEN** two projects have unfinished top-level task counts of `2` and `3`, with additional done and canceled tasks in either project
- **THEN** the All tasks badge displays `5`
- **AND** selecting one project or changing list filters does not reduce that badge to the visible list's count

### Requirement: Zero counts remain visible

Once counts have loaded, the sidebar SHALL retain project rows with zero unfinished top-level tasks and display `0` for their badges. The All tasks badge SHALL display `0` when no unfinished top-level tasks exist.

#### Scenario: Empty and finished-only projects

- **WHEN** one project has no tasks and another has only done or canceled top-level tasks
- **THEN** both projects remain visible with badges displaying `0`
- **AND** the All tasks badge displays `0`

### Requirement: Status changes refresh counts

After a task status change succeeds and the sidebar refreshes, project and All tasks badges SHALL reflect the task's current status without a manual page reload.

#### Scenario: Completing or canceling a task

- **WHEN** an unfinished top-level task changes to `done` or `canceled`
- **THEN** the project's badge and the All tasks badge each decrease by one after refresh

#### Scenario: Reopening a task

- **WHEN** a top-level task changes from `done` or `canceled` to an unfinished status
- **THEN** the project's badge and the All tasks badge each increase by one after refresh

### Requirement: Counting is independent of navigation and agent activity

The count change SHALL NOT filter or hide tasks in list or board views, change sidebar navigation destinations, or change the eligibility rules for the Active count and green agent-activity indicators.

#### Scenario: A finished task still has a working agent

- **WHEN** a done or canceled top-level task has an agent that qualifies for an existing activity indicator
- **THEN** the task is excluded from unfinished-task counts
- **AND** its agent continues to contribute to the same Active count and green activity indicators as before

#### Scenario: Viewing finished tasks

- **WHEN** a user opens All tasks or a project whose list or board settings show done or canceled tasks
- **THEN** those tasks remain accessible under the existing view settings
- **AND** the sidebar badges still exclude them
