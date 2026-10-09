# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
