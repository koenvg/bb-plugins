# Spec Delta

## Purpose

Lets a user work in the tasks-plus panel from the keyboard: move through tasks, open them, change their properties and find every available key in one help dialog.

## ADDED Requirements

### Requirement: Shortcuts stay out of the way of typing

A single-key shortcut SHALL NOT act while focus is in a text input, textarea or rich-text editor, or while a menu, popover or dialog is open. A shortcut SHALL NOT act when the key is pressed with Cmd, Ctrl or Alt, so bb and browser shortcuts keep working. A key that needs Shift to type (for example `?`) SHALL still match.

#### Scenario: Typing in the comment box

- **WHEN** focus is in the comment editor and the user types `c`
- **THEN** the letter goes into the comment and no new-task dialog opens

#### Scenario: Menu open

- **WHEN** the status menu is open and the user presses `j`
- **THEN** the list selection does not move

#### Scenario: Modifier held

- **WHEN** the user presses Cmd+`c`
- **THEN** no new-task dialog opens

#### Scenario: Shifted key

- **WHEN** focus is on a list row and the user presses Shift+`/` to type `?`
- **THEN** the shortcut help dialog opens

### Requirement: Shortcuts act only in the tasks panel

A shortcut SHALL act only when keyboard focus is inside the tasks panel or on no specific element. A key press while focus is in another bb pane SHALL NOT change the tasks panel.

#### Scenario: Focus in another pane

- **WHEN** the tasks panel is open beside a thread and focus is on a button in the thread pane
- **AND** the user presses `j`
- **THEN** the tasks list selection does not change

#### Scenario: Nothing focused

- **WHEN** the tasks list is shown, no element has focus, and the user presses `c`
- **THEN** the new-task dialog opens

### Requirement: Panel-wide shortcuts

On every tasks route, `c` SHALL open the new-task dialog and `?` SHALL open the shortcut help dialog. On a project route where the board is available, `v` SHALL switch between list and board view and keep the choice like the view toggle does.

#### Scenario: Toggle to board

- **WHEN** a project list is shown and the user presses `v`
- **THEN** the board view of that project is shown

#### Scenario: View toggle not available

- **WHEN** the All route is shown and the user presses `v`
- **THEN** nothing changes

### Requirement: List keyboard navigation

In the list view, `j` or `↓` SHALL move focus to the next visible row and `k` or `↑` to the previous one, including expanded subtask rows. When no row has focus, the first key press SHALL focus the first row. The focused row SHALL scroll into view and show a visible focus indicator. Focus SHALL stay on the last row at the end and on the first row at the start.

#### Scenario: Move down

- **WHEN** row ABC-1 has focus and the user presses `j`
- **THEN** the next visible row has focus and is visible

#### Scenario: First press

- **WHEN** no row has focus and the user presses `j`
- **THEN** the first row has focus

#### Scenario: End of list

- **WHEN** the last row has focus and the user presses `j`
- **THEN** the last row keeps focus

### Requirement: Actions on the focused list row

When a list row has focus, `Enter` or `o` SHALL open that task, `s` SHALL open its status menu, `p` its priority menu and `l` its labels menu. Closing a menu SHALL return focus to the row.

#### Scenario: Open with o

- **WHEN** row ABC-2 has focus and the user presses `o`
- **THEN** the detail view of ABC-2 opens

#### Scenario: Labels menu

- **WHEN** row ABC-2 has focus and the user presses `l`
- **THEN** the labels menu for ABC-2 opens

#### Scenario: Focus returns after menu

- **WHEN** the status menu of ABC-2 was opened with `s` and the user presses `Esc`
- **THEN** the menu closes and row ABC-2 has focus

### Requirement: Board cards are keyboard reachable

Each board card SHALL be focusable with Tab and SHALL open its task on `Enter` or `Space`. A card SHALL have an accessible name with the task key and title. Mouse click and drag SHALL keep working as before.

#### Scenario: Tab to a card

- **WHEN** the board is shown and the user presses Tab until a card has focus
- **AND** presses `Enter`
- **THEN** the detail view of that task opens

### Requirement: Board keyboard navigation

In the board view, `j` or `↓` SHALL move focus to the next card in the same column and `k` or `↑` to the previous one. `l` or `→` SHALL move focus to the nearest card in the next non-empty column and `h` or `←` to the previous one. When no card has focus, the first key press SHALL focus the first card. On a focused card, `o` SHALL open the task and `s` and `p` SHALL open its status and priority menus.

#### Scenario: Next column

- **WHEN** the second card in "Todo" has focus and the user presses `l`
- **THEN** the card at the same position, or the last card, in the next non-empty column has focus

#### Scenario: Within column

- **WHEN** the first card in "Todo" has focus and the user presses `j`
- **THEN** the second card in "Todo" has focus

### Requirement: Task detail shortcuts

In the task detail view, `Esc` SHALL go back, `[` SHALL open the previous task and `]` the next task in the same order as the pager buttons. `s`, `p` and `l` SHALL open the status, priority and labels menus. `d` SHALL open the Dispatch preset menu and SHALL NOT dispatch on its own. `m` SHALL move focus to the comment box.

#### Scenario: Next task

- **WHEN** the detail of ABC-1 is shown and ABC-2 follows it in the pager order
- **AND** the user presses `]`
- **THEN** the detail of ABC-2 is shown

#### Scenario: Last task

- **WHEN** the detail of the last task in the pager order is shown and the user presses `]`
- **THEN** the same task stays shown

#### Scenario: Pager hidden in a narrow panel

- **WHEN** the panel is too narrow to show the pager buttons and the user presses `]`
- **THEN** the next task is shown

#### Scenario: Dispatch menu

- **WHEN** the user presses `d` on a task with presets
- **THEN** the preset menu opens and no thread is started until the user picks a preset

#### Scenario: Comment

- **WHEN** the user presses `m`
- **THEN** the comment editor has focus

### Requirement: Shortcut help dialog

The help dialog SHALL list every tasks-plus shortcut with its key and action, grouped by scope (panel, list, board, task detail). The keys in the dialog SHALL come from the same definitions that drive the shortcuts. `Esc` SHALL close the dialog and return focus to where it was.

#### Scenario: Open help

- **WHEN** the user presses `?`
- **THEN** a dialog lists the shortcuts grouped by panel, list, board and task detail

#### Scenario: Close help

- **WHEN** the help dialog is open and the user presses `Esc`
- **THEN** the dialog closes and focus returns to the element that had it before

### Requirement: bb palette commands

The plugin SHALL register these commands in the bb command palette: New task, Go to All tasks, Go to Active tasks, Go to Manage, Show keyboard shortcuts. The commands SHALL have no default key binding. Running a command SHALL open the tasks panel when it is not shown and then do the action.

#### Scenario: Run from palette

- **WHEN** the user runs "Go to Active tasks" from the bb palette while a thread is shown
- **THEN** the tasks panel opens on the Active route

#### Scenario: New task from palette

- **WHEN** the user runs "New task" from the bb palette
- **THEN** the tasks panel shows and the new-task dialog opens
