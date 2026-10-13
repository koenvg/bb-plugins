# Spec Delta

## MODIFIED Requirements

### Requirement: List and editable ticket share the workspace

Tasks list destinations SHALL fill the main Tasks area and show the selected ticket's existing fully editable detail in a plugin-owned Ticket tab in BB's native right-hand pane. The detail SHALL retain title and description editing, properties, dependencies, subtasks, attachments, linked threads, and delegation. The areas SHALL scroll independently without a permanent project-navigation pane on the right or an internal Tasks split. BB SHALL own the pane's tab strip, resizing, and compact drawer; Browser and Terminal SHALL remain available as host tabs. Before selection, an opened Ticket tab SHALL prompt the user to select a ticket.

#### Scenario: Select a ticket with the mouse

- **WHEN** the user clicks a ticket row in a project list
- **THEN** that ticket's editable detail appears on the right
- **AND** the list remains visible at its current scroll position
- **AND** the clicked row has a persistent selected indicator

#### Scenario: Use existing ticket actions

- **WHEN** the selected ticket is shown on the right
- **THEN** the user can edit its properties and description, manage attachments, open linked threads, and delegate work with the same behavior as the existing detail view

#### Scenario: No ticket selected yet

- **WHEN** a list destination is first opened without a selected ticket
- **THEN** the list remains usable and an opened Ticket tab asks the user to select a ticket

#### Scenario: Independent scrolling

- **WHEN** the user scrolls a long ticket description or attachment list
- **THEN** the list's scroll position remains unchanged
- **AND** scrolling the list does not move the detail content

### Requirement: Ticket changes do not lose or misattribute edits

A transition that replaces the selected ticket or its browsing context SHALL complete pending autosaved edits for the originating ticket before committing the transition. If saving fails, Tasks SHALL retain the current ticket and its draft, show a retryable error, and SHALL NOT silently discard the edit. Older saves and detail responses SHALL NOT overwrite newer content or appear under another ticket. Existing task attachments SHALL remain associated with their owning task when selection changes. Selection SHALL NOT itself upload a file, notify an agent or start delegation. File operations and delegation SHALL still require the existing explicit action.

#### Scenario: Switch during the description debounce

- **WHEN** ABC-1 has an unsaved description change and the user selects ABC-2
- **THEN** the latest ABC-1 description is saved to ABC-1 before ABC-2 becomes selected
- **AND** ABC-2 does not receive any ABC-1 draft content

#### Scenario: Save fails before switching

- **WHEN** saving ABC-1 fails during a requested switch to ABC-2
- **THEN** ABC-1 remains selected with its draft intact
- **AND** a visible retryable save error is shown

#### Scenario: A delayed response arrives

- **WHEN** the user has selected ABC-2 and an older request for ABC-1 finishes
- **THEN** the right pane continues to display ABC-2

#### Scenario: Return to an unsent comment

- **WHEN** a user saves description edits and adds a task attachment on ABC-1, selects ABC-2, and returns to ABC-1
- **THEN** ABC-1 retains its saved description and attachment without a comment draft
- **AND** switching tickets uploads no extra file and notifies no agent

### Requirement: Native pane lifecycle preserves browsing context

Tasks SHALL preserve the selected editor and task-owned drafts when the native Ticket tab is closed, switched away from, or unmounted while the main Tasks page remains mounted. The list SHALL retain scope, filters, sort, expansion, selected row, and scroll position. The plugin SHALL NOT introduce an internal split breakpoint or Back-to-list layout. Inactive editors SHALL NOT own keyboard events or leave active menus/dialogs outside their hidden content. Session retention SHALL end when the Tasks page closes or the browser reloads.

#### Scenario: Switch to Browser or Terminal and return

- **WHEN** ABC-2 has unsaved description text and the user switches away from Ticket or closes its tab
- **THEN** its editor, drafts, and pending writes remain owned by the mounted Tasks page
- **AND** reopening Ticket restores that editor without uploading files, notifying, or delegating

#### Scenario: Resize or use the compact drawer

- **WHEN** the host resizes its panes or changes drawer presentation with ABC-2 selected
- **THEN** the same list and editable ABC-2 remain owned by the Tasks page
- **AND** the plugin does not reset list context, create an inner split, or focus an editor

#### Scenario: Save completes after switching host tabs

- **WHEN** the user requests ABC-2, switches to another host tab during an originating save, and that save succeeds
- **THEN** ABC-2 becomes selected without reopening Ticket or stealing the other pane's focus

#### Scenario: Parked origin cannot save

- **WHEN** a context change requires saving an origin whose Ticket tab is closed
- **THEN** Tasks requests that the origin's Ticket pane be revealed before saving
- **AND** a failed save retains the originating draft and retryable error

#### Scenario: Host declines the Ticket open

- **WHEN** BB declines the request to open Ticket
- **THEN** Tasks shows the same retained origin in a temporary main-page recovery view, with its draft and actual save error accessible without first saving
- **AND** returning to the list or opening standalone detail remains save-guarded, while retrying native placement does not replace the editor

### Requirement: Errors and existing destinations remain usable

A selected ticket's loading, missing-ticket, or load-error state SHALL appear in the detail area without disabling the list or showing another ticket as the selected ticket. Load errors SHALL offer retry. A successfully confirmed deletion SHALL safely clear the unavailable selection. Existing standalone task links, board behavior, retained CLI commands, task mentions, and thread-side task embeds SHALL continue to work.

#### Scenario: Detail lookup fails

- **WHEN** the selected ticket cannot load because of a request failure
- **THEN** its detail area shows a retryable error while the list remains usable
- **AND** the previous ticket's content is not shown as the selected ticket

#### Scenario: Selected ticket has been deleted

- **WHEN** a successful lookup confirms the selected ticket no longer exists
- **THEN** Tasks clears the unavailable selection and leaves the list usable

#### Scenario: Existing board and task links

- **WHEN** the user opens a project board or a standalone task link
- **THEN** the board or named ticket opens with its existing task actions available
- **AND** thread-side embeds and retained CLI behavior are unchanged

## ADDED Requirements

### Requirement: Task detail has no comment UI
Every task detail destination SHALL omit comment history, the Activity section, composer, comment drafts, notification controls and comment-author presentation. Retained description editing, properties, dependencies, subtasks, task attachments, linked threads and delegation SHALL remain available without a replacement activity feed.

#### Scenario: Open task details
- **WHEN** a user opens a standalone task, native Ticket tab or thread-side Task panel
- **THEN** no comment UI, activity-loading control or comment error state appears
- **AND** retained task actions and files remain available

#### Scenario: Change task or host tab
- **WHEN** a user switches tasks, parks Ticket or returns from Browser or Terminal
- **THEN** no comment state is retained or activated
- **AND** retained task edits, task-attachment state and browsing context follow existing save and lifecycle safeguards
