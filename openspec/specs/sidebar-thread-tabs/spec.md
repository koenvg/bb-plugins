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

The Needs attention and In flight tabs SHALL show only active, non-hidden, non-snoozed threads, whatever the archived selection in List options is. Every member of a snoozed subtree SHALL be excluded from both attention tabs. A snoozed thread SHALL show there only as a dimmed context row of an awake thread outside its snooze group. Each active, non-snoozed thread SHALL be in exactly one of the two tabs. When a snooze group wakes, its members SHALL return together through the existing thread-tree tab rules, without a reload.

#### Scenario: Archived thread

- **WHEN** a thread is archived and the archived selection is Both
- **THEN** the thread does not show in Needs attention or In flight, and it shows in All

#### Scenario: Every active thread has one tab

- **WHEN** the list has active threads that are not snoozed
- **THEN** each of them shows in either Needs attention or In flight, and not in both

#### Scenario: Snoozed thread

- **WHEN** an active thread is snoozed
- **THEN** the thread does not show in Needs attention or In flight, and it shows in All

#### Scenario: Parent subtree snoozed

- **WHEN** a parent, child, and grandchild are snoozed together and no awake thread outside their group requires them as context
- **THEN** none appears in Needs attention or In flight, even if one keeps running

#### Scenario: Child approval wakes the subtree

- **WHEN** an open frontend observes a snoozed child waiting for approval
- **THEN** the whole group wakes and its tree moves together to Needs attention without a reload

#### Scenario: Manual wake of running tree

- **WHEN** a snoozed tree with a running parent and no attention-pulling member is manually woken
- **THEN** the whole tree appears in In flight rather than being forced into Needs attention

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

The tab rules SHALL give each active thread its own tab. A thread tree is a top thread and all its active, non-hidden descendants. For tree-level tab selection, only non-archived, non-hidden, non-snoozed members SHALL contribute signals; dimmed context rows SHALL NOT contribute signals. The replacement SHALL apply these tree-wide rules in order to determine natural placement, with the first match deciding:

1. If any eligible member waits for an approval or an answer, has unread output, has an unread error, or has a queued message that failed to send, the tree SHALL be in Needs attention.
2. Otherwise, if any eligible member runs, has background work, or has a queued message waiting, the tree SHALL be in In flight, regardless of PR problems on any member.
3. Otherwise, the tree SHALL be in Needs attention when the own tab of its top eligible member is Needs attention, or when a lower eligible member is in Needs attention because of a PR problem. Else the tree SHALL be in In flight.

PR problems SHALL include failed checks, requested changes, merge conflicts, unresolved review comments, and failed merge queue entries. Each member SHALL show only in the tab of its tree, under its parent. Tab placement SHALL NOT suppress existing PR status badges. The tree SHALL reapply these rules when member signals change, without requiring a reload. A selected-tree hold SHALL override natural placement as defined below. The following scenarios describe natural placement when no hold applies.

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

- **WHEN** all eligible members are idle with no background or queued work, and an idle, read child has a PR with failed checks
- **THEN** the whole tree shows in Needs attention

#### Scenario: Child PR problem does not pull a running tree

- **WHEN** a parent thread runs and an idle, read child has a PR with failed checks, requested changes, merge conflicts, unresolved review comments, or a failed merge queue entry, and no eligible member has a direct attention signal
- **THEN** the whole tree shows in In flight
- **AND** the child's existing PR problem badge stays visible

#### Scenario: Idle top thread without a PR

- **WHEN** an idle, read top thread has no PR and its only child is idle and read with no PR
- **THEN** the whole tree shows in Needs attention

#### Scenario: Tree moves when the last attention member clears

- **WHEN** a tree is in Needs attention only because one child has unread output, that output becomes read while the parent still runs, and no thread in that tree is selected
- **THEN** the whole tree moves to In flight without a reload

#### Scenario: Background or queued work outranks PR problems

