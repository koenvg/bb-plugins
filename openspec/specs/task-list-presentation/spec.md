# task-list-presentation Specification

## Purpose

Makes task lists easier to scan through label-free rows, compact responsive layout, and a clear distinction between task titles and secondary information, without hiding work state or editing controls.

## Requirements

### Requirement: Label-free list rows

Task list rows SHALL NOT display task label names, label color dots, or label overflow counts at any list-panel width. This rule SHALL apply equally to parent tasks and visible subtasks in All tasks, project lists, and the active-work list. Removing label display SHALL NOT remove stored labels or change label filtering, row context-menu label editing, the label keyboard shortcut, or label editing in task details. Board label display SHALL remain unchanged.

#### Scenario: Labeled parent and subtask

- **WHEN** a parent task and a visible subtask each have several labels
- **THEN** neither list row shows label pills, dots, or overflow counts at wide, split-view, or small-screen widths
- **AND** their label assignments remain unchanged

#### Scenario: Filter and edit labels without row badges

- **WHEN** a user filters by a label or edits labels through the existing row menu, keyboard shortcut, or task details
- **THEN** the existing operation works and the list updates correctly
- **AND** the row remains label-free

### Requirement: Compact layout follows list-panel width

At constrained list-panel widths, rows SHALL group status and title on the first line and the task key, priority control, and available metadata on one shared secondary line when content fits. Progress or other metadata SHALL NOT occupy a separate line merely because metadata is present. At sufficient list-panel width, rows SHALL retain a compact single-line layout. Layout selection SHALL follow the available list-panel width rather than the width of the application window.

#### Scenario: Short task in split view

- **WHEN** a wide application window contains a constrained task-list pane and a task with a short title and only a subtask count
- **THEN** the row uses a title line and a secondary line
- **AND** its key, priority control, and subtask count share that secondary line

#### Scenario: Wide list panel

- **WHEN** the list panel has enough width for the task title, controls, and metadata
- **THEN** the row presents them in the compact single-line layout

### Requirement: Readable title and metadata hierarchy

Task titles SHALL be visually primary through greater font weight than ordinary keys and metadata. In the two-line layout, keys and metadata SHALL use a smaller readable type step than the title. Rows SHALL use the active host font and theme, retain usable text contrast, and retain the existing coarse-pointer text and control support. Text SHALL NOT shrink as metadata grows. Long titles and dense metadata SHALL wrap without overlapping controls or causing horizontal list scrolling. A two-line row SHALL be the normal compact case, not a fixed-height limit that clips content.

#### Scenario: Ordinary title and metadata

- **WHEN** a row displays a title, key, and progress count in the two-line layout
- **THEN** the title has greater visual emphasis than the key and progress count
- **AND** secondary text remains readable in the active theme

#### Scenario: Long title and dense work state

- **WHEN** a task has a long title, dependency badges, several thread states, and PR problems in a narrow panel or at increased browser zoom
- **THEN** the title and metadata wrap as needed without clipping or horizontal list scrolling
- **AND** control targets remain usable

### Requirement: Compact thread archive wording preserves meaning

Row thread summaries SHALL retain the current runtime bucket counts and ordering, including Idle and visible failures. The visible archive phrase SHALL be `All archived` when all existing attachments are known to be archived and SHALL be `N archived` for a partial known archived count. An unknown archive state SHALL remain visibly identified as unavailable and SHALL NOT be treated as unarchived or fully archived. The accessible summary and thread menu SHALL retain full runtime counts, archive meaning, and individual thread navigation.

#### Scenario: All existing threads archived

- **WHEN** all existing attached threads are known to be archived and one is Idle
- **THEN** the row shows the Idle count and `All archived`
- **AND** the accessible summary explicitly says all threads are archived
- **AND** the thread menu retains archive state for each thread

#### Scenario: Mixed runtime and archive states

- **WHEN** a task has working and failed threads, with only some threads archived
- **THEN** the failure remains visible and the row shows the known archived count as `N archived`
- **AND** the thread menu exposes all runtime and archive states

#### Scenario: Archive information is unknown

