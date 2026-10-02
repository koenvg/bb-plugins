# Spec Delta

## Purpose

Lets users scan and edit consecutive tickets in a persistent list/detail workspace, with mouse and keyboard selection that preserves project and list context.

## ADDED Requirements

### Requirement: List and editable ticket share the workspace
When the Tasks panel has enough width for usable list and detail panes, its list destinations SHALL show the ticket list on the left and the selected ticket's existing fully editable detail on the right. The detail pane SHALL retain title and description editing, properties, dependencies, subtasks, attachments, comments, linked threads, and delegation. The panes SHALL scroll independently without a permanent project-navigation pane on the right. Before any ticket is selected, the detail area SHALL prompt the user to select a ticket.

#### Scenario: Select a ticket with the mouse
- **WHEN** the user clicks a ticket row in a sufficiently wide project list
- **THEN** that ticket's editable detail appears on the right
- **AND** the list remains visible at its current scroll position
- **AND** the clicked row has a persistent selected indicator

#### Scenario: Use existing ticket actions
- **WHEN** the selected ticket is shown on the right
- **THEN** the user can edit its properties and description, comment, manage attachments, open linked threads, and delegate work with the same behavior as the existing detail view

#### Scenario: No ticket selected yet
- **WHEN** a list destination is first opened without a selected ticket
- **THEN** the list remains usable and the detail area asks the user to select a ticket

#### Scenario: Independent scrolling
- **WHEN** the user scrolls a long ticket description or activity feed
- **THEN** the list's scroll position remains unchanged
- **AND** scrolling the list does not move the detail content

### Requirement: Selection has one identity and visible order
The selected row, displayed detail, and selection-dependent actions SHALL refer to the same ticket. Selection SHALL follow the list's current filtered and sorted visible order, including expanded subtask rows and displayed dimmed parent rows. Collapsed or hidden rows SHALL NOT be keyboard selection targets. Project changes SHALL clear the previous project's selection. When a settled list update removes the selected row, Tasks SHALL safely clear selection rather than display a different row as selected or continue showing a hidden selection. Temporary loading SHALL NOT be treated as removal.

#### Scenario: Select an expanded subtask
- **WHEN** a parent is expanded and the user selects one of its visible subtasks
- **THEN** the subtask row is selected and its own detail appears on the right
- **AND** the parent's nesting and status group remain unchanged

#### Scenario: Selected ticket no longer matches
- **WHEN** a filter, status edit, deletion, or collapse produces a settled list that no longer contains the selected row
- **THEN** the selection is cleared after pending edits are handled safely
- **AND** the detail area returns to its selection prompt

#### Scenario: Refresh keeps a still-visible selection
- **WHEN** the list reloads and the selected ticket is still visible when the response settles
- **THEN** the same ticket stays selected
- **AND** transient loading does not clear it

### Requirement: Keyboard movement updates the preview
On list destinations, `j` or Down Arrow SHALL select the next visible ticket and `k` or Up Arrow SHALL select the previous visible ticket, updating the preview without an additional open action. With no selection, the first movement key SHALL select the first visible ticket. Movement SHALL stop at the first or last row, keep the selected row visible, and retain a visible keyboard-focus indicator. Movement from a non-editable control in the detail pane SHALL continue from the current selected ticket rather than restarting at the beginning of the list. Ordinary unsaved-edit-free selection SHALL NOT require a confirmation dialog.

#### Scenario: Move to the next preview
- **WHEN** ABC-1 is selected and ABC-2 is the next visible row and the user presses `j`
- **THEN** ABC-2 is selected, receives row focus, and appears in the detail pane

#### Scenario: Begin without a selection
- **WHEN** no ticket is selected and the user presses `k`
- **THEN** the first visible ticket is selected and previewed

#### Scenario: Movement uses the filtered order
- **WHEN** the visible order is ABC-3, ABC-1, ABC-4 under the current filters and sort
- **AND** ABC-1 is selected and the user presses Down Arrow
- **THEN** ABC-4 is selected rather than a ticket from an unfiltered pager order

