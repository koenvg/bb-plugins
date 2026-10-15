# Spec Delta

## ADDED Requirements

### Requirement: Collapsible status sections

Every displayed status section in All tasks, a project task list, and Active work SHALL have a header control that expands or collapses that section. The header SHALL remain visible with its status icon, name, task count, and a chevron that indicates its expanded state. A collapsed section SHALL hide all its parent and subtask rows. Sections SHALL start expanded when no saved choice exists. Section collapse SHALL NOT change task data or open a task.

#### Scenario: Collapse any status section

- **WHEN** a user activates the header of any expanded status section, including Backlog
- **THEN** all rows in that section are hidden and its header and count remain visible
- **AND** other sections retain their current expanded state

#### Scenario: Expand a section

- **WHEN** a user activates a collapsed section header
- **THEN** its rows return with the current filter, sort, and subtask expansion state
- **AND** no task detail opens because of the header activation

#### Scenario: No saved choice

- **WHEN** a user opens a list scope that has no saved section choices
- **THEN** all displayed status sections are expanded

### Requirement: Saved section choices are independent by list scope

The list SHALL save each section collapse and expand choice on the device, independently for each project, All tasks, and Active work. The list SHALL restore that choice after navigation away and back, a panel reload, and an app restart. Changes to filters or sorting SHALL NOT reset section choices. A section that temporarily has no rows SHALL retain its saved choice for when it returns. This change SHALL NOT require settings to sync between devices.

#### Scenario: Navigate away and return

- **WHEN** a user collapses Backlog in All tasks, opens another view, and returns to All tasks
- **THEN** Backlog remains collapsed

#### Scenario: Reload or restart

- **WHEN** a user reloads the panel or restarts the app after saving collapsed sections
- **THEN** each list scope restores its saved section choices

#### Scenario: Independent scopes

- **WHEN** a user collapses Backlog in project A
- **THEN** this does not change Backlog in project B, All tasks, or Active work
- **AND** returning to project A restores its collapsed Backlog

#### Scenario: Filter and sort changes preserve choices

- **WHEN** a user changes filters or sorting after collapsing a section
- **THEN** that section remains collapsed if present
- **AND** clearing filters does not erase its saved choice

#### Scenario: Section disappears and returns

- **WHEN** a collapsed section has no matching rows and later receives matching rows
- **THEN** it returns collapsed with its current task count

### Requirement: Safe section preference recovery

Missing or invalid saved section preferences SHALL fall back to expanded sections without losing valid saved filters or sorting. Invalid status values and duplicate entries SHALL NOT affect other sections. A storage read or write failure SHALL NOT prevent section interaction during the current mounted view. An unsupported future storage version SHALL NOT be overwritten.

#### Scenario: Existing preferences have no section state

- **WHEN** saved preferences contain valid filters and sorting but no section choices
- **THEN** the list retains those filters and sorting and starts its sections expanded

#### Scenario: Invalid section values

- **WHEN** saved section choices contain duplicates or unknown statuses
- **THEN** valid choices apply once and invalid choices are ignored

#### Scenario: Storage unavailable

- **WHEN** device storage throws during a section toggle
- **THEN** the section still changes state in the current mounted view without an application error

#### Scenario: Future storage version

- **WHEN** a user toggles a section while the saved preference document has an unsupported future version
- **THEN** the toggle works in the current mounted view and the stored document is not rewritten

### Requirement: Accessible section controls and safe hidden selection

Section header controls SHALL support pointer, touch, Enter, and Space activation, expose an accessible name and expanded state, and show keyboard focus. Hidden rows SHALL NOT be focusable or appear in task keyboard navigation or visible selection order. Collapsing a section that contains the selected task SHALL use the existing save-before-context-change protection before committing the collapse or its saved preference. After an accepted collapse, the hidden task selection SHALL clear without deleting or modifying the task. A failed save SHALL retain the draft, selection, expanded section, and prior saved preference until a successful retry accepts the change. Focus SHALL remain on a visible section control after collapse.

#### Scenario: Keyboard activation

- **WHEN** a user focuses a section header and activates it with Enter or Space
- **THEN** the section toggles and its exposed expanded state updates
- **AND** focus stays on the section control

#### Scenario: Skip hidden tasks

- **WHEN** a user uses task navigation shortcuts with a collapsed section
- **THEN** the shortcuts skip every hidden parent and subtask

#### Scenario: Selected task is hidden by an accepted collapse

- **WHEN** a section collapse is accepted and hides the selected task
- **THEN** the selected detail clears through the existing context-change policy
- **AND** the section collapse and its saved preference are committed

#### Scenario: Unsaved task cannot be saved

- **WHEN** a user collapses the selected task's section and saving the task fails
- **THEN** the section remains expanded and the draft and selection remain available
- **AND** the saved section preference remains unchanged
- **AND** a successful save retry completes the requested collapse and clears the hidden selection

#### Scenario: All sections are collapsed

- **WHEN** all displayed sections are collapsed
- **THEN** the section headers remain available to expand the list
- **AND** the list does not claim that no tasks match solely because rows are hidden
