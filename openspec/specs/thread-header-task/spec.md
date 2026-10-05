# thread-header-task Specification

## Purpose

Shows the task a BB thread works on, with its status, in the thread top bar, so the user can see and open the task without leaving the thread.

## Requirements

### Requirement: Top bar shows the linked task

When a task is linked to a thread, the thread top bar SHALL show a chip with the task status icon, the task key, and the task status label. When no task is linked, the top bar SHALL show no chip.

#### Scenario: One linked task

- **WHEN** a user opens a thread that is linked to ABC-12 with status `in_review`
- **THEN** the top bar shows a chip with the In Review icon, "ABC-12", and "In Review"

#### Scenario: No linked task

- **WHEN** a user opens a thread that no task links to
- **THEN** the top bar shows no task chip

### Requirement: Several linked tasks show the earliest and a count

When 2 or more tasks are linked to a thread, the chip SHALL show the task that was linked first, and a "+N" count of the other linked tasks.

#### Scenario: Two linked tasks

- **WHEN** a thread is linked to ABC-12 first and to ABC-15 later
- **THEN** the chip shows ABC-12 and "+1"

### Requirement: Chip opens the task

A click on the chip SHALL open the shown task in the thread's task side panel. The chip SHALL NOT change the task.

#### Scenario: Open from the chip

- **WHEN** a user clicks the chip that shows ABC-12
- **THEN** the thread's task side panel opens with ABC-12
- **AND** the status of ABC-12 is unchanged

### Requirement: Chip stays current

The chip SHALL update without a manual refresh when the shown task changes, or when a task is linked to the thread.

#### Scenario: Status changes

- **WHEN** ABC-12 changes from `in_progress` to `in_review` while its thread is open
- **THEN** the chip shows "In Review" without a manual refresh

#### Scenario: Task linked while open

- **WHEN** a task is linked to an open thread that showed no chip
- **THEN** the chip appears without a manual refresh

### Requirement: Compact chip on small screens

On a phone-width or coarse-pointer viewport, the chip SHALL show the status icon and the task key only. The status label SHALL stay available as the chip's accessible name.

#### Scenario: Compact viewport

- **WHEN** a user opens a linked thread on a phone-width viewport
- **THEN** the chip shows the status icon and "ABC-12" without the status label
- **AND** the chip's accessible name includes "In Review"
