# Spec Delta

## MODIFIED Requirements

### Requirement: Thread tree decides the tab
The tab rules SHALL give each active thread its own tab. A thread tree is a top thread and all its active, non-hidden descendants. For tree-level tab selection, only non-archived, non-hidden, non-snoozed members SHALL contribute signals; dimmed context rows SHALL NOT contribute signals. The replacement SHALL apply these tree-wide rules in order, with the first match deciding:

1. If any eligible member waits for an approval or an answer, has unread output, has an unread error, or has a queued message that failed to send, the tree SHALL be in Needs attention.
2. Otherwise, if any eligible member runs, has background work, or has a queued message waiting, the tree SHALL be in In flight, regardless of PR problems on any member.
3. Otherwise, the tree SHALL be in Needs attention when the own tab of its top eligible member is Needs attention, or when a lower eligible member is in Needs attention because of a PR problem. Else the tree SHALL be in In flight.

PR problems SHALL include failed checks, requested changes, merge conflicts, unresolved review comments, and failed merge queue entries. Each member SHALL show only in the tab of its tree, under its parent. Tab placement SHALL NOT suppress existing PR status badges. The tree SHALL reapply these rules when member signals change, without requiring a reload.

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
- **WHEN** a tree is in Needs attention only because one child has unread output, and the user reads that child while the parent still runs
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
