# tasks-project-settings Specification

## Purpose

Lets users change an existing Tasks tracker project's name and color from Tasks settings without changing its identity, task keys, or linked BB workspace project. Delivery 1 edits names and preserves saved color read-only. Interactive color editing in the same table belongs to delivery 2.

## Requirements

### Requirement: Project settings in Manage

Tasks SHALL provide a Projects tab on its existing Manage page, keeping Labels the default and Labels, Presets, and Folders available. Projects SHALL be a table with one row per tracker identity, current name and read-only prefix, including when names are equal. Row editing SHALL NOT switch the task-browsing project or BB workspace project. The table SHALL replace the previously proposed project selector, not add a second editor option.

#### Scenario: Open project settings

- **WHEN** the user opens Tasks Manage and selects Projects with projects available
- **THEN** each project has a row with its name, saved color and read-only prefix

#### Scenario: Equal project names

- **WHEN** two Tasks projects have equal names
- **THEN** they remain distinct rows identified by prefix and identity, and edits apply only to the row's identity

#### Scenario: Existing settings remain available

- **WHEN** the user opens Manage after this change
- **THEN** Labels remains the default and Labels, Presets, and Folders remain available alongside Projects

### Requirement: Explicit name and color edits

Each row SHALL provide a labelled name input and explicit Save and Cancel. Saved color SHALL be read-only in delivery 1; delivery 2 SHALL add the existing named palette to each row. Edits SHALL remain local until that row's Save. Save SHALL trim surrounding name whitespace and reject empty or whitespace-only names without sending an update. Cancel SHALL restore that row's latest loaded name and color and clear its local save error without sending an update. Row drafts SHALL be identity-bound and independent, with no cross-row draft transfer or hidden saves. An existing color outside the palette SHALL be preserved unless the user deliberately chooses a replacement in delivery 2.

#### Scenario: Edit and save

- **WHEN** the user changes a row's name and activates Save
- **THEN** delivery 1 submits exactly that project ID, trimmed name and unchanged saved color
- **AND** delivery 2 submits the row's deliberately chosen color with the name

#### Scenario: Blank name

- **WHEN** a name input contains only whitespace
- **THEN** its Save is unavailable and no project update is sent

#### Scenario: Cancel local edits

- **WHEN** the user edits a row and activates its Cancel before saving
- **THEN** that row's latest loaded project values reappear, its save error clears, and no update is sent

#### Scenario: Independent row drafts

- **WHEN** the user edits two rows without saving and cancels one
- **THEN** only that row resets, the other draft remains intact, and no update is sent

#### Scenario: Existing custom color

- **WHEN** a project has a color outside the offered palette and the user changes only its name
- **THEN** saving preserves the exact existing color

### Requirement: Safe save and failure recovery

The table SHALL show a pending-save state and allow at most one save request at a time through a synchronous table-wide guard. While saving, it SHALL prevent relevant editing, Save and Cancel actions across all rows. A failed save SHALL show a row-local alert, retain the entered draft for manual retry, and SHALL NOT report success. A successful save SHALL immediately establish the returned project values as that row's saved baseline and draft. Save SHALL be unavailable when normalized draft values match saved values. Overlapping project inventories SHALL NOT overwrite a successful save response or erase a pending draft. Inventory errors SHALL remain separate from save errors.

#### Scenario: Repeated and cross-row save activation

- **WHEN** the user activates Save repeatedly or in another row while a request is pending
- **THEN** only one update is sent and relevant editing and Cancel actions remain blocked across the table

#### Scenario: Save failure and retry

- **WHEN** saving fails
- **THEN** the row announces an error, retains its draft and permits manual retry without changing other row drafts

#### Scenario: Successful save

- **WHEN** saving succeeds
- **THEN** the row shows returned saved values, clears pending state and its prior error, and disables Save until another change is made

#### Scenario: Event before save response

- **WHEN** projects:changed refreshes inventory before the save response arrives
- **THEN** the pending draft remains intact and the successful response establishes the baseline without replaying that overlapping inventory

#### Scenario: Overlapping inventory finishes after save

- **WHEN** an inventory read started during a save finishes after its successful response
- **THEN** it does not overwrite the returned row values; later independent successful reads can update the baseline normally

#### Scenario: Refresh failure after successful save

- **WHEN** saving succeeds but the subsequent inventory refresh fails
- **THEN** returned values remain visible, the inventory alert offers Retry, and the row does not report a failed save

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

### Requirement: Identity preservation and visible updates

Saving name or color SHALL preserve project identity, prefix, existing task keys, folder assignment and linked BB project. It SHALL NOT modify the linked BB workspace project's name or color. After a successful save, existing Tasks project displays SHALL refresh to saved name and color where displayed, without application reload or task-route change.

#### Scenario: Preserve project and task identity

- **WHEN** a project with existing tasks, a folder and a BB link is renamed or recolored
- **THEN** its identity, prefix, task keys, folder assignment and BB link remain unchanged and the linked BB project is not updated

#### Scenario: Updated project displays

- **WHEN** a project settings save succeeds
- **THEN** the table and existing Tasks navigation or project choices update displayed name and color where present without switching task scope

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
