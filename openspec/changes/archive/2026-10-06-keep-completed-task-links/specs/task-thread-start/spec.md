# Spec Delta

## ADDED Requirements

### Requirement: Agents preserve task-to-thread links by default

Agent task guidance SHALL require retaining task-to-thread links when work completes, enters review, is handed off, is replaced, fails, or moves to other work. An agent SHALL detach a thread only when the user explicitly requests removal of that task-to-thread link. Completion and handoff SHALL NOT be treated as permission to detach. Manual detach SHALL remain available without stopping the thread or changing the task status.

#### Scenario: Agent completes a task

- **WHEN** an agent marks its linked task Done after meeting the completion criteria
- **THEN** the agent keeps the task-to-thread link and does not run detach as completion cleanup

#### Scenario: Agent hands work to a successor

- **WHEN** work is handed off or replaced without a user request to remove the predecessor's link
- **THEN** the guidance requires keeping the predecessor's link
- **AND** keeping the link does not grant the predecessor new execution or reporting authority

#### Scenario: Work stops or enters review

- **WHEN** work fails, enters review, or moves to another task without an explicit removal request
- **THEN** the guidance does not authorize removal of the existing link

#### Scenario: User explicitly requests removal

- **WHEN** the user explicitly requests removal of a specified task-to-thread link
- **THEN** an agent can use the existing detach action for that link
- **AND** detaching does not stop the thread or change the task status

#### Scenario: Either agent entry point supplies guidance

- **WHEN** an agent reads the bundled Tasks skill and its link-repair reference or receives a new delegated-worker prompt
- **THEN** it receives the same default to retain links and the same explicit-request rule for detach

#### Scenario: Guidance update does not repair old data

- **WHEN** the updated guidance becomes available
- **THEN** existing detached links and previously delivered prompts remain unchanged
