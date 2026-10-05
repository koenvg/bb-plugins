# Spec Delta

## Purpose

Lets users run actions on the open task through BB's command palette and assign personal keyboard bindings, without targeting background tasks or changing the existing task workflow.

## ADDED Requirements

### Requirement: Task detail commands are discoverable and bindable

The plugin SHALL register these commands with stable IDs and no default shortcut: Tasks: Change status, Tasks: Set priority, Tasks: Set due date, Tasks: Edit labels, Tasks: Change linked BB project, Tasks: Dispatch task..., Tasks: Write a comment, Tasks: Previous task, Tasks: Next task and Tasks: Back. They SHALL support BB's command palette and Settings > Keyboard bindings. Existing Tasks commands and single-letter shortcuts SHALL retain their behavior.

#### Scenario: Discover commands on an open task

- **WHEN** a loaded task detail is shown and the user opens BB's command palette
- **THEN** the task commands whose actions are available are listed with the specified titles

#### Scenario: Assign a personal binding

- **WHEN** the user assigns a free keyboard shortcut to Tasks: Set priority in Settings > Keyboard and invokes it on an open task
- **THEN** the same priority picker opens as when running the command from the palette
- **AND** the plugin has assigned no default shortcut

#### Scenario: Existing commands remain available

- **WHEN** the user opens the palette on the All tasks route
- **THEN** the existing task creation, route navigation and shortcut-help commands retain their existing availability and behavior

### Requirement: Commands target only the current open task

Task detail commands SHALL act only on the loaded task detail currently shown in the Tasks panel. They SHALL be unavailable when no task detail is shown or its task cannot be loaded. A task mentioned in a thread, an embedded task view, a focused list row, a board card or a previously visited task SHALL NOT provide a command target. Both command listing and execution SHALL check availability; unavailable execution SHALL do nothing without navigating to or reopening a task. After changing tasks, commands SHALL use the new task and SHALL NOT act on stale task data.

#### Scenario: List row is focused

- **WHEN** the All tasks list is shown with a row focused
- **THEN** task detail commands are not listed and invoking a previously assigned binding does not change or open that row's task

#### Scenario: Board card is focused

- **WHEN** a project board is shown with a card focused
- **THEN** task detail commands are unavailable and do not act on the card

#### Scenario: Task detail is no longer shown

- **WHEN** the user leaves a task detail for another Tasks route or BB switches away from the Tasks panel
- **THEN** task detail commands no longer act on the previous task, even if its view remains mounted

#### Scenario: Task is loading or missing

- **WHEN** the task route is loading, reports an error or refers to a missing task
- **THEN** no task detail command runs against an old or partial task

#### Scenario: Task changes after palette listing

- **WHEN** a task command was listed for ABC-1 but ABC-2 becomes the open task before execution
- **THEN** execution uses ABC-2 if its action is available, or does nothing
- **AND** it does not update ABC-1

#### Scenario: Only an embedded task is open

- **WHEN** a thread shows an embedded task view and no Tasks-panel task detail is shown
- **THEN** task detail commands are unavailable

### Requirement: Property commands open keyboard-ready controls

Change status, Set priority, Set due date and Edit labels SHALL open the corresponding control for the open task without changing data merely by opening it. Keyboard focus SHALL enter the visible control, allowing the user to choose or enter a value without a mouse. Escape SHALL dismiss the control without saving an unselected value and return focus to its visible task control. Saving a chosen value SHALL reuse the existing property update behavior and safeguards, including blocked-work confirmation for entering In progress.

#### Scenario: Choose a priority

- **WHEN** the user runs Tasks: Set priority, chooses High with the keyboard and confirms
- **THEN** only the open task's priority is saved as High through the existing workflow

#### Scenario: Choose a status

- **WHEN** the user runs Tasks: Change status and chooses In progress on a blocked task
- **THEN** the existing blocked-work confirmation is required before the status changes

#### Scenario: Set or remove a due date

- **WHEN** the user runs Tasks: Set due date
- **THEN** a keyboard-reachable picker offers the existing date presets and custom date input, and removal when a date is already set
- **AND** no due date changes until the user chooses a value or removal

#### Scenario: Toggle a label

- **WHEN** the user runs Tasks: Edit labels and toggles a label with the keyboard
- **THEN** the open task's labels update through the existing picker behavior

#### Scenario: Dismiss a property picker

- **WHEN** the user opens a property picker from the command palette and presses Escape before choosing a value
- **THEN** the picker closes, the task remains unchanged and focus returns to the visible task control

