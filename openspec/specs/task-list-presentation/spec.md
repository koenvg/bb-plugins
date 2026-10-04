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
