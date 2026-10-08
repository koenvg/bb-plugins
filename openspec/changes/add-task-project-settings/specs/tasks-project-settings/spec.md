# Spec Delta

## Purpose

Lets users change an existing Tasks tracker project's name and color from Tasks settings without changing its identity, task keys, or linked BB workspace project. Delivery 1 edits names and preserves saved color read-only. Interactive color editing in the same table belongs to delivery 2.

## ADDED Requirements

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

Projects SHALL distinguish initial loading, a successful empty inventory and a failed inventory. Failure SHALL offer Retry and SHALL NOT appear as an empty list. Without a current successful inventory, the table SHALL NOT permit new saves even when stale rows remain visible. Cached rows and local drafts SHALL stay mounted during loading or failure. Only a successful inventory SHALL remove rows, and their drafts SHALL NOT transfer to another identity. Ordinary project refreshes SHALL NOT overwrite unsaved row edits; Cancel SHALL use the latest loaded baseline, with successful save responses taking precedence over overlapping reads.

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

### Requirement: Identity preservation and visible updates

Saving name or color SHALL preserve project identity, prefix, existing task keys, folder assignment and linked BB project. It SHALL NOT modify the linked BB workspace project's name or color. After a successful save, existing Tasks project displays SHALL refresh to saved name and color where displayed, without application reload or task-route change.

#### Scenario: Preserve project and task identity

- **WHEN** a project with existing tasks, a folder and a BB link is renamed or recolored
- **THEN** its identity, prefix, task keys, folder assignment and BB link remain unchanged and the linked BB project is not updated

#### Scenario: Updated project displays

- **WHEN** a project settings save succeeds
- **THEN** the table and existing Tasks navigation or project choices update displayed name and color where present without switching task scope

### Requirement: Accessible, compact and stable controls

The Projects tab, table, row name inputs, Save, Cancel and Retry SHALL have accessible names and be operable by keyboard. Delivery 2's color choices SHALL also have accessible names and keyboard operation. Save and inventory errors SHALL be announced as alerts. Compact layouts SHALL have no horizontal page overflow. Already displayed rows and controls SHALL stay in place during loading/refresh; pending labels SHALL NOT resize Save/Cancel. Initial loading SHALL use the table and reserved status area without guessing the eventual inventory size.

#### Scenario: Keyboard editing

- **WHEN** the user operates project settings by keyboard
- **THEN** they can reach a row, edit its name and Save or Cancel, reach inventory Retry, and choose named colors in delivery 2

#### Scenario: Compact layout

- **WHEN** the table is shown in a narrow Tasks panel
- **THEN** rows and relevant controls remain visible and usable without horizontal page overflow

#### Scenario: Stable refresh and saving

- **WHEN** inventory refreshes or a row save is pending
- **THEN** cached rows remain mounted, loading uses the reserved status area, and pending Save/Cancel controls keep their dimensions
