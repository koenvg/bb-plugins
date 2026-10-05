# Spec Delta

## Purpose

Help users understand current work from task comments, while keeping detailed evidence in subtasks, attached threads, and artifacts.

## ADDED Requirements

### Requirement: Consistent guidance at both agent entry points

The bundled Tasks skill and the initial report-back instructions supplied to delegated workers SHALL communicate the same reporting rules for comment format, evidence, meaningful milestones, and epic/subtask reporting. The rules SHALL apply to agents working through either entry point. They SHALL NOT require a new reporting command or an orchestration run.

#### Scenario: Delegated worker receives the rules

- **WHEN** a task is delegated with a preset
- **THEN** its starting prompt includes the reporting rules alongside the existing task context, blocker list, artifact instructions, and status responsibilities

#### Scenario: Agent works through the Tasks skill

- **WHEN** an agent reads the bundled Tasks skill to work on an existing task
- **THEN** it receives equivalent reporting guidance without needing to start another worker

### Requirement: Short readable milestone comments

The guidance SHALL direct agents to start a progress comment with one short result or current-state sentence, followed by a blank line and up to three Markdown bullets when supporting facts are needed. It SHALL set a normal target of 40-80 words, permit shorter sufficient updates, and prioritize disclosure of material blockers, decisions, and verification limits over that target. It SHALL require plain language, real newlines, and one idea per bullet rather than nested lists or a dense paragraph.

#### Scenario: Implementation is ready for review

- **WHEN** an agent reports implemented work with passing focused checks and required review still pending
- **THEN** the prescribed comment states readiness for review, briefly records the checks, and names review as the remaining step rather than claiming completion

#### Scenario: A brief update is sufficient

- **WHEN** a meaningful result can be explained in fewer than 40 words
- **THEN** the guidance permits that update without filler or empty checklist fields

### Requirement: Keep evidence separate without hiding limits

The guidance SHALL place detailed investigation, logs, file lists, full commit hashes, internal identifiers, and handoff evidence in the attached thread or an artifact. It SHALL keep relevant check outcomes and material risks visible in the task comment, and provide a useful reference when detail is omitted. References SHALL use existing supported task, thread, PR, or attachment destinations where available. The guidance SHALL distinguish reported evidence from independently verified results and SHALL NOT imply that unrun or blocked checks passed.

#### Scenario: Completion report has extensive evidence

- **WHEN** a worker has detailed test output and an integration handoff
- **THEN** the prescribed task comment summarizes the outcome and remaining limits, points to the detail, and preserves the full evidence outside the comment

#### Scenario: Work requires a user decision

- **WHEN** progress is blocked on a user choice
- **THEN** the prescribed comment states what is blocked, the exact choice needed, and its effect in plain language
- **AND** technical background is available through a reference rather than replacing the question

### Requirement: Report at the task's level

The guidance SHALL distinguish an epic summary from a subtask result and a thread record. An epic summary SHALL describe overall progress, current work, the next dependency or decision, and any material acceptance limit. A subtask update SHALL describe its own result, relevant checks, and remaining work. Threads and artifacts SHALL retain detailed execution evidence. Agents SHALL be told to summarize a child report's effect on the epic instead of copying the report. Reporting guidance SHALL NOT authorize creating or restructuring subtasks.

#### Scenario: A child finishes while other work remains

- **WHEN** an agent responsible for an epic handles a completed subtask report
- **THEN** the prescribed epic update summarizes what the completion enables and what work remains, while the child task retains its detailed result references

#### Scenario: All children are done but acceptance is pending

- **WHEN** all subtasks are marked done and whole-epic integration or acceptance remains unverified
- **THEN** the prescribed epic summary states that remaining work explicitly and does not treat the child count as proof of epic completion

### Requirement: Refresh summaries at meaningful events

The guidance SHALL direct the agent already responsible for a parent to read current task and relevant child state before posting a parent update when it handles a child completion, blocker change, decision, or other meaningful milestone. It SHALL require current counts and status claims to come from that read, with unavailable or conflicting information stated as such. Related changes SHALL be combined into one useful update. Repeated reports with no meaningful change and command-by-command progress pings SHALL be omitted.

#### Scenario: An old comment conflicts with current task state

- **WHEN** the parent agent handles a child result and an earlier comment still says review is pending, but current child state records completion
- **THEN** the next parent summary uses the current state and result rather than repeating the obsolete pending-review claim

#### Scenario: Current state cannot be read

- **WHEN** the agent cannot confirm current child state
- **THEN** the prescribed update identifies the uncertainty instead of inventing a current count, completion claim, or all-clear status

#### Scenario: There is no active parent agent

- **WHEN** a child changes state while no responsible parent agent is handling the event
- **THEN** this guidance does not start or wake an agent, add polling, or promise an immediate parent update

### Requirement: Preserve existing task behavior and history

The change SHALL remain agent instruction guidance, not server-side comment validation or automatic summarization. Existing comment content, Markdown support, task statuses, dependency behavior, notification targeting, and task/thread lifecycle independence SHALL remain unchanged. It SHALL NOT rewrite historical comments, change stored presets, edit task descriptions, or inject instructions into running threads. Receiving reporting guidance SHALL NOT authorize dispatch, notification, or acceptance actions that otherwise require approval.

#### Scenario: A user posts a long comment

- **WHEN** a user submits a comment outside the recommended agent format
- **THEN** the existing comment path accepts and renders it as before without a new length restriction or automatic rewrite

#### Scenario: The plugin guidance is updated

- **WHEN** a new worker receives the updated instructions
- **THEN** the new reporting rules are available to that worker while existing comments and previously delivered prompts remain unchanged

#### Scenario: A parent needs notification

- **WHEN** an agent considers notifying someone about an update
- **THEN** the reporting guidance preserves the existing meaning of notification commands and does not treat notification of the latest responding agent as guaranteed delivery to a parent coordinator
