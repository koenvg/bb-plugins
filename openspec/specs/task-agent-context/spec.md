# task-agent-context Specification

## Purpose

Provide small, intent-specific task context to agents while preserving full task requirements and on-demand access to current state and operation guidance.

## Requirements

### Requirement: Small ordinary delegation guidance

Ordinary delegated workers SHALL receive a short task-work instruction covering assigned scope, relevant checks, review/completion gates and retained task/thread links. The instruction MUST NOT require intermediate milestone comments, automatic parent summaries, native reporting, private report contexts or returned report IDs.

#### Scenario: User delegates ordinary task work

- **WHEN** a user delegates a task using an existing preset
- **THEN** the worker receives the short task-work instruction
- **AND** ordinary guidance contains none of the excluded reporting or orchestration duties
- **AND** execution selection, task attachment and the existing status transition behave as before

### Requirement: Preserve delegated task requirements

Delegation SHALL preserve the task description, project identity, blocker list, subtasks, task/comment attachment references, preset instructions and explicit per-dispatch instructions. Shorter plugin guidance MUST NOT truncate those requirements or weaken existing blocker, status or thread-link rules.

#### Scenario: Description and instructions contain important restrictions

- **WHEN** a task description, preset or per-dispatch instruction contains explicit scope restrictions and completion criteria
- **THEN** the generated worker prompt preserves that content
- **AND** the authored-context budget does not truncate it

#### Scenario: Blocked task is deliberately delegated

- **WHEN** the existing delegation path accepts a task with blockers
- **THEN** the worker prompt still lists each blocker with its key, title and status
- **AND** existing confirmation and task-work approval requirements remain unchanged

#### Scenario: An attachment belongs to an old comment

- **WHEN** a relevant stored attachment belongs to a comment outside the previous five-comment window
- **THEN** the delegated attachment manifest still includes its reference
- **AND** omitting comment bodies does not remove the file or change its owner

### Requirement: No automatic comment history in delegation

Delegation SHALL omit recent comment bodies and any Recent comments section from the initial worker prompt. It MUST NOT insert a default summary of those comments. Stored comments SHALL remain available through existing task reads when relevant to the requested work.

#### Scenario: Large or obsolete comments exist

- **WHEN** a task has long comments or old permission discussions
- **THEN** automatic delegation does not include their bodies or a synthesized history summary
- **AND** a later task read can retrieve the original comments

### Requirement: Lightweight neutral task mentions

Resolving a task mention SHALL provide the task key, title, full description and a neutral pointer to read current details. It MUST NOT automatically include properties, subtasks, attachment manifests, comment history or linked-thread state. The plugin-authored wrapper MUST NOT direct attaching, implementation, commenting, dispatch or status changes.

#### Scenario: Task is mentioned as context for a question

- **WHEN** a user resolves a task mention for a read-only question
- **THEN** its context contains the task identity and description
- **AND** it contains no plugin-authored action contract or automatic state dump

#### Scenario: Task description contains its own references

- **WHEN** the stored description includes a task link, explicit restriction or attachment reference
- **THEN** mention resolution preserves that description content rather than removing it to satisfy a wrapper budget

#### Scenario: Mention cannot be resolved

- **WHEN** a task mention names an unknown task
- **THEN** resolution reports the existing unknown-task error instead of inventing task content

### Requirement: Mention search and task links stay available

Task mentions SHALL remain searchable by task key and title with current-project ranking preserved. Task pills, portable Markdown task links and task-card rendering SHALL keep their existing navigation behavior.

#### Scenario: Search from a linked project

- **WHEN** a user searches for a task in the composer
- **THEN** matching tasks remain available and tasks linked to the current BB project retain their existing ranking preference

#### Scenario: Open a task reference

- **WHEN** a user opens an existing task pill, Markdown link or task card
- **THEN** it navigates to the same task without creating work or changing status

### Requirement: Intent-specific Tasks skill guidance

The Tasks skill description and entry guidance SHALL distinguish task references and read-only requests from assigned task work. Referencing a key alone MUST NOT be described as authorization to attach a thread, implement, report or change status. Detailed operation references SHALL be required only for the requested operation, not for every task request.

#### Scenario: User asks about a task

- **WHEN** an agent loads the Tasks skill to answer a read-only task question
- **THEN** its entry guidance directs only the reads needed for that question
- **AND** it does not instruct task-work mutations or loading all administration references

#### Scenario: User explicitly assigns task work

- **WHEN** the user assigns implementation of a task
- **THEN** the skill directs reading current requirements and blockers before acting
- **AND** relevant attachment, status and link-retention requirements still apply

#### Scenario: User requests an administrative operation

- **WHEN** the user requests task creation, dependency management, attachment handling, delegation or a comment
- **THEN** the skill identifies the reference for that operation without requiring unrelated procedures

### Requirement: Existing task details remain readable on demand

The existing task CLI SHALL retain access to current task properties, blockers, subtasks, comments, attachments and linked threads. A neutral mention or short skill MUST NOT hide read failures or substitute old comments for current verified state. Reading details MUST NOT itself dispatch, notify or change task status.

#### Scenario: Agent needs comment evidence

- **WHEN** an agent requests current task details for a relevant clarification or review response
- **THEN** the existing reads return stored comments and references
- **AND** no worker is resumed and task status remains unchanged

#### Scenario: Current details cannot be read

- **WHEN** a current-state read fails
- **THEN** the guidance requires reporting that limit rather than asserting current blockers or completion from assumed state

### Requirement: Regression budgets for authored context

Delegated report-back guidance SHALL use at most 120 whitespace-delimited words, the Tasks skill body at most 250, and the mention wrapper at most 60. The skill-body count SHALL exclude YAML frontmatter; dynamic task content and user preset/extra instructions SHALL be excluded from authored-wrapper counts. Context budgets MUST NOT truncate user content.

#### Scenario: Fixed-fixture context measurement

- **WHEN** generated delegation, mention context and the skill entry body are measured using fixed task fixtures
- **THEN** each authored portion stays within its budget
- **AND** total fixture output is reported separately from authored-word counts

#### Scenario: User content exceeds an authored budget

- **WHEN** a task description or explicit user instruction exceeds the authored-context budget
- **THEN** it remains available in full in the applicable prompt
- **AND** the measurement identifies it as user content, not an exception permitting more plugin-authored guidance

### Requirement: Context changes preserve data and unrelated configuration

The context reduction SHALL leave stored descriptions, comments, presets, attachments and thread links unchanged. It SHALL apply to newly produced context and newly loaded guidance, not rewrite previously delivered prompts or active provider sessions. Code Cleanup configuration and orchestration runtime changes SHALL remain outside this capability change.

#### Scenario: Guidance is updated

- **WHEN** a new task context is produced after the plugin source update
- **THEN** it uses the reduced guidance
- **AND** existing records, custom cleanup prompts and previously delivered prompts remain unchanged
