# Spec Delta

## Purpose

Lets users change an existing Tasks tracker project's name and color from Tasks settings without changing its identity, task keys, or linked BB workspace project.

## ADDED Requirements

### Requirement: Project settings in Manage

Tasks SHALL provide a Projects tab on its existing Manage page. The tab SHALL list available Tasks tracker projects by name and prefix and allow selection by project identity, including when projects have equal names. Selecting a project for editing SHALL NOT switch the task-browsing project or the BB workspace project. Existing Labels, Presets, and Folders tabs SHALL remain available.

#### Scenario: Open project settings
- **WHEN** the user opens Tasks Manage and selects Projects with projects available
- **THEN** the user can select a project and see its current name and color, with its prefix shown as read-only context

#### Scenario: Equal project names
- **WHEN** two Tasks projects have equal names
- **THEN** both remain distinct choices identified by their prefixes, and edits apply only to the selected identity

#### Scenario: Existing settings remain available
- **WHEN** the user opens Manage after this change
- **THEN** Labels, Presets, and Folders remain available alongside Projects

### Requirement: Explicit name and color edits

The project editor SHALL provide a labelled name input, the existing named color palette, and Save and Cancel controls. Edits SHALL remain local until Save. Save SHALL trim surrounding name whitespace and SHALL reject an empty or whitespace-only name without sending an update. Cancel SHALL restore the selected project's latest loaded name and color and clear the local save error without sending an update. Choosing a different project SHALL start a draft from that project's current values rather than carry edits from the previous selection. An existing color outside the palette SHALL be preserved unless the user chooses a replacement.

#### Scenario: Edit and save
- **WHEN** the user changes a selected project's name and color and activates Save
- **THEN** the editor submits the trimmed name and chosen color for that project

#### Scenario: Blank name
- **WHEN** the name input contains only whitespace
- **THEN** Save is unavailable and no project update is sent

#### Scenario: Cancel local edits
- **WHEN** the user changes the name or color and activates Cancel before saving
- **THEN** the latest loaded project values reappear and no update is sent

#### Scenario: Change the selected project
- **WHEN** the user edits one project without saving and selects a different project
- **THEN** no update is sent for the first project and the editor displays the second project's values

#### Scenario: Existing custom color
- **WHEN** the selected project has a color outside the offered palette and the user changes only its name
- **THEN** saving preserves the existing color

### Requirement: Safe save and failure recovery

The editor SHALL show a pending-save state and allow at most one save request at a time. While saving, it SHALL prevent changes to the selected project, name, color, and Cancel action. A failed save SHALL show a visible error, retain the entered draft for retry, and SHALL NOT report success. A successful save SHALL establish the returned project values as the editor's saved values. Save SHALL be unavailable when the draft matches the saved values.

#### Scenario: Repeated save activation
- **WHEN** the user activates Save repeatedly while a request is pending
- **THEN** only one update request is sent and the project draft cannot change during that request

#### Scenario: Save failure and retry
- **WHEN** saving fails
- **THEN** an error appears, the name and color draft remains available, and the user can retry Save

#### Scenario: Successful save
- **WHEN** saving succeeds
- **THEN** the editor shows the saved values, clears the pending state and prior error, and disables Save until another change is made

### Requirement: Project inventory states

The Projects tab SHALL distinguish initial loading, a successful empty inventory, and a failed inventory. Failure SHALL offer Retry and SHALL NOT appear as an empty project list. Without a current successful inventory, the editor SHALL NOT permit a new save, including when stale project data remains visible. When a successful refresh removes the selected project, that project SHALL no longer be editable. Project refreshes SHALL NOT overwrite unsaved name or color edits for a project that remains selected.

#### Scenario: Initial loading
- **WHEN** the project inventory is still loading
- **THEN** the Projects tab shows a loading state and cannot save a project

#### Scenario: Empty inventory
- **WHEN** the inventory successfully loads with no projects
- **THEN** the tab shows a no-projects message and no editable project form

#### Scenario: Inventory failure and retry
- **WHEN** loading or refreshing projects fails
- **THEN** the tab shows an error and Retry, disables new saves, and does not claim that no projects exist

#### Scenario: Selected project removed
- **WHEN** a successful inventory refresh removes the selected project
- **THEN** its editor is removed and its draft cannot be submitted to a different project

#### Scenario: Refresh during local edits
- **WHEN** a project refresh completes while the selected project has unsaved edits
- **THEN** the name and color draft remains intact for Save or Cancel

### Requirement: Identity preservation and visible updates

Saving name or color SHALL preserve the project's identity, prefix, existing task keys, folder assignment, and linked BB project. It SHALL NOT modify the linked BB workspace project's name or color. After a successful save, existing Tasks project displays SHALL refresh to the saved name and color where those values are displayed, without an application reload or a task-route change.

#### Scenario: Preserve project and task identity
- **WHEN** a project with existing tasks, a folder, and a BB link is renamed and recolored
- **THEN** its identity, prefix, task keys, folder assignment, and BB link remain unchanged and the linked BB project is not updated

#### Scenario: Updated project displays
- **WHEN** a project settings save succeeds
- **THEN** the project selector and existing Tasks navigation or project choices update their displayed name and color where present, without switching task scope

### Requirement: Accessible and compact controls

The Projects tab, selector, name input, color choices, Save, Cancel, and Retry SHALL have accessible names and be operable by keyboard. Save and inventory errors SHALL be announced as alerts. Controls SHALL remain usable in compact Tasks layouts without horizontal page overflow.

#### Scenario: Keyboard editing
- **WHEN** the user operates project settings by keyboard
- **THEN** they can select a project, edit its name, choose a named color, and save or cancel

#### Scenario: Compact layout
- **WHEN** project settings are shown in a narrow Tasks panel
- **THEN** the form and color choices remain visible and usable without horizontal page overflow
