# Spec Delta

## Purpose

Lets users open a thread's linked task from the right-side Task launcher, while keeping task links from header chips and messages on the task the user selected.

## ADDED Requirements

### Requirement: Task launcher opens the linked task

When a thread's Task panel opens without a task key, it SHALL show the first task linked to that thread, matching the header chip's selection. Task status SHALL NOT exclude a linked task. Resolving the selection SHALL NOT modify task data or thread links.

#### Scenario: Open from the launcher

- **WHEN** a user selects Task in a thread linked to ABC-12 without passing a task key
- **THEN** the panel shows ABC-12's task details and its Open in Tasks control
- **AND** the task and its thread links remain unchanged

#### Scenario: Several linked tasks

- **WHEN** ABC-12 was linked before ABC-15 and the user opens Task without a task key
- **THEN** the panel shows ABC-12, matching the header chip

#### Scenario: Completed linked task

- **WHEN** the first linked task is Done and the user opens Task without a task key
- **THEN** the panel shows that completed task's details

#### Scenario: Restore a panel without a key

- **WHEN** a Task tab with no task key is restored after reload
- **THEN** it resolves the restored thread's linked task instead of requiring a message-card click

### Requirement: Explicit task links retain their target

A Task panel opened with a nonempty task key SHALL retain that explicit target instead of selecting the thread's linked task. Existing invalid-key and missing-task feedback SHALL remain available; an explicit target SHALL NOT silently fall back to another task.

#### Scenario: Explicit task differs from linked task

- **WHEN** a message card opens ABC-15 while the current thread is linked to ABC-12
- **THEN** the panel shows ABC-15

#### Scenario: Explicit task no longer exists

- **WHEN** a header or message link opens a task that no longer exists
- **THEN** the panel shows its existing missing-task feedback rather than another linked task

### Requirement: Linked-task lookup has visible states

A panel resolving a thread's linked task SHALL display loading feedback until the lookup completes. A successful lookup with no linked tasks SHALL display a clear no-linked-task message. A failed lookup SHALL display an error and a manual Retry control, not an empty state.

#### Scenario: Lookup pending

- **WHEN** the linked-task lookup is pending
- **THEN** the panel displays accessible loading feedback and does not claim that no task is linked

#### Scenario: No linked task

- **WHEN** the lookup succeeds with no linked tasks
- **THEN** the panel states that no task is linked to this thread

#### Scenario: Retry a failed lookup

- **WHEN** the lookup fails and the user activates Retry
- **THEN** the panel attempts the lookup again and displays the resulting details, empty state, or error

### Requirement: Default selection stays current without losing edits

A panel without an explicit key SHALL refresh linked-task selection through the existing task/thread update and reconnect behavior. A change of selected task SHALL preserve the existing save-before-switch safeguard. A failed save SHALL keep the current task, its edits, and its Open in Tasks target together.

#### Scenario: Link added to an empty panel

- **WHEN** a task is linked while the default Task panel shows no linked task
- **THEN** the panel shows that task after the existing refresh

#### Scenario: Save fails during a selection change

- **WHEN** a linked-task change requests a different task while the current task has unsaved edits and its save fails
- **THEN** the panel keeps the current task, its edits, and its Open in Tasks target rather than discarding them
