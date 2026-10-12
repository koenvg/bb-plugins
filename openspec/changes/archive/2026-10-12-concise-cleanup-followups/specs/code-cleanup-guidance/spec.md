# Spec Delta

## ADDED Requirements

### Requirement: Short human summary for cleanup follow-ups

The factory guidance SHALL instruct agents to create a short action title and a description beginning with `## Summary`. The Summary SHALL state the observed problem, human impact, desired outcome and up to three checkable completion criteria in at most 80 whitespace-delimited words, with no minimum. This formatting guidance SHALL apply only to Code Cleanup follow-ups.

#### Scenario: Observed defect warrants a new follow-up

- **WHEN** an agent using factory guidance records a qualifying cleanup follow-up after the existing tracker and duplicate checks
- **THEN** the guidance directs it to put the problem, impact and completion checks in a Summary of at most 80 words
- **AND** the task title is separate from the description word count

#### Scenario: Maintenance work warrants a new follow-up

- **WHEN** the finding is a concrete maintenance cost rather than a user-facing defect
- **THEN** the Summary names the current change that is difficult and how the cleanup makes it easier
- **AND** its completion checks describe the outcome rather than a detailed implementation plan

### Requirement: Concise agent context preserves required information

The factory guidance SHALL instruct agents to follow the Summary with `## Agent context`, targeting at most 120 whitespace-delimited words. It SHALL place relevant locations, verified evidence, task-specific constraints and known source task/thread links there, state each fact once and distinguish observations from uncertain causes. Required safeguards SHALL take precedence over the context target.

#### Scenario: A failure has no proven cause

- **WHEN** an observed failure warrants investigation but its cause is not established
- **THEN** the guidance directs the agent to record the observation and uncertainty separately
- **AND** it retains enough verified evidence and locations to begin investigation without presenting a hypothesis as fact

#### Scenario: Compression would remove an essential safeguard

- **WHEN** the agent cannot keep required task-specific constraints within the context target
- **THEN** the guidance directs it to preserve those constraints and briefly identify why more context is needed
- **AND** it favors linked detailed evidence over repeated history

### Requirement: Detailed cleanup evidence stays behind references

The factory guidance SHALL direct agents to link detailed reports through available task attachments or retrievable source references rather than paste logs, run histories or full diagnostic narratives into follow-up descriptions. The description SHALL retain the decisive observation and a usable evidence reference. References SHALL use verified task keys and known thread links when available.

#### Scenario: A diagnosis includes several test runs

- **WHEN** a qualifying finding is supported by a long comparison report or trace archive
- **THEN** the guidance directs the agent to summarize the decisive observation once and reference the report
- **AND** the description does not depend solely on a temporary local path unavailable to the follow-up worker

#### Scenario: Evidence cannot be shared

- **WHEN** the agent cannot provide a retrievable evidence attachment or reference
- **THEN** the guidance directs it to state that limit and retain the necessary verified facts
- **AND** it does not claim an attachment or source exists when it has not been confirmed

### Requirement: Compact cleanup examples demonstrate the format

The factory guidance SHALL include three compact illustrative examples: an observed defect, a concrete maintenance cost and investigation of an observed failure. Each SHALL demonstrate a short action title, Summary and Agent context within the normal word targets. Examples SHALL be identified as illustrative and their locations and source references SHALL require replacement with verified values.

#### Scenario: Agent needs a model for a maintenance follow-up

- **WHEN** an agent reads the factory guidance while recording a maintenance finding
- **THEN** an example shows the present maintenance cost, expected benefit, completion checks and supporting context
- **AND** the example does not establish evidence that the illustrated issue exists in the current project

### Requirement: Concise cleanup guidance preserves stored content and behavior

The format update SHALL change only factory cleanup guidance and its documentation and tests. Existing tasks, stored custom prompts, project enablement and active provider sessions SHALL remain unchanged. Guidance SHALL retain existing qualification, tracker routing, duplicate checks, labels, verified dependencies and failure-reporting safeguards. Both sections SHALL use the existing Markdown description field without truncation or new task fields.

#### Scenario: An enabled project has custom guidance

- **WHEN** new factory guidance becomes available
- **THEN** the project continues to use its exact saved custom prompt until the user explicitly replaces or resets it
- **AND** existing task descriptions are not rewritten

#### Scenario: Fresh session uses factory guidance

- **WHEN** a newly constructed eligible session has no saved custom prompt
- **THEN** it receives the new format and examples through the existing guidance path
- **AND** tracker, duplicate, dependency and failure-reporting instructions still apply

#### Scenario: Follow-up requires the current change to merge

- **WHEN** an agent creates a qualifying follow-up that requires the current ticket to merge first
- **THEN** the guidance still requires saving the new follow-up as blocked by the current ticket using verified keys
- **AND** shorter descriptions do not reverse that dependency or permit claiming a failed dependency write succeeded