- **WHEN** an eligible member has background work or a queued message waiting, another eligible member has PR conflicts, and no eligible member has a direct attention signal
- **THEN** the whole tree shows in In flight

#### Scenario: Running grandchild outranks a sibling PR problem

- **WHEN** a grandchild runs, another eligible member has PR conflicts, and no eligible member has a direct attention signal
- **THEN** the whole tree shows in In flight, with every member nested under its parent

#### Scenario: Direct attention outranks work and conflicts

- **WHEN** one eligible member runs, another has PR conflicts, and an eligible member has unread output, an unread error, a failed queued message, or a request for input
- **THEN** the whole tree shows in Needs attention

#### Scenario: Last working member stops with a PR problem remaining

- **WHEN** a tree is in In flight because an eligible member is working, that last working member becomes idle, a child's PR problem remains, and no other eligible member has work in progress
- **THEN** the whole tree moves to Needs attention without a reload

#### Scenario: Excluded work does not override an awake PR problem

- **WHEN** an awake, idle member has PR conflicts and the only working thread in its tree is snoozed or archived
- **THEN** the awake tree shows in Needs attention
- **AND** a dimmed context row does not make the tree In flight

#### Scenario: Hidden work does not override a PR problem

- **WHEN** an idle thread has PR conflicts and its only working descendant is hidden
- **THEN** the idle thread shows in Needs attention

### Requirement: PR status decides the tab of an idle thread

When no thread signal rule matches, the replacement SHALL use the github-insight PR summary. A PR with failed checks, requested changes, merge conflicts, unresolved review comments, or a failed merge queue entry SHALL put the thread in Needs attention. Otherwise, a PR with checks running, a required review, or a queued or merging merge queue entry SHALL put the thread in In flight. Every other PR state SHALL put the thread in Needs attention.

#### Scenario: Problem wins over waiting

- **WHEN** an idle, read thread has a PR with failed checks and a required review
- **THEN** the thread is in Needs attention

#### Scenario: Checks running

- **WHEN** an idle, read thread has a PR with checks running and no problem
- **THEN** the thread is in In flight

#### Scenario: Review required

- **WHEN** an idle, read thread has a PR that waits for a required review and has no problem
- **THEN** the thread is in In flight

#### Scenario: PR in a merge queue

- **WHEN** an idle, read thread has a PR with merge queue state `queued`, `awaiting_checks`, or `merging`
- **THEN** the thread is in In flight

#### Scenario: Merge queue failed

- **WHEN** an idle, read thread has a PR with merge queue state `failed`
- **THEN** the thread is in Needs attention

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

### Requirement: Selected tree stays in its attention tab

A selected tree SHALL stay in its existing tab, either Needs attention or In flight, even when signals would place it in the other tab. Eligible selection SHALL be an active, non-hidden, non-snoozed member at any depth. Moving selection within the tree SHALL preserve the held tab. Selection alone SHALL NOT move a tree between tabs. A held tree SHALL appear in exactly one attention tab.

#### Scenario: Read a child while the parent runs

- **WHEN** a tree shows in Needs attention because a child has unread output, the user selects that child, and the output becomes read while its parent still runs
- **THEN** the whole tree stays in Needs attention with the child selected and marked read
- **AND** the tree does not appear in In flight

#### Scenario: Keep the parent selected while a child works

- **WHEN** the parent is selected in a Needs attention tree and its last attention signal clears while a child runs
- **THEN** the whole tree stays in Needs attention

#### Scenario: Navigate within the tree

- **WHEN** a held tree would naturally be In flight and the user selects its parent, a sibling, or a grandchild
- **THEN** the whole tree stays in Needs attention

#### Scenario: Selection and reading arrive together

- **WHEN** the list shows an unread member's tree in Needs attention and the next update both selects that member and marks it read while another member runs
- **THEN** the tree stays in Needs attention without disappearing between those updates

#### Scenario: Selecting an In flight tree does not pull it

