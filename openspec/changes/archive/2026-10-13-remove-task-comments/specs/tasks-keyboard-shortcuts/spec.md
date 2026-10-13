# Spec Delta

## MODIFIED Requirements

### Requirement: Shortcuts stay out of the way of typing
A single-key shortcut SHALL NOT act while focus is in a text input, textarea or rich-text editor, or while a menu, popover or dialog is open. A shortcut SHALL NOT act when the key is pressed with Cmd, Ctrl or Alt, so bb and browser shortcuts keep working. A key that needs Shift to type, such as `?`, SHALL still match.

#### Scenario: Typing in the comment box
- **WHEN** focus is in the description editor and the user types `c`
- **THEN** the letter goes into the description and no new-task dialog opens

#### Scenario: Menu open
- **WHEN** the status menu is open and the user presses `j`
- **THEN** the list selection does not move

#### Scenario: Modifier held
- **WHEN** the user presses Cmd+`c`
- **THEN** no new-task dialog opens

#### Scenario: Shifted key
- **WHEN** focus is on a list row and the user presses Shift+`/` to type `?`
- **THEN** the shortcut help dialog opens

### Requirement: Task detail shortcuts
In task detail, `Esc` SHALL go back, `[` SHALL open the previous task and `]` the next task in pager order. `s`, `p` and `l` SHALL open status, priority and labels menus. `d` SHALL open the Dispatch preset menu without dispatching. There SHALL be no comment shortcut, and `m` SHALL NOT focus a removed editor or trigger a replacement action.

#### Scenario: Next task
- **WHEN** ABC-2 follows ABC-1 in pager order and the user presses `]` on ABC-1
- **THEN** ABC-2 is shown

#### Scenario: Last task
- **WHEN** the detail of the last task in pager order is shown and the user presses `]`
- **THEN** the same task stays shown

#### Scenario: Pager hidden in a narrow panel
- **WHEN** the pager buttons are hidden by panel width and the user presses `]`
- **THEN** the next task is shown

#### Scenario: Dispatch menu
- **WHEN** the user presses `d` on a task with presets
- **THEN** the preset menu opens without starting a thread until a preset is selected

#### Scenario: Comment
- **WHEN** the user presses `m` from a non-editable task detail control
- **THEN** no comment action or replacement action runs
- **AND** shortcut help contains no comment entry