#### Scenario: Move from detail controls
- **WHEN** ABC-2 is selected and keyboard focus is on a non-editable detail control and the user presses `j`
- **THEN** selection advances from ABC-2 to the next visible row

#### Scenario: Boundary and empty list
- **WHEN** the user presses a movement key past a list boundary or while no rows are visible
- **THEN** no out-of-range ticket is selected and no unrelated detail opens

### Requirement: Keyboard actions respect focus and editing
Single-key actions SHALL NOT fire while typing in a text input or rich-text editor, during composition, with Cmd, Ctrl, or Alt held, while a menu or dialog is open, or while focus is in another BB pane. List property shortcuts SHALL act on the focused selected row; detail property shortcuts SHALL act on the selected ticket when focus belongs to detail. A key press SHALL produce at most one action. In the split layout, Enter or `o` on a selected row SHALL move focus into its detail without replacing the list, and Escape from a non-editable detail control SHALL return focus to the selected row. Escape SHALL NOT discard editor content or override an open overlay's dismissal behavior.

#### Scenario: Type in the description
- **WHEN** the description editor has focus and the user types `j` or `k`
- **THEN** the letter goes into the editor and selection does not change

#### Scenario: One property action
- **WHEN** both panes are mounted and the selected row has focus and the user presses `s`
- **THEN** only that row's status menu opens

#### Scenario: Property action in detail
- **WHEN** focus belongs to a non-editable detail control and the user presses `s`
- **THEN** only the selected ticket's detail status menu opens

#### Scenario: Enter and return
- **WHEN** a selected row has focus and the user presses Enter
- **THEN** focus moves into the selected ticket's detail
- **AND** Escape from a non-editable detail control returns focus to the same row without clearing selection

#### Scenario: Menu or another pane owns the key
- **WHEN** a menu or dialog is open, or focus is inside another BB pane, and the user presses `j`
- **THEN** the Tasks selection does not move

### Requirement: Ticket changes do not lose or misattribute edits
A transition that replaces the selected ticket or its browsing context SHALL complete pending autosaved edits for the originating ticket before committing the transition. If saving fails, Tasks SHALL retain the current ticket and its draft, show a retryable error, and SHALL NOT silently discard the edit. Older saves and detail responses SHALL NOT overwrite newer content or appear under another ticket. Unsent comments and staged attachments SHALL NOT be posted, notified, or moved to another ticket merely because selection changes; they SHALL remain associated with their originating ticket for the current mounted Tasks session. Sending a comment or starting delegation SHALL still require the existing explicit action.

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
- **WHEN** the user drafts a comment with an attachment on ABC-1, selects ABC-2, and returns to ABC-1 during the same mounted Tasks session
- **THEN** the unsent text and attachment are still associated with ABC-1
- **AND** no comment or agent notification was sent by switching tickets

### Requirement: Compact layout preserves browsing context
When the available Tasks panel width cannot fit usable list and detail panes, selecting a ticket SHALL show a single detail view with a return action. Returning SHALL restore the same project scope, filters, sort, expansion, selected ticket, and list position. Resizing between compact and split layouts SHALL retain the selection and draft ownership rather than remounting a different ticket. Layout decisions SHALL use the Tasks panel's available width, not only the browser window width.

#### Scenario: Compact selection and return
- **WHEN** the Tasks panel is narrow and the user selects ABC-2 from a scrolled project list
- **THEN** ABC-2 detail replaces the visible list
- **AND** returning restores the list at its previous position with ABC-2 selected

#### Scenario: Resize with an active selection
- **WHEN** ABC-2 is selected and the Tasks panel becomes wide enough for the split layout
- **THEN** its editable detail appears beside the same list and remains ABC-2

### Requirement: Errors and existing destinations remain usable
A selected ticket's loading, missing-ticket, or load-error state SHALL appear in the detail area without disabling the list or showing another ticket as the selected ticket. Load errors SHALL offer retry. A successfully confirmed deletion SHALL safely clear the unavailable selection. Existing standalone task links, board behavior, CLI commands, task mentions, and thread-side task embeds SHALL continue to work.

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
- **AND** thread-side embeds and CLI behavior are unchanged
