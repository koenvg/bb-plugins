# Spec Delta

## ADDED Requirements

### Requirement: Thread tree decides the tab
The tab rules SHALL give each active thread its own tab. A thread tree is a top thread and all its active, non-hidden descendants. The tree SHALL be in Needs attention when the own tab of the top thread is Needs attention, or when a lower member is in Needs attention because it needs the user, has unread output, or has a PR problem. Else the tree SHALL be in In flight. Each member SHALL show only in the tab of its tree, under its parent.

#### Scenario: Child needs attention under a parent in flight
- **WHEN** a parent thread runs and its child thread waits for an approval
- **THEN** the parent and the child both show in Needs attention, with the child under the parent
- **AND** neither shows in In flight

#### Scenario: Whole tree in flight
- **WHEN** a parent thread runs and its only child has checks running on its PR
- **THEN** the parent and the child both show in In flight

#### Scenario: Grandchild needs attention
- **WHEN** a top thread and its child run, and a grandchild has unread output
- **THEN** all three show in Needs attention, nested at their depths

#### Scenario: Finished children do not pull a running parent
- **WHEN** a parent thread runs a command, one child runs, and two children are idle and read with no PR or with a merged PR
- **THEN** the whole tree shows in In flight

#### Scenario: Child PR problem pulls the tree
- **WHEN** a parent thread runs and an idle, read child has a PR with failed checks
- **THEN** the whole tree shows in Needs attention

#### Scenario: Idle top thread without a PR
- **WHEN** an idle, read top thread has no PR and its only child is idle and read with no PR
- **THEN** the whole tree shows in Needs attention

#### Scenario: Tree moves when the last attention member clears
- **WHEN** a tree is in Needs attention only because one child has unread output, and the user reads that child while the parent still runs
- **THEN** the whole tree moves to In flight without a reload

## MODIFIED Requirements

### Requirement: Active descendant thread
A descendant thread SHALL be active when it is not archived, not hidden, and it runs, has background work, has a queued message, waits for an approval or an answer, or has an unread error. Descendants SHALL include children at every depth. Unread output or PR status of a descendant SHALL NOT make it active. When the last active descendant stops, the parent SHALL move to the tab that its other rules select, without a reload.

#### Scenario: Grandchild runs
- **WHEN** an idle, read thread has an idle child, and that child has a child thread that runs
- **THEN** the top thread is in In flight

#### Scenario: Child needs the user
- **WHEN** an idle, read parent thread has a child thread that waits for an approval
- **THEN** the own tab of the child is Needs attention and the own tab of the parent is In flight
- **AND** the tree, with the parent and the child, shows in Needs attention

#### Scenario: Archived child
- **WHEN** an idle, read thread has no PR and its only running child is archived
- **THEN** the parent is in Needs attention

#### Scenario: Child finished with unread output
- **WHEN** an idle, read thread has no PR and its only child is idle with unread output
- **THEN** the parent is in Needs attention

#### Scenario: Child stops
- **WHEN** a parent is in In flight only because its child runs, and the child becomes idle
- **THEN** the parent moves to the tab that its other rules select

### Requirement: Tabs keep grouping, sort, and pinned order
Each tab SHALL use the selected organization, sort, collapse state, and pinned order. Pinned top threads SHALL show at the top of the tab that their tree selects. A child thread SHALL show under its parent in the tab of their tree. The Needs you group SHALL show only in All.

#### Scenario: Grouping inside a tab
- **WHEN** the organization is project and the In flight tab is selected
- **THEN** In flight threads show under their project groups

#### Scenario: Pinned thread
- **WHEN** a pinned top thread needs attention
- **THEN** it shows in the Pinned group at the top of Needs attention

#### Scenario: Parent in the other tab
- **WHEN** a child thread needs attention and the own tab of its parent is In flight
- **THEN** the parent shows in Needs attention and the child shows under it

#### Scenario: No Needs you group in Needs attention
- **WHEN** the Needs attention tab is selected
- **THEN** the list shows no Needs you group header
