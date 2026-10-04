# Spec Delta

## MODIFIED Requirements

### Requirement: Filters match parents and subtasks
With an active filter (status, priority, label, Ready or Blocked, or the active-work view), the list SHALL include a task when it matches. When a subtask matches, the list SHALL also include its parent. A parent that does not match SHALL show dimmed when its section is expanded. A subtask that does not match SHALL NOT show. A parent with a matching subtask SHALL have expanded subtask state. A collapsed status section SHALL hide its included parents and subtasks without changing filter matching, subtask expansion settings, or counts. Filters SHALL NOT force a collapsed section open.

#### Scenario: Only the subtask matches
- **WHEN** the filter is Blocked, ABC-1 is ready, its subtask ABC-3 is blocked, and the parent's status section is expanded
- **THEN** ABC-1 shows dimmed and expanded
- **AND** ABC-3 shows below ABC-1

#### Scenario: Only the parent matches
- **WHEN** the filter is status `todo`, ABC-1 has status `todo`, its subtasks have status `done`, and the Todo section is expanded
- **THEN** ABC-1 shows at full strength with no visible subtasks and no chevron

#### Scenario: Neither matches
- **WHEN** neither ABC-1 nor any of its subtasks match the filter
- **THEN** ABC-1 and its subtasks do not show

#### Scenario: Matching subtask in a collapsed section
- **WHEN** the filter is Blocked, blocked subtask ABC-3 matches, its ready parent ABC-1 has status `todo`, and Todo is collapsed
- **THEN** neither row is visible and Todo remains collapsed
- **AND** expanding Todo shows the dimmed parent and matching subtask

#### Scenario: Section toggle preserves saved subtask state
- **WHEN** a user expands ABC-1 without a filter, collapses its section, and expands that section again
- **THEN** ABC-1 remains expanded with its subtasks visible
- **AND** the saved subtask expansion preference is unchanged by section toggles

### Requirement: Counts in the list
A status group header SHALL count the parent rows included in that group, dimmed parents included, whether the section is expanded or collapsed. The task count in the filter bar SHALL count the tasks that match, parents and subtasks, and SHALL NOT count dimmed parents. Section collapse SHALL NOT change these counts.

#### Scenario: Header and filter bar counts
- **WHEN** the filter is Blocked and the only match is subtask ABC-3 of ready parent ABC-1 (`todo`)
- **THEN** the "Todo" header shows 1
- **AND** the filter bar shows 1 task

#### Scenario: Collapse preserves counts
- **WHEN** a user collapses Todo while its only included parent is dimmed ABC-1 and its only matching task is subtask ABC-3
- **THEN** the Todo header still shows 1 and the filter bar still shows 1 task
- **AND** the parent and subtask rows are hidden
