# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Active descendant thread
A descendant thread SHALL be active when it is not archived, not hidden, and it runs, has background work, has a queued message, waits for an approval or an answer, or has an unread error. Descendants SHALL include children at every depth. Unread output or PR status of a descendant SHALL NOT make it active. When the last active descendant stops, the parent SHALL move to the tab that its other rules select, without a reload.

#### Scenario: Grandchild runs
- **WHEN** an idle, read thread has an idle child, and that child has a child thread that runs
- **THEN** the top thread is in In flight

#### Scenario: Child needs the user
- **WHEN** an idle, read parent thread has a child thread that waits for an approval
- **THEN** the child is in Needs attention and the parent is in In flight

#### Scenario: Archived child
- **WHEN** an idle, read thread has no PR and its only running child is archived
- **THEN** the parent is in Needs attention

#### Scenario: Child finished with unread output
- **WHEN** an idle, read thread has no PR and its only child is idle with unread output
- **THEN** the parent is in Needs attention

#### Scenario: Child stops
- **WHEN** a parent is in In flight only because its child runs, and the child becomes idle
- **THEN** the parent moves to the tab that its other rules select
