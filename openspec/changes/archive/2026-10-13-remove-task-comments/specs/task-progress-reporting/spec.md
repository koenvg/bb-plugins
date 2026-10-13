# Spec Delta

## MODIFIED Requirements

### Requirement: Consistent guidance at both agent entry points
The bundled Tasks skill and initial delegated-worker guidance SHALL communicate the same short outcome policy. Reports of review readiness, completion, failure, blockers or required decisions SHALL use the linked work thread, not task comments. The policy SHALL preserve check outcomes, material limits and status gates without a new reporting command, task timeline or orchestration run.

#### Scenario: Delegated worker receives the rules
- **WHEN** a task is delegated with a preset
- **THEN** its starting prompt includes the short outcome policy with task requirements, blockers, task artifact references and status responsibilities
- **AND** it contains no task comment posting procedure or automatic epic-summary duty

#### Scenario: Agent works through the Tasks skill
- **WHEN** an agent loads the bundled skill for explicitly assigned task work
- **THEN** it receives the same outcome conditions and status gates without starting another worker or posting a task comment

### Requirement: Keep evidence separate without hiding limits
Guidance SHALL keep detailed investigation, logs, file lists, full commit hashes, internal identifiers and handoff evidence in the linked thread or an artifact. Outcome reports SHALL state relevant checks, material risks and needed decisions, with supported task, thread, PR or attachment references when useful. Guidance SHALL distinguish reported from independently verified evidence and SHALL NOT imply that unrun or blocked checks passed.

#### Scenario: Completion report has extensive evidence
- **WHEN** a worker has detailed test output and an integration handoff
- **THEN** its linked-thread report summarizes the outcome and limits and points to detailed evidence without a duplicate task comment

#### Scenario: Work requires a user decision
- **WHEN** progress is blocked on a user choice
- **THEN** the linked-thread report states what is blocked, the exact choice needed and its effect in plain language
- **AND** technical background is available through a reference rather than replacing the question

### Requirement: Preserve existing task behavior and history
Reporting guidance SHALL preserve task statuses, dependency behavior and task/thread lifecycle independence. It SHALL NOT change stored presets, task descriptions or previously delivered prompts, or authorize dispatch, notification or acceptance. Native thread history SHALL remain intact. Task comments and comment notification targeting SHALL be unavailable, with no server-side reporting validator or automatic summarizer replacing them.

#### Scenario: A user posts a long comment
- **WHEN** a user sends a long native thread message
- **THEN** normal thread handling applies without new task-report length restrictions or automatic rewriting

#### Scenario: The plugin guidance is updated
- **WHEN** a new worker receives updated instructions
- **THEN** it uses thread reporting while existing native history and previously delivered prompts remain unchanged

#### Scenario: A parent needs notification
- **WHEN** an agent considers notifying someone about an update
- **THEN** reporting guidance does not grant new notification authority or claim guaranteed delivery to a parent coordinator
- **AND** it offers no comment notification command

### Requirement: Reports only for useful outcomes
Default task-work guidance SHALL NOT recommend or require a task comment for any event. It SHALL direct useful outcome reports to the linked work thread and SHALL NOT add automatic parent-summary refresh duties, polling, wakeups or notification authority. Review readiness SHALL NOT establish completion, and child completion SHALL NOT establish parent acceptance.

#### Scenario: Work continues without a useful outcome
- **WHEN** an agent completes an intermediate edit, commit or test run without review readiness, completion, failure, a blocker or a required decision
- **THEN** default guidance requires no task comment or separate administrative report

#### Scenario: Review remains before completion
- **WHEN** implementation passes relevant checks but required review remains
- **THEN** guidance directs a short linked-thread review-readiness report with checks and the remaining review step
- **AND** it does not claim completion

#### Scenario: A user decision is needed
- **WHEN** work cannot proceed without a user choice
- **THEN** guidance directs a short thread report explaining the blocker and choice
- **AND** it adds no unchanged-files, unchanged-links or unrun-tests checklist unless material

#### Scenario: A child changes state
- **WHEN** a subtask finishes or a dependency changes without a separate request for a parent summary
- **THEN** default guidance requires no automatic parent report or parent-agent start or wake
- **AND** child completion does not establish parent acceptance

### Requirement: Short readable outcome reports
Reporting guidance SHALL ask for short plain-language thread outcomes, relevant checks, material limits, needed decisions and useful detail links. It SHALL NOT direct task comment posting or impose word targets, fixed bullet counts, heading templates or filler checklists. Unrun or blocked checks SHALL NOT be presented as passed.

#### Scenario: A brief result is sufficient
- **WHEN** an outcome and its limits fit in one sentence
- **THEN** guidance allows that thread report without extra bullets or empty fields

#### Scenario: The outcome has important limits
- **WHEN** checks are unrun or blocked or reported evidence is not independently verified
- **THEN** the thread report states that material limit
- **AND** detailed evidence can remain in a linked thread or artifact

#### Scenario: A user posts a different format
- **WHEN** a user or agent sends a longer or differently formatted native thread report
- **THEN** normal thread handling applies without new format or length validation

## RENAMED Requirements

- FROM: `### Requirement: Comments only for useful outcomes`
- TO: `### Requirement: Reports only for useful outcomes`
- FROM: `### Requirement: Short readable outcome comments`
- TO: `### Requirement: Short readable outcome reports`
