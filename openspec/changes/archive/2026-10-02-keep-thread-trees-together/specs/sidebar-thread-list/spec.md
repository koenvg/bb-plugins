# Spec Delta

## ADDED Requirements

### Requirement: Thread trees stay together in groups
A thread SHALL show under its parent when the list shows the parent. The whole tree SHALL show in one group. In All, a tree SHALL be in the Needs you group when one or more members need the user. Else a tree with a pinned top thread SHALL be in the Pinned group. Else the project, section, or machine of the top thread SHALL decide the group. The group count SHALL count the members of its trees.

#### Scenario: Child needs the user in All
- **WHEN** the All tab is selected and a child thread waits for an approval
- **THEN** the Needs you group shows the parent with the child under it, and the parent shows in no other group

#### Scenario: Pinned child
- **WHEN** a child thread is pinned and its parent is not pinned
- **THEN** the child shows under its parent in the group of the parent, and not in the Pinned group

#### Scenario: Pinned top thread
- **WHEN** a top thread is pinned and has children
- **THEN** the Pinned group shows the top thread with its children under it

#### Scenario: Child in another project
- **WHEN** the organization is project and a child thread is in a different project than its parent
- **THEN** the child shows under its parent in the group of the parent's project

#### Scenario: Child in another section
- **WHEN** the organization is section and a child thread has a different section than its parent
- **THEN** the child shows under its parent in the section group of the parent

#### Scenario: Hidden parent
- **WHEN** the parent of a thread is hidden
- **THEN** the thread shows as a top-level row

### Requirement: Archived ancestor as a context row
When a shown thread has an ancestor that the lifecycle selection leaves out, and the list has that ancestor in its loaded data, the ancestor SHALL show as a dimmed context row above the thread. A context row SHALL open its thread and SHALL NOT count in its group count. When the ancestor is not loaded, the thread SHALL show as a top-level row.

#### Scenario: Archived parent is loaded
- **WHEN** the All tab with Both is selected, and an active child has an archived parent that is loaded
- **THEN** the parent shows as a normal row with the child under it

#### Scenario: Archived parent left out by the selection
- **WHEN** the All tab with Archived is selected, an archived child has an active parent, and the parent is loaded
- **THEN** the parent shows as a dimmed context row with the child under it, and the group count does not include the parent

#### Scenario: Archived parent not loaded
- **WHEN** the All tab with Active is selected and an active child has an archived parent
- **THEN** the child shows as a top-level row

#### Scenario: Open a context row
- **WHEN** the user activates a context row
- **THEN** BB opens that thread
