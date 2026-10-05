# Spec Delta

## MODIFIED Requirements

### Requirement: Top bar shows the linked task

When a task is linked to a thread, the thread top bar SHALL show a chip with the task status icon, the task key, and the task status label, including when the task is Done. A task status change SHALL NOT remove the chip while the link remains. When no task is linked, the top bar SHALL show no chip.

#### Scenario: One linked task

- **WHEN** a user opens a thread that is linked to ABC-12 with status `in_review`
- **THEN** the top bar shows a chip with the In Review icon, "ABC-12", and "In Review"

#### Scenario: No linked task

- **WHEN** a user opens a thread that no task links to
- **THEN** the top bar shows no task chip

#### Scenario: Open a completed task's thread

- **WHEN** a user opens a thread linked to ABC-12 with status `done`
- **THEN** the top bar shows the Done icon, "ABC-12", and "Done" using the existing compact-viewport rule
- **AND** clicking the chip opens ABC-12 without changing it

#### Scenario: Complete a task while its thread is open

- **WHEN** ABC-12 changes to `done` while its linked thread is open
- **THEN** its chip remains visible and updates to Done without a manual refresh

#### Scenario: User removes the link

- **WHEN** the user explicitly removes the only task-to-thread link
- **THEN** the task chip disappears after the existing refresh without stopping the thread or changing the task status