- **WHEN** the user selects a member of a tree that was in In flight and has no new attention signal
- **THEN** the tree stays in In flight

#### Scenario: Selected In flight tree finishes work

- **WHEN** an In flight tree is selected and its last working member becomes idle, so its natural placement becomes Needs attention
- **THEN** the whole tree stays in In flight while any eligible member remains selected
- **AND** its work indicators show that work has stopped

#### Scenario: New attention in a selected running tree

- **WHEN** an In flight tree is selected and any member gains unread output, an unread error, a pending approval, a request for input, a failed queued message, or a PR problem that would naturally move the tree to Needs attention
- **THEN** the tree stays in In flight while any eligible member remains selected
- **AND** the corresponding attention and PR indicators update normally
- **AND** the tree does not also appear in Needs attention

#### Scenario: Navigate within a held In flight tree

- **WHEN** a held In flight tree naturally belongs in Needs attention and the user selects its parent, a sibling, or a grandchild
- **THEN** the whole tree stays in In flight

#### Scenario: Selection and completion arrive together

- **WHEN** a tree shows in In flight and the next update both selects a member and stops its last working member, making its natural placement Needs attention
- **THEN** the tree stays in In flight without disappearing between those updates

### Requirement: Selection hold ends when the user leaves the tree

When selection leaves a held tree or is cleared, the replacement SHALL release the hold and immediately use current natural placement. Archive, hide, and snooze exclusions SHALL take precedence over the hold. A selected member that becomes excluded or is removed SHALL NOT keep the hold. A hold SHALL NOT preserve stale membership or indicators.

#### Scenario: Select another tree

- **WHEN** the user selects a thread outside a held Needs attention tree whose attention has cleared and which still has a running member
- **THEN** the previous tree moves to In flight without a reload

#### Scenario: Leave a held In flight tree

- **WHEN** the user leaves a held In flight tree whose current signals naturally place it in Needs attention
- **THEN** the previous tree moves to Needs attention without a reload

#### Scenario: Leave with real attention remaining

- **WHEN** the user leaves a held Needs attention tree that still has an unread member or pending approval
- **THEN** the tree remains in Needs attention under its natural rules

#### Scenario: Clear selection

- **WHEN** no thread remains selected and a previously held tree naturally belongs in the other attention tab
- **THEN** the tree moves to its current natural tab

#### Scenario: Snooze the held subtree

- **WHEN** the user successfully snoozes a held tree
- **THEN** its snoozed members leave both attention tabs and appear under Snoozed in All

#### Scenario: Selected member becomes excluded

- **WHEN** the selected member of a held tree is archived, hidden, snoozed, or removed
- **THEN** that member no longer keeps the hold and remaining eligible members follow normal tree placement
- **AND** any context rows follow the existing visibility rules

### Requirement: Selection hold is temporary presentation state

The replacement SHALL NOT save a hold across sidebar remounts or reloads, or modify unread status to keep a tree visible. While held, read markers, work indicators, PR badges, nesting, grouping, sorting, and collapse controls SHALL continue to follow current data. All-tab grouping SHALL remain unchanged.

#### Scenario: Indicators update while held

- **WHEN** signals change in a tree held in either attention tab
- **THEN** unread markers, attention indicators, work indicators, and PR badges reflect current data without moving the tree
- **AND** its current members remain nested under their parents

#### Scenario: Change tabs while selection stays in the tree

- **WHEN** the user switches between attention tabs or to All and then returns to a held tree's tab without changing selection or remounting the sidebar
- **THEN** the hold remains, All uses its normal grouping, and the held tree appears only in its held attention tab

#### Scenario: Reload resets the hold

- **WHEN** the user reloads while a tree is held only by selection in either attention tab
- **THEN** the replacement uses current natural placement rather than restoring the previous held tab

#### Scenario: Return after leaving

- **WHEN** the user leaves a held tree, it moves to its current natural tab, and the user selects it again
- **THEN** the tree stays in that current tab rather than restoring its previous held tab
