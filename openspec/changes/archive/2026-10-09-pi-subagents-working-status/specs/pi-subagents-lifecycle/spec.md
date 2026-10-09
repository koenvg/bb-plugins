# Spec Delta

## Purpose

Keep Pi background work represented as native BB activity so an idle main-agent turn does not cause premature session cleanup or lost child completion delivery.

## ADDED Requirements

### Requirement: Countable async subagent activity

The fork SHALL make each represented live async execution eligible for BB's native background-agent activity count and background-work display. Completing the parent turn SHALL NOT hide that activity. The fork SHALL preserve normal parent turn boundaries rather than fabricate a main-agent turn to represent child work.

#### Scenario: Parent finishes while a child remains live

- **WHEN** the parent finishes its normal turn and a represented async child is still running
- **THEN** BB counts that execution as active background-agent work and displays background work even though the parent turn is closed
- **AND** the integration does not open an extra parent turn solely to represent that child

#### Scenario: More than one represented execution remains live

- **WHEN** two independent represented async executions are live and one reaches an authoritative terminal outcome
- **THEN** BB continues to count and display the remaining execution as active background-agent work
- **AND** repeated observations do not count the same execution twice

#### Scenario: A descendant outlives its root

- **WHEN** a represented workflow root is terminal but its descendant is still executing
- **THEN** BB continues to count the represented root's background work until the descendant also reaches an authoritative terminal outcome

#### Scenario: The last represented execution settles

- **WHEN** the last represented execution and its descendants reach authoritative terminal outcomes, whether success, failure, or interruption
- **THEN** the fork's contribution to BB's active background-agent count clears
- **AND** the integration does not require a fabricated final parent turn

#### Scenario: Installed BB acceptance

- **WHEN** this fix is checked in an approved installed BB environment
- **THEN** acceptance verifies BB's actual activity count and background-work display after the parent turn closes and after the child settles
- **AND** emitting or assembling a pending background item alone does not establish a passing result