### Requirement: Linked BB project command exposes its shared scope

Tasks: Change linked BB project SHALL open the existing linked-project picker for the open task's tracker project. The picker SHALL identify the tracker project and explain that changing the link affects all tasks in that project. Opening or dismissing the picker SHALL NOT update a project. Saving a selection or explicitly unlinking SHALL reuse the existing project update behavior; it SHALL NOT move a task between tracker projects, move existing threads or dispatch a new thread. The command SHALL be unavailable until the tracker project is loaded.

#### Scenario: Review the shared setting

- **WHEN** the user runs Tasks: Change linked BB project on a task in tracker project Planning
- **THEN** the picker identifies Planning, shows its current BB-project link and explains that the setting applies to all tasks in Planning
- **AND** no project or task changes merely by opening the picker

#### Scenario: Save or unlink

- **WHEN** the user saves a different BB-project selection or explicitly chooses Unlink in that picker
- **THEN** the tracker project's link changes using the existing workflow
- **AND** no task changes tracker project, no existing thread moves and no new thread starts

### Requirement: Dispatch command requires a preset selection

Tasks: Dispatch task... SHALL open the existing dispatch preset menu for the open task. Running the command SHALL NOT dispatch automatically or use the last preset without a selection. Choosing a preset SHALL start delegation using the existing target, preset, blocked-work safeguards and error handling. The command SHALL be unavailable while presets are loading, no preset exists or delegation is already in progress.

#### Scenario: Open and cancel dispatch

- **WHEN** the user runs Tasks: Dispatch task... and then presses Escape without choosing a preset
- **THEN** no thread starts and the task remains unchanged

#### Scenario: Select a preset

- **WHEN** the user runs Tasks: Dispatch task... and selects Worker with the keyboard
- **THEN** the existing delegation workflow runs once for the open task with Worker
- **AND** any existing blocked-work confirmation and delegation errors remain in effect

#### Scenario: Dispatch unavailable

- **WHEN** presets are loading, the task has no available preset or delegation is in progress
- **THEN** the dispatch command is unavailable and invoking its saved binding does not queue another dispatch

### Requirement: Comment command focuses the existing editor

Tasks: Write a comment SHALL focus the open task's comment editor at the end of its current draft without changing the draft, posting a comment or changing agent-notification settings. It SHALL be unavailable while the comment editor is not ready. Focus SHALL remain in the editor after the command palette closes.

#### Scenario: Continue a draft

- **WHEN** the user has an unsent comment draft and runs Tasks: Write a comment
- **THEN** focus moves to the end of the same draft and nothing is posted

### Requirement: Navigation commands follow the existing task pager and back action

Previous task and Next task SHALL use the same order and scope as the task pager, including when its buttons are hidden by a narrow layout. A direction SHALL be unavailable when its destination is absent or not yet known. Back SHALL use the same destination as the existing task back action, including its All tasks fallback on a direct task link. Navigation commands SHALL NOT edit task properties or dispatch agents.

#### Scenario: Next task follows pager order

- **WHEN** ABC-2 follows the open ABC-1 in the pager order and the user runs Tasks: Next task
- **THEN** ABC-2 opens and subsequent task commands target ABC-2

#### Scenario: Pager boundary

- **WHEN** the last task in the pager order is open
- **THEN** Tasks: Next task is unavailable and invoking its binding does not navigate

#### Scenario: Back after browsing

- **WHEN** the user opened a task from a project board and runs Tasks: Back
- **THEN** the same destination as the existing Back action is shown

#### Scenario: Back from a direct link

- **WHEN** a task was opened without a previous browse route and the user runs Tasks: Back
- **THEN** All tasks opens

### Requirement: Commands work in both task layouts

All available task commands SHALL work in both the wide properties-rail layout and the narrow inline-properties layout. Property commands SHALL open only the visible control, and keyboard focus SHALL NOT enter a hidden duplicate control. Menu opening from the palette SHALL survive the palette's closing and focus restoration.

#### Scenario: Narrow task layout

- **WHEN** the open task uses inline properties and the user runs Tasks: Set due date or Tasks: Change linked BB project
- **THEN** the corresponding visible picker opens with usable keyboard focus

#### Scenario: Wide task layout

- **WHEN** the open task uses a properties rail and the user runs Tasks: Change status from the palette
- **THEN** only the rail's status menu opens and receives focus after the palette closes
