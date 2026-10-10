# Spec Delta

## MODIFIED Requirements

### Requirement: Project inventory states

Projects SHALL distinguish initial loading, a successful empty inventory and a failed inventory. Failure SHALL offer Retry and SHALL NOT appear as an empty list. Without a current successful inventory, the table SHALL NOT permit new saves even when stale rows remain visible. Cached rows and local drafts SHALL stay mounted during loading or failure. Only a successful inventory or confirmed project deletion SHALL remove rows, and their drafts SHALL NOT transfer to another identity. Ordinary project refreshes SHALL NOT overwrite unsaved row edits; Cancel SHALL use the latest loaded baseline, with successful save responses taking precedence over overlapping reads. Confirmed deletion SHALL remove its row immediately, and overlapping stale inventories SHALL NOT restore it.

#### Scenario: Initial loading

- **WHEN** inventory is still loading without known projects
- **THEN** table headers and a loading status are present, no project count is invented, and no save is available

#### Scenario: Empty inventory

- **WHEN** inventory successfully loads with no projects
- **THEN** a no-projects message appears and no editable rows remain

#### Scenario: Inventory failure and retry

- **WHEN** loading or refreshing fails
- **THEN** an inventory alert and Retry appear, new saves are disabled, cached row drafts remain, and the UI does not claim there are no projects

#### Scenario: Project removed

- **WHEN** a successful refresh removes a project
- **THEN** only its keyed row and draft are removed, and the draft cannot be submitted for a different identity

#### Scenario: Refresh during local edits

- **WHEN** an ordinary successful refresh completes with unsaved row edits
- **THEN** dirty drafts remain intact for Save or Cancel, clean rows update, and Cancel restores latest loaded values

#### Scenario: Confirmed deletion with an overlapping inventory

- **WHEN** deletion succeeds and an inventory read started before deletion returns the deleted project
- **THEN** the deleted row remains absent and other row drafts remain intact

#### Scenario: Inventory failure after successful deletion

- **WHEN** deletion succeeds but the subsequent inventory refresh fails
- **THEN** the deleted row stays absent, the inventory alert offers Retry, and the UI does not report a failed deletion

### Requirement: Accessible, compact and stable controls

The Projects tab, table, row name inputs, Save, Cancel and Retry SHALL have accessible names and be operable by keyboard. Delivery 2's color choices SHALL also have accessible names and keyboard operation. Save and inventory errors SHALL be announced as alerts. Compact layouts SHALL have no horizontal page overflow. Already displayed rows and controls SHALL stay in place during loading/refresh; pending labels SHALL NOT resize Save/Cancel. Initial loading SHALL use the table and reserved status area without guessing the eventual inventory size. Row Save, Cancel and Delete SHALL use check-mark, undo and trash icon buttons with action tooltips and project-specific accessible names. Delete SHALL use destructive colour and have extra separation from the editing actions. Icons SHALL retain at least 36px click targets and visible keyboard focus. Confirmation dialog actions SHALL retain text labels.

#### Scenario: Keyboard editing

- **WHEN** the user operates project settings by keyboard
- **THEN** they can reach a row, edit its name and Save or Cancel, reach inventory Retry, and choose named colors in delivery 2

#### Scenario: Compact layout

- **WHEN** the table is shown in a narrow Tasks panel
- **THEN** rows and relevant controls remain visible and usable without horizontal page overflow

#### Scenario: Stable refresh and saving

- **WHEN** inventory refreshes or a row save is pending
- **THEN** cached rows remain mounted, loading uses the reserved status area, and pending Save/Cancel controls keep their dimensions

#### Scenario: Icon row actions

- **WHEN** a project row is displayed
- **THEN** Save, Cancel and Delete appear as check-mark, undo and trash icons with tooltips and accessible action names that include the project prefix
- **AND** Save and Cancel retain their existing behaviour and the red Delete icon is separated from them

## ADDED Requirements

### Requirement: Project deletion confirmation

Activating a row's Delete SHALL open a confirmation for that saved project identity, name and prefix without saving drafts or switching project scope. The dialog SHALL warn that deletion is permanent and includes all tasks, subtasks and completed tasks. It SHALL state that the linked BB workspace project and BB threads remain. Cancel SHALL receive initial focus; Cancel and Escape SHALL dismiss before submission without mutation. Focus SHALL return to the invoking action when it remains present.

