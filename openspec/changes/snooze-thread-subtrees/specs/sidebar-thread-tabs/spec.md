# Spec Delta

## MODIFIED Requirements

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
