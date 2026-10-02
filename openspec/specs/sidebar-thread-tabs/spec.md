# sidebar-thread-tabs Specification

## Purpose

Split the sidebar thread list into Needs attention, In flight, and All tabs, so the user sees first the threads that wait for them and not the threads that still do work.

## Requirements

### Requirement: Thread list tabs
The replacement list SHALL show three tabs above the rows, in this order: Needs attention, In flight, and All. Exactly one tab SHALL be selected. A tab SHALL NOT show a count. The tabs SHALL be keyboard accessible and SHALL expose the selected tab to assistive technology.

#### Scenario: User changes tab
- **WHEN** the user selects the In flight tab
- **THEN** the list shows only the threads that the In flight rules select, and the In flight tab shows as selected

#### Scenario: Tabs have no count
- **WHEN** three threads need attention
- **THEN** the Needs attention tab label shows no number

### Requirement: Selected tab persists
The replacement SHALL save the selected tab with the other list preferences on the client. When no saved tab exists or the saved value is not valid, the replacement SHALL open on Needs attention. Reset list preferences SHALL select Needs attention.

#### Scenario: Reload keeps the tab
- **WHEN** the user selects All and reloads BB
- **THEN** the list opens on All

#### Scenario: First use
- **WHEN** no saved preference exists
- **THEN** the list opens on Needs attention

### Requirement: Attention tabs show only active threads
The Needs attention and In flight tabs SHALL show only active, non-hidden, non-snoozed threads, whatever the archived selection in List options is. A snoozed thread MAY show there only as a dimmed context row of an awake thread in its tree. Each active, non-snoozed thread SHALL be in exactly one of the two tabs.

#### Scenario: Archived thread
- **WHEN** a thread is archived and the archived selection is Both
- **THEN** the thread does not show in Needs attention or In flight, and it shows in All

#### Scenario: Every active thread has one tab
- **WHEN** the list has active threads that are not snoozed
- **THEN** each of them shows in either Needs attention or In flight, and not in both

#### Scenario: Snoozed thread
- **WHEN** an active thread is snoozed
- **THEN** the thread does not show in Needs attention or In flight, and it shows in All

### Requirement: Thread signals decide the tab first
The replacement SHALL apply these rules in order, and the first match SHALL decide. A thread that waits for an approval or an answer, has an unread error, or has a queued message that failed to send SHALL be in Needs attention. Next, a thread with unread output SHALL be in Needs attention. Next, a thread that runs, has background work, or has a queued message that waits SHALL be in In flight. Next, a thread with an active descendant thread SHALL be in In flight.

#### Scenario: Thread waits for an approval
- **WHEN** a thread waits for an approval and its PR has checks running
- **THEN** the thread is in Needs attention

#### Scenario: Unread output on a waiting PR
- **WHEN** a thread is idle with unread output and its PR waits for review
- **THEN** the thread is in Needs attention

#### Scenario: Thread runs
- **WHEN** a thread runs and its PR has failed checks
- **THEN** the thread is in In flight

#### Scenario: Background work
- **WHEN** an idle, read thread has a background agent running
- **THEN** the thread is in In flight

#### Scenario: Parent waits for a running child
- **WHEN** an idle, read thread has no PR and its child thread runs
- **THEN** the parent is in In flight

#### Scenario: Unread parent with a running child
- **WHEN** a thread has unread output and its child thread runs
- **THEN** the parent is in Needs attention

#### Scenario: Running child wins over a PR problem
- **WHEN** an idle, read thread has a PR with failed checks and its child thread has a background agent running
- **THEN** the parent is in In flight

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

### Requirement: PR status decides the tab of an idle thread
When no thread signal rule matches, the replacement SHALL use the github-insight PR summary. A PR with failed checks, requested changes, merge conflicts, or unresolved review comments SHALL put the thread in Needs attention. Otherwise, a PR with checks running or a required review SHALL put the thread in In flight. Every other PR state SHALL put the thread in Needs attention.

#### Scenario: Problem wins over waiting
- **WHEN** an idle, read thread has a PR with failed checks and a required review
- **THEN** the thread is in Needs attention

#### Scenario: Checks running
- **WHEN** an idle, read thread has a PR with checks running and no problem
- **THEN** the thread is in In flight

#### Scenario: Review required
- **WHEN** an idle, read thread has a PR that waits for a required review and has no problem
- **THEN** the thread is in In flight

#### Scenario: Ready, draft, merged, or closed PR
- **WHEN** an idle, read thread has a PR that is ready to merge, a draft, merged, or closed
- **THEN** the thread is in Needs attention

### Requirement: Idle thread without PR data needs attention
An idle, read thread with no PR, or with no usable PR summary, SHALL be in Needs attention. When a usable summary arrives later, the replacement SHALL move the thread to the tab that the PR rules select, without a reload.

#### Scenario: Idle thread without PR
- **WHEN** an idle, read thread has no PR
- **THEN** the thread is in Needs attention

#### Scenario: Summary arrives
- **WHEN** an idle, read thread is in Needs attention without a summary, and then a summary arrives that shows checks running
- **THEN** the thread moves to In flight within the next refresh

### Requirement: Tab rules use the PR status of all active threads
The tab of a thread SHALL NOT depend on whether its row is on screen. The replacement SHALL use the github-insight PR summary of each active thread, and it SHALL refresh these summaries at least once each minute while the list is open.

#### Scenario: Thread off screen
- **WHEN** an idle, read thread is scrolled out of view and its PR has checks running
- **THEN** the thread is in In flight and not in Needs attention

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

### Requirement: Empty tab
A tab with no threads SHALL show a short message that names the tab state, and the tab SHALL stay selectable.

#### Scenario: Nothing needs attention
- **WHEN** no active thread needs attention
- **THEN** the Needs attention tab shows a message that nothing needs the user
