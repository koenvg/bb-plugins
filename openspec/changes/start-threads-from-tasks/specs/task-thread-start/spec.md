# Spec Delta

## Purpose

Lets users start BB threads from project tasks through a reviewable composer while keeping each task connected to the work it started.

## ADDED Requirements

### Requirement: Task offers a start or open action
The task board SHALL offer Start for an unfinished task with no linked thread and completed prerequisites. A task with a linked thread SHALL offer Open thread instead of Start. A completed task or a task with unfinished prerequisites SHALL NOT start a new thread.

#### Scenario: Eligible unlinked task
- **WHEN** a user views an unfinished task with no linked thread and all prerequisites complete
- **THEN** the task offers Start

#### Scenario: Existing linked thread
- **WHEN** a user views a task with a linked thread
- **THEN** the task offers Open thread and does not offer Start

#### Scenario: Unfinished prerequisite
- **WHEN** a user views an unlinked task whose prerequisite is not done
- **THEN** the task cannot start a thread and the reason is visible

### Requirement: Starting a task opens a reviewable composer
Selecting Start SHALL navigate to a task-specific page with a new-thread composer prefilled with the task prompt and the task's project. The user SHALL be able to edit the prompt and choose available model, environment, and permission settings before submitting. The resulting thread MUST belong to the task's project; a different project selection MUST be rejected without losing the draft. Opening or leaving the composer SHALL NOT itself create a thread or change the task.

#### Scenario: Review before starting
- **WHEN** a user selects Start on an eligible task
- **THEN** a task-specific composer opens with the task prompt and project selected, and no thread has been created

#### Scenario: Leave without submitting
- **WHEN** a user leaves the task-specific composer without submitting
- **THEN** the task remains unchanged and no thread is created

#### Scenario: Different project selected
- **WHEN** the composer is submitted with a project other than the task's project
- **THEN** submission is rejected with an explanation and the editable draft remains available

### Requirement: Submitting starts and links one thread
On a valid submission, the system SHALL create a BB thread using the submitted prompt and the user's selected execution settings, link the new thread to the task, set the task to In progress with Focus attention, and navigate to the thread. Editing the submitted prompt SHALL NOT overwrite the stored task prompt. Task eligibility and project membership MUST be checked again at submission time.

#### Scenario: Successful submission
- **WHEN** a user submits an eligible task's composer with a valid selection and an edited prompt
- **THEN** one thread starts in the task's project with that prompt and selection, the task links to it and becomes In progress with Focus attention, and the user is taken to it
- **AND** the stored task prompt is unchanged

#### Scenario: Task linked while composer is open
- **WHEN** another action links a thread to the task before the user submits
- **THEN** submission does not create another thread and the user can open the already linked thread

#### Scenario: Concurrent submissions
- **WHEN** the same task is submitted from more than one open composer
- **THEN** at most one new thread is started for that task and linked to it

#### Scenario: Create fails before a thread exists
- **WHEN** BB refuses to create the thread
- **THEN** the task remains unchanged, the draft stays available, and the user sees the failure

#### Scenario: Link is interrupted after creation
- **WHEN** BB creates a task-originated thread but saving the task link is interrupted
- **THEN** the task does not start a second thread on retry and the existing thread can be recovered and linked

### Requirement: Pending launches have an explicit recovery path
A task-specific page SHALL update when another tab links the task's thread and SHALL let a user recheck an unresolved launch. While a launch is actively starting, the system SHALL reject manual resolution. For a launch that is no longer active, an operator MAY link a known existing thread in the same project or release the claim after explicitly confirming that no task-originated thread can be found. Before either action, the system SHALL recheck the claim and search for its thread; a discovered task-originated thread takes precedence. Releasing an unresolved claim SHALL NOT start or delete a thread or change the task's other fields. The next thread start requires a separate composer submission, and the interface SHALL warn that releasing a claim when creation was merely delayed could permit duplicate work.

#### Scenario: Another tab finishes the launch
- **WHEN** a task-specific page shows a pending launch and another tab links its thread
- **THEN** the page updates to offer Open thread without a reload

#### Scenario: Manual recheck finds a thread
- **WHEN** an operator rechecks an unresolved claim and BB now reports the claimed thread
- **THEN** the task links to that thread and offers Open thread without another spawn

#### Scenario: Link a known thread
- **WHEN** an operator selects a known existing same-project thread for an unresolved claim
- **THEN** the task links to that thread, becomes In progress with Focus attention, and the claim clears without spawning

#### Scenario: Release an unresolved claim
- **WHEN** an operator explicitly confirms no thread was created and requests release of an unresolved claim
- **THEN** a fresh search finds no claimed thread, the claim clears, and the unchanged task becomes eligible to start again through a new composer submission

#### Scenario: Resolution is unsafe
- **WHEN** the launch is active, the claim has changed, the proposed thread is from another project, or the recheck cannot complete
- **THEN** resolution is rejected and the claim remains; no thread is started or deleted

### Requirement: Task and thread lifecycles remain independent
Starting from a task SHALL NOT automatically mark it Done when the thread becomes idle, fails, or finishes a turn. Manual linking to an existing same-project thread and manual task status changes SHALL remain available.

#### Scenario: Thread finishes a turn
- **WHEN** the linked thread finishes a turn
- **THEN** the task keeps its current status until a user or another task action changes it

#### Scenario: Manually linked task
- **WHEN** a user links an existing thread from the same project to a task
- **THEN** Open thread takes them to it without creating a new thread