- **WHEN** one or more existing attachments have unknown archive state
- **THEN** the row retains a visible archive-unavailable indication
- **AND** it does not claim that all threads are archived

### Requirement: Short PR quality controls remain truthful

A row with a single known PR SHALL retain its GitHub identity link and primary lifecycle or problem state. Secondary quality and lookup explanations SHALL use short textual controls, with detailed counts and causes available in the PR menu and accessible description. Stale, unavailable, and incomplete information SHALL remain distinguishable in those details, and uncertainty SHALL remain visible in the row. A compact mixed-quality summary SHALL NOT imply that unknown PRs are absent, ready, or successfully checked. Existing visible PR problem priority and multi-PR aggregation SHALL remain unchanged.

#### Scenario: Known merged PR with missing lookup data

- **WHEN** a task has one known merged PR and one unavailable thread-to-PR lookup
- **THEN** the row retains `PR #N` and `Merged` and a short textual unavailable or incomplete lookup indication
- **AND** the PR menu and accessible description identify the unavailable lookup and its count

#### Scenario: Stale or unavailable PR details

- **WHEN** a known PR has stale or unavailable rich details
- **THEN** its row retains a short textual quality warning
- **AND** the PR menu distinguishes stale details from unavailable details
- **AND** the row does not label that PR Ready solely from missing or stale information

#### Scenario: PR lookup yields no known items and is unavailable

- **WHEN** no PR items are known and their lookup is unavailable
- **THEN** the row reports PRs unavailable rather than presenting an authoritative absence of PRs

#### Scenario: Several PRs have different conditions

- **WHEN** a task has multiple PRs with a known failure and incomplete lookup data
- **THEN** the row retains a visible problem state and visible uncertainty
- **AND** its menu exposes each known PR identity, condition, and data-quality issue

### Requirement: Empty metadata does not reserve row space

A row with no subtask progress, dependency badges, thread or PR summary, due date, or required project marker SHALL NOT reserve an empty metadata line or gap. Loading or unavailable work status SHALL remain visible until the system knows that no thread or PR summary is needed. Retained metadata SHALL keep its current order: subtask progress, dependencies, threads, PRs, due date, and project marker.

#### Scenario: Only labels were assigned

- **WHEN** a task has labels but no other metadata and thread and PR lookups authoritatively report no items
- **THEN** the row shows its title, key, status, and priority without an empty metadata line

#### Scenario: Work status is still loading

- **WHEN** a task's work status has not loaded
- **THEN** the row keeps the current loading indication instead of hiding the metadata as empty

### Requirement: Layout preserves task interaction

The compact row SHALL retain task opening, subtask expansion, status and priority editing, row selection, and keyboard navigation. Its visual and keyboard reading order SHALL agree at each layout width. Summary controls and subtask expansion SHALL NOT accidentally open the task. Existing touch-target sizes and focus restoration SHALL remain intact.

#### Scenario: Use a summary control

- **WHEN** a user opens and closes a thread or PR summary with touch, mouse, or keyboard
- **THEN** the corresponding menu opens without opening the task
- **AND** focus returns to the summary control after the menu closes

#### Scenario: Navigate and edit an indented subtask

- **WHEN** a user selects an indented subtask, edits its priority or status, or opens its label keyboard menu
- **THEN** the existing operation works in both layout modes
- **AND** the subtask keeps the same title and metadata hierarchy as its parent

### Requirement: Collapsible status sections

Every displayed status section in All tasks, a project task list, and Active work SHALL have a header control that expands or collapses that section. The header SHALL remain visible with its status icon, name, task count, and a chevron that indicates its expanded state. A collapsed section SHALL hide all its parent and subtask rows. Sections SHALL start expanded when no saved choice exists. Section collapse SHALL NOT change task data or open a task.

#### Scenario: Collapse any status section

- **WHEN** a user activates the header of any expanded status section, including Backlog
- **THEN** all rows in that section are hidden and its header and count remain visible
- **AND** other sections retain their current expanded state

#### Scenario: Expand a section

- **WHEN** a user activates a collapsed section header
- **THEN** its rows return with the current filter, sort, and subtask expansion state
- **AND** no task detail opens because of the header activation

#### Scenario: No saved choice

