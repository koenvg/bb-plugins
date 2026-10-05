# tasks-project-switcher Specification

## Purpose

Lets users switch Tasks tracker projects through BB's command palette and a searchable project picker. Users can complete the flow with the keyboard without changing BB's workspace project or losing pending task edits.

## Requirements

### Requirement: Project switch command

The plugin SHALL register `Tasks: Switch project` in BB's command palette with no default shortcut. Running the command SHALL open a separate project picker in Tasks after the host palette closes. If Tasks is not open, the command SHALL open Tasks and then show the picker exactly once. If Tasks is open, opening the picker SHALL NOT change its task route. The plugin SHALL NOT add a direct project-picker shortcut to the task board or alter the existing Tasks commands.

#### Scenario: Run from the task board

- **WHEN** the user opens BB's command palette on a Tasks board and runs `Tasks: Switch project`
- **THEN** a project picker opens over Tasks without changing the current project or view

#### Scenario: Run with Tasks closed

- **WHEN** the user runs `Tasks: Switch project` while a BB thread is shown
- **THEN** Tasks opens and one project picker receives focus

#### Scenario: No direct shortcut

- **WHEN** the user presses Shift+P on the Tasks board with no picker open
- **THEN** this change does not open a project picker

### Requirement: Searchable project choices

On opening, the picker SHALL focus an empty search field and show the available Tasks tracker projects. Typing SHALL filter results by project name or prefix, ignoring case. Each choice SHALL display its name and prefix, identify its folder path when available, and visibly mark the current project. Choices SHALL use project identity rather than name so projects with equal names remain distinct. Each opening SHALL reset the prior query and highlighted result.

#### Scenario: Search by name

- **WHEN** the user types part of a project name in a different letter case
- **THEN** matching project choices remain available without switching the project

#### Scenario: Search by prefix

- **WHEN** the user types a Tasks project prefix
- **THEN** that project appears among the matching results

#### Scenario: Equal project names

- **WHEN** two available projects have the same name
- **THEN** both appear as distinct choices with their prefixes and folder context

#### Scenario: Reopen

- **WHEN** the user cancels a filtered picker and runs the command again
- **THEN** the search field is empty and the prior highlight does not remain selected

### Requirement: Keyboard navigation inside the picker

With the picker search field focused, Ctrl+N and ArrowDown SHALL highlight the next selectable result. Ctrl+P and ArrowUp SHALL highlight the previous selectable result. Opening or changing the query SHALL highlight the first matching selectable result. Navigation SHALL stop at the first and last results rather than wrap, keep the highlighted choice visible, and keep input focus in the search field. Enter SHALL select the highlighted result. Keyboard navigation SHALL use only visible, selectable results and SHALL NOT switch a project by itself. These picker keys SHALL NOT act outside the picker or interfere with text composition.

#### Scenario: Next result while typing

- **WHEN** the search field has focus and the user presses Ctrl+N
- **THEN** the next matching choice is highlighted, the query stays unchanged, and the current project does not change

#### Scenario: Previous result

- **WHEN** the second matching choice is highlighted and the user presses Ctrl+P
- **THEN** the first choice is highlighted and input focus remains in the search field

#### Scenario: Result boundary

- **WHEN** the last matching choice is highlighted and the user presses Ctrl+N
- **THEN** the last choice stays highlighted

#### Scenario: Filter removes a highlight

- **WHEN** typing changes the matching results and removes the highlighted choice
- **THEN** the first matching selectable choice becomes highlighted, or no choice is highlighted if no result matches

#### Scenario: No selectable result

- **WHEN** the picker has no matching selectable result and the user presses Enter
- **THEN** no project switch occurs

#### Scenario: Outside the picker

- **WHEN** the picker is closed and the user presses Ctrl+N or Ctrl+P
- **THEN** the project picker adds no behavior to that key press

### Requirement: Safe project selection

Selecting a choice by Enter or pointer SHALL request navigation to that Tasks tracker project through the same save-before-switch behavior as the existing project menu. The picker SHALL close after requesting the switch so it does not hide a pending-save or save-error interface. The current task and remembered project scope SHALL remain unchanged until pending saves succeed. A failed save SHALL keep the originating task and draft available for retry. After an accepted switch, the destination project's saved list or board preference SHALL apply, with the existing narrow-panel fallback. Selecting a project SHALL NOT change BB's workspace project, and a removed project SHALL NOT be selected from a stale choice.

#### Scenario: Switch from a board

- **WHEN** the user selects another project with a saved board preference and pending saves succeed
- **THEN** Tasks shows that project's board where panel width permits, clears the old ticket selection, and remembers the accepted project scope

#### Scenario: Failed save

- **WHEN** the user selects another project while the current task has pending edits and saving fails
- **THEN** the picker closes, the current task and latest draft remain available with the save error, and the remembered project scope does not change

#### Scenario: Pointer selection

- **WHEN** the user clicks a matching project choice
- **THEN** the same safe navigation request occurs as with Enter

#### Scenario: Project removed while searching

- **WHEN** a successful inventory update removes the highlighted project before selection
- **THEN** the removed project is no longer selectable and Enter cannot navigate to it

### Requirement: Inventory states

The picker SHALL distinguish loading, a successful empty project inventory, no search matches, and a failed project inventory. It SHALL show a retry action for inventory failures and SHALL NOT treat failure as proof that projects were deleted. Without a successful current inventory, project choices SHALL NOT be selectable. Status text and retry controls SHALL NOT be treated as project results by Ctrl+N, Ctrl+P, or Enter in the search field.

#### Scenario: Inventory loading

- **WHEN** no successful project inventory is available yet
- **THEN** the picker shows a loading state and Enter cannot select a project

#### Scenario: No projects

- **WHEN** the project inventory succeeds with no projects
- **THEN** the picker shows a no-projects message without changing the task route

#### Scenario: No search matches

- **WHEN** projects are available but none match the query
- **THEN** the picker shows a no-matches message and permits the user to change the query

#### Scenario: Inventory failure and retry

- **WHEN** loading the project inventory fails
- **THEN** the picker shows an error and a keyboard-reachable retry action without clearing remembered project scope

### Requirement: Cancellation and accessible focus

The picker SHALL have an accessible name, a labelled search field, and an announced highlighted result. Escape or the dialog close control SHALL dismiss it without requesting a project switch. Cancelling SHALL return focus to a stable control in Tasks. Background Tasks shortcuts SHALL NOT act while the picker is open. Search and choices SHALL remain usable in compact layouts.

#### Scenario: Cancel a search

- **WHEN** the user searches or highlights a project and presses Escape
- **THEN** the picker closes, the existing task route and remembered scope remain unchanged, and focus returns to Tasks

#### Scenario: Background shortcuts blocked

- **WHEN** the picker is open and the user types `c`, `p`, or `v` in its search field
- **THEN** the query receives the text without creating a task, changing task priority, or switching the view

#### Scenario: Compact layout

- **WHEN** the command runs in a compact Tasks layout
- **THEN** the search field, project choices, and cancellation control are visible and operable
