# Spec Delta

## ADDED Requirements

### Requirement: Follow-up dependency direction

When a new cleanup ticket must wait for the current change to merge, the default guidance SHALL tell the agent to save the new ticket as blocked by the current ticket. It SHALL explicitly state that this cleanup does not block completion of the current ticket. It SHALL NOT require this dependency for independent cleanup.

#### Scenario: Cleanup needs the current change merged

- **WHEN** the agent creates a cleanup ticket that needs the current change merged first
- **THEN** the default guidance directs it to make the current ticket a blocker of the new cleanup ticket
- **AND** it explicitly prohibits reversing this dependency to make the current ticket wait for the cleanup
- **AND** it requires saving the task dependency rather than only mentioning it in the description

#### Scenario: Cleanup is independent

- **WHEN** the cleanup does not need the current change merged first
- **THEN** the default guidance does not require adding the current ticket as a blocker

### Requirement: Verified follow-up dependency recording

The default guidance SHALL require verified keys for both tickets before saving a follow-up dependency. If a required key is unavailable or a dependency write fails, it SHALL direct the agent to report the limit and any confirmed cleanup ticket key without claiming that dependency recording is complete.

#### Scenario: Current ticket key is unavailable

- **WHEN** a new cleanup ticket needs the current change merged first but the agent cannot verify the current ticket key
- **THEN** the guidance directs it to report that it could not save the required dependency
- **AND** it prohibits inventing a task key
- **AND** it permits reporting a confirmed cleanup ticket key without claiming complete dependency recording

#### Scenario: Dependency write fails

- **WHEN** both task keys are verified but saving the required dependency fails
- **THEN** the guidance directs the agent to report the confirmed cleanup ticket key and the dependency error
- **AND** it prohibits claiming that the dependency was saved