- **WHEN** a user opens a list scope that has no saved section choices
- **THEN** all displayed status sections are expanded

### Requirement: Saved section choices are independent by list scope

The list SHALL save each section collapse and expand choice on the device, independently for each project, All tasks, and Active work. The list SHALL restore that choice after navigation away and back, a panel reload, and an app restart. Changes to filters or sorting SHALL NOT reset section choices. A section that temporarily has no rows SHALL retain its saved choice for when it returns. This change SHALL NOT require settings to sync between devices.

#### Scenario: Navigate away and return

- **WHEN** a user collapses Backlog in All tasks, opens another view, and returns to All tasks
- **THEN** Backlog remains collapsed

#### Scenario: Reload or restart

- **WHEN** a user reloads the panel or restarts the app after saving collapsed sections
- **THEN** each list scope restores its saved section choices

#### Scenario: Independent scopes

- **WHEN** a user collapses Backlog in project A
- **THEN** this does not change Backlog in project B, All tasks, or Active work
- **AND** returning to project A restores its collapsed Backlog

#### Scenario: Filter and sort changes preserve choices

- **WHEN** a user changes filters or sorting after collapsing a section
- **THEN** that section remains collapsed if present
- **AND** clearing filters does not erase its saved choice

#### Scenario: Section disappears and returns

- **WHEN** a collapsed section has no matching rows and later receives matching rows
- **THEN** it returns collapsed with its current task count

### Requirement: Safe section preference recovery

Missing or invalid saved section preferences SHALL fall back to expanded sections without losing valid saved filters or sorting. Invalid status values and duplicate entries SHALL NOT affect other sections. A storage read or write failure SHALL NOT prevent section interaction during the current mounted view. An unsupported future storage version SHALL NOT be overwritten.

#### Scenario: Existing preferences have no section state

- **WHEN** saved preferences contain valid filters and sorting but no section choices
- **THEN** the list retains those filters and sorting and starts its sections expanded

#### Scenario: Invalid section values

- **WHEN** saved section choices contain duplicates or unknown statuses
- **THEN** valid choices apply once and invalid choices are ignored

#### Scenario: Storage unavailable

- **WHEN** device storage throws during a section toggle
- **THEN** the section still changes state in the current mounted view without an application error

#### Scenario: Future storage version

- **WHEN** a user toggles a section while the saved preference document has an unsupported future version
- **THEN** the toggle works in the current mounted view and the stored document is not rewritten

### Requirement: Accessible section controls and safe hidden selection

Section header controls SHALL support pointer, touch, Enter, and Space activation, expose an accessible name and expanded state, and show keyboard focus. Hidden rows SHALL NOT be focusable or appear in task keyboard navigation or visible selection order. Collapsing a section that contains the selected task SHALL use the existing save-before-context-change protection before committing the collapse or its saved preference. After an accepted collapse, the hidden task selection SHALL clear without deleting or modifying the task. A failed save SHALL retain the draft, selection, expanded section, and prior saved preference until a successful retry accepts the change. Focus SHALL remain on a visible section control after collapse.

#### Scenario: Keyboard activation

- **WHEN** a user focuses a section header and activates it with Enter or Space
- **THEN** the section toggles and its exposed expanded state updates
- **AND** focus stays on the section control

#### Scenario: Skip hidden tasks

- **WHEN** a user uses task navigation shortcuts with a collapsed section
- **THEN** the shortcuts skip every hidden parent and subtask

#### Scenario: Selected task is hidden by an accepted collapse

- **WHEN** a section collapse is accepted and hides the selected task
- **THEN** the selected detail clears through the existing context-change policy
- **AND** the section collapse and its saved preference are committed

#### Scenario: Unsaved task cannot be saved

- **WHEN** a user collapses the selected task's section and saving the task fails
- **THEN** the section remains expanded and the draft and selection remain available
- **AND** the saved section preference remains unchanged
- **AND** a successful save retry completes the requested collapse and clears the hidden selection

#### Scenario: All sections are collapsed

- **WHEN** all displayed sections are collapsed
- **THEN** the section headers remain available to expand the list
- **AND** the list does not claim that no tasks match solely because rows are hidden