#### Scenario: Open confirmation with unsaved edits

- **WHEN** the user edits a row without saving and activates Delete
- **THEN** the dialog identifies the saved project rather than the draft name, and no update or deletion occurs

#### Scenario: Dismiss confirmation

- **WHEN** the user selects Cancel or presses Escape before submitting deletion
- **THEN** the dialog closes, no data changes, and all row drafts remain intact

### Requirement: Complete task count in deletion confirmation

The dialog SHALL load and display the selected project's total task count across all statuses and nesting levels. It SHALL distinguish a known zero from loading or failure. Deletion SHALL remain disabled until the complete count is available. A count failure SHALL show an alert and manual Retry. The displayed count SHALL describe the tasks observed during confirmation, not promise a fixed set if tasks change before deletion.

#### Scenario: Count includes every task page

- **WHEN** the project contains tasks on multiple pages, including completed tasks and subtasks
- **THEN** the displayed count includes every page and deletion stays disabled until loading finishes

#### Scenario: Empty project

- **WHEN** the project has no tasks and counting succeeds
- **THEN** the dialog displays zero tasks and still requires prefix confirmation

#### Scenario: Count failure

- **WHEN** loading the count fails
- **THEN** the dialog announces the error, does not show an invented count, disables deletion and offers manual Retry

### Requirement: Typed project prefix before deletion

The dialog SHALL require an exact, case-sensitive match to the saved project prefix. It SHALL NOT trim or normalise the confirmation input. The field SHALL be labelled with the required prefix and start empty on each opening. The text-labelled destructive action SHALL remain disabled for blank or mismatched input. Matching the prefix alone SHALL NOT submit deletion.

#### Scenario: Incorrect confirmation

- **WHEN** the required prefix is BBP and the user enters a blank value, bbp, another prefix or BBP with surrounding spaces
- **THEN** Delete project and tasks remains disabled and no deletion occurs

#### Scenario: Correct confirmation

- **WHEN** the complete count is available and the user types BBP for a project whose saved prefix is BBP
- **THEN** Delete project and tasks becomes available, but deletion waits for explicit activation

#### Scenario: Reopen confirmation

- **WHEN** the user dismisses and reopens a project's deletion dialog
- **THEN** the prefix field is empty and requires confirmation again

### Requirement: Delete only the confirmed Tasks project

Explicit activation after confirmation SHALL delete exactly the confirmed Tasks project and all its tasks regardless of status or nesting. Its task-owned records and attachments SHALL follow existing deletion behaviour. The action SHALL NOT delete another Tasks project, the linked BB workspace project, BB threads or workspace files. Completion SHALL close the dialog, announce the result and refresh Tasks project choices without an application reload.

#### Scenario: Delete a populated linked project

- **WHEN** the user confirms and deletes a Tasks project with subtasks, completed tasks and a linked BB workspace
- **THEN** the project and every task in it are removed, while another Tasks project, the BB workspace, BB threads and workspace files remain

#### Scenario: Project choices after deletion

- **WHEN** deletion completes successfully
- **THEN** the dialog closes, the deleted project is no longer available in refreshed Tasks project choices and the UI announces deletion
- **AND** focus moves to a surviving row action or the Projects heading when the invoking row is gone

### Requirement: Single-flight deletion and manual failure recovery

The table SHALL permit at most one project save or deletion at a time. Deletion SHALL require a current successful inventory containing the confirmed identity. While deletion is pending, editing and row actions across the table, confirmation input, resubmission and dialog dismissal SHALL be blocked. Failure SHALL announce an error, retain the confirmation and other row drafts, and permit manual retry without automatic resubmission.

#### Scenario: Repeated or competing activation

- **WHEN** the user repeats deletion activation or tries another row save or deletion while a mutation is pending
- **THEN** at most one mutation is sent and pending controls keep their dimensions

#### Scenario: Deletion failure

- **WHEN** deletion fails before it completes
- **THEN** the dialog stays open with an announced error, retains the typed prefix and permits manual retry after pending state clears
- **AND** the UI does not claim success or automatically repeat the request

#### Scenario: Inventory is unavailable or project is absent

- **WHEN** the inventory is loading, has failed or no longer contains the confirmed project identity
- **THEN** deletion cannot be submitted for that stale identity
