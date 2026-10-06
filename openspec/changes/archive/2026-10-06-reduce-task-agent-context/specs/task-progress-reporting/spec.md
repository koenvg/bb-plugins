# Task progress reporting spec delta

## MODIFIED Requirements

### Requirement: Consistent guidance at both agent entry points

The bundled Tasks skill and initial delegated-worker guidance SHALL communicate the same short outcome policy. Comments SHALL be recommended only for review readiness, completion, failure, a blocker or a user decision, not intermediate milestones or automatic parent updates. The policy SHALL preserve relevant check outcomes, material limits and explicit status gates without requiring a new reporting command or an orchestration run. Posting examples SHALL load only when a comment is needed.

#### Scenario: Delegated worker receives the rules

- **WHEN** a task is delegated with a preset
- **THEN** its starting prompt includes the short outcome policy alongside the existing task requirements, blockers, artifact references and status responsibilities
- **AND** it does not include detailed posting procedures or automatic epic-summary duties

#### Scenario: Agent works through the Tasks skill

- **WHEN** an agent loads the bundled Tasks skill to work on an explicitly assigned task
- **THEN** it receives the same outcome conditions and status gates without needing to start another worker
- **AND** detailed posting examples are referenced only for an actual reporting need

## ADDED Requirements

### Requirement: Comments only for useful outcomes

Default task-work guidance SHALL recommend a comment only when work is ready for review or complete, fails, is blocked, or requires a user decision. It MUST NOT require comments for ordinary edits, commits, test runs, child state changes or unchanged state. The guidance MUST NOT add automatic parent-summary refresh duties, polling, wakeups or notification authority.

#### Scenario: Work continues without a useful outcome

- **WHEN** an agent completes an intermediate edit, commit or test run without review readiness, completion, failure, a blocker or a required decision
- **THEN** the default guidance does not direct a task comment for that event

#### Scenario: Review remains before completion

- **WHEN** implemented work passes relevant checks but required review remains
- **THEN** the guidance directs a short review-readiness comment with check results and the remaining review step
- **AND** it does not claim the task is complete

#### Scenario: A user decision is needed

- **WHEN** work cannot proceed without a user choice
- **THEN** the guidance directs a short comment explaining what is blocked and the choice needed
- **AND** it does not add an unchanged-files, unchanged-links or unrun-tests checklist unless a fact is material to that choice

#### Scenario: A child changes state

- **WHEN** a subtask finishes or a dependency changes without a separate request for a parent summary
- **THEN** default guidance does not direct an automatic parent comment or start or wake a parent agent
- **AND** child completion does not establish parent acceptance

### Requirement: Short readable outcome comments

Reporting guidance SHALL ask for a short plain-language result, relevant checks, material limits and any needed decision, with an existing detail link when useful. It MUST NOT impose a word target, fixed bullet count, heading template or filler checklist. Existing evidence guidance SHALL remain applicable, and unrun or blocked checks MUST NOT be presented as passed.

#### Scenario: A brief result is sufficient

- **WHEN** an outcome and its important limits can be stated in one sentence
- **THEN** the guidance allows that sentence without extra bullets or empty fields

#### Scenario: The outcome has important limits

- **WHEN** some required checks are unrun or blocked, or reported evidence has not been independently verified
- **THEN** the comment makes that material limit clear
- **AND** detailed evidence can remain in the linked thread or artifact

#### Scenario: A user posts a different format

- **WHEN** a user or agent submits a longer or differently formatted valid Markdown comment
- **THEN** the existing comment path accepts and renders it without new server-side format or length validation

## REMOVED Requirements

### Requirement: Short readable milestone comments

**Reason**: Intermediate milestone reporting, word targets and fixed bullet formats add unnecessary agent instructions and comments.

**Migration**: Use Comments only for useful outcomes and Short readable outcome comments. Preserve historical comments and the existing Markdown comment path.

### Requirement: Report at the task's level

**Reason**: Default epic/subtask summary duties load coordination instructions into ordinary task work. Detailed evidence and honest completion limits remain covered by the unchanged evidence requirements and the new outcome policy.

**Migration**: Remove automatic epic-summary instructions. Answer an explicitly requested parent summary using current state; do not infer parent acceptance from child counts or reported outcomes.

### Requirement: Refresh summaries at meaningful events

**Reason**: Automatic summary refresh duties are outside the quiet task workflow. Child changes and intermediate milestones must not create default reporting work.

**Migration**: Remove the event-driven parent-refresh instruction. Read current state only for the requested work or summary. Preserve existing notification targeting and do not add polling, wakeups or new coordination behavior.
