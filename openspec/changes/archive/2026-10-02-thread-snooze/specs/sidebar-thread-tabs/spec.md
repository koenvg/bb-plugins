# Spec Delta

## MODIFIED Requirements

### Requirement: Attention tabs show only active threads
The Needs attention and In flight tabs SHALL show only active, non-hidden, non-snoozed threads, whatever the archived selection in List options is. Each active, non-snoozed thread SHALL be in exactly one of the two tabs.

#### Scenario: Archived thread
- **WHEN** a thread is archived and the archived selection is Both
- **THEN** the thread does not show in Needs attention or In flight, and it shows in All

#### Scenario: Every active thread has one tab
- **WHEN** the list has active threads that are not snoozed
- **THEN** each of them shows in either Needs attention or In flight, and not in both

#### Scenario: Snoozed thread
- **WHEN** an active thread is snoozed
- **THEN** the thread does not show in Needs attention or In flight, and it shows in All
