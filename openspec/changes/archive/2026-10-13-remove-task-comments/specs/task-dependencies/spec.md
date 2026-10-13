# Spec Delta

## REMOVED Requirements

### Requirement: Unblocked comment
**Reason**: Task comments are removed, including automatically generated system comments.
**Migration**: Read current blocker state and badges instead of an unblocked comment.

## ADDED Requirements

### Requirement: Dependency resolution creates no comments
Resolving or reopening a blocker SHALL continue to update readiness, badges and filters from current task status. It SHALL NOT create a task comment or replacement history entry, notify a thread or resume an agent.

#### Scenario: Last blocker done
- **WHEN** ABC-3 is the only open blocker of ABC-5 and changes to `done`
- **THEN** ABC-5 is ready and its blocked badge disappears
- **AND** no comment, replacement history entry or thread message is created

#### Scenario: Other blocker still open
- **WHEN** ABC-3 and ABC-4 block ABC-5 and only ABC-3 changes to `done`
- **THEN** ABC-5 remains blocked by ABC-4 with no comment or notification

#### Scenario: Blocker reopened or canceled
- **WHEN** a blocker reopens or changes to `canceled`
- **THEN** readiness, badges and filters reflect the existing dependency rules without activity writes
