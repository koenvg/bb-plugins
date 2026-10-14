# Code Cleanup Guidance Specification

## Purpose

Give agents project-selected guidance to report substantial cleanup discovered beside their current work to the user, without distracting them with minor nits or leaving guidance active after the plugin is disabled.

## Requirements

### Requirement: Project-scoped guidance

The Code Cleanup plugin SHALL contribute cleanup instructions only to newly constructed agent sessions for standard BB projects whose effective enabled state is true. An explicit project choice SHALL take precedence over the saved default; projects without an explicit choice SHALL follow that default. The default SHALL initially be disabled. The plugin SHALL contribute nothing for personal or projectless contexts or side chats. Changing one project's explicit choice SHALL NOT change another project's saved choice or prompt.

#### Scenario: Enabled project

- **WHEN** a fresh agent session starts for a standard project with Code Cleanup effectively enabled
- **THEN** that session receives the project's cleanup guidance exactly once

#### Scenario: Other project or side chat

- **WHEN** a fresh agent session starts for an effectively disabled project, a personal or projectless context, or a side chat
- **THEN** it receives no Code Cleanup guidance

#### Scenario: New project follows enabled default

- **WHEN** the saved default is enabled and a fresh session starts for a new standard project without an explicit choice
- **THEN** that session receives the factory guidance unless the project has a custom prompt

#### Scenario: Explicit disable takes precedence

- **WHEN** the saved default is enabled but a standard project is explicitly disabled
- **THEN** a fresh session for that project receives no Code Cleanup guidance

### Requirement: Agent-judged follow-ups

The default guidance SHALL tell the agent to notice substantial, actionable cleanup in files it edits or adjacent code it reads, record a separate follow-up task when warranted, and stay focused on the current task. It SHALL explicitly exclude minor style preferences and trivial nits and direct the agent not to perform unrelated cleanup or dispatch workers. The plugin itself SHALL NOT inspect source code or create tasks automatically; task creation SHALL remain an agent action based on the guidance.

#### Scenario: Substantial adjacent cleanup

- **WHEN** an agent finds a separate, worthwhile cleanup issue while carrying out an existing task
- **THEN** the guidance directs the agent to judge whether to record it as a follow-up task rather than perform unrelated cleanup in the current task

#### Scenario: Minor nit

- **WHEN** the only finding is a trivial formatting or style preference
- **THEN** the guidance directs the agent not to record a cleanup task for it

### Requirement: Report follow-up candidates

The default guidance SHALL direct the agent to record a worthwhile follow-up through the installed `bb tasks` CLI and report the confirmed task key to the user. The guidance SHALL require a single task tracker linked to the current BB project, an open-task duplicate check with complete search pagination, and an actionable title and description containing the location, problem, desired outcome, completion criteria, and known source task or thread. It SHALL direct the agent to reuse a matching open task, use labels only when they already exist, and add a blocker only for a known required prerequisite. It SHALL NOT use OpenForge commands or unsupported task flags, invent task keys, dispatch workers, change the current task's status, or claim success after a failed command. When recording is unavailable or fails, it SHALL direct the agent to report the candidate and the specific limit to the user.

#### Scenario: Substantial cleanup worth reporting

- **WHEN** the agent judges that a substantial follow-up is warranted and a single linked tracker is available
- **THEN** the guidance asks it to check for an existing open task and create an actionable task only if no matching task exists
- **AND** it directs the agent to report the confirmed existing or new key and continue the assigned work

#### Scenario: Matching open task

- **WHEN** the agent finds an existing open task covering the same cleanup
- **THEN** the guidance directs it to reuse that task and not create a duplicate

#### Scenario: Missing or ambiguous tracker

- **WHEN** the task CLI is unavailable or no single tracker is linked to the current BB project
- **THEN** the guidance directs the agent to report the candidate and ask for a linked tracker or available CLI
- **AND** it prohibits filing the task in another project's tracker or automatically provisioning a tracker

#### Scenario: Required prerequisite

- **WHEN** a cleanup task must wait for the current task or another known prerequisite
- **THEN** the guidance directs the agent to add that prerequisite as a blocker using its verified task key
- **AND** a failed dependency write is reported as a limit rather than complete recording

#### Scenario: Recording fails

- **WHEN** the create command fails or returns no confirmed task key
- **THEN** the guidance directs the agent to report the candidate and error without claiming that a task was created

### Requirement: Project configuration and overrides

A user SHALL be able to enable or disable Code Cleanup separately for each standard project, return a project to the saved default, view its effective state and source, replace its factory guidance with a nonblank project-specific instruction, and restore the factory prompt. Prompt reset SHALL NOT reset enablement, and enablement reset SHALL NOT remove custom text. Project choices and overrides SHALL persist across plugin reloads and global disable/re-enable without changing another project's saved choices. Invalid custom instructions, including whitespace-only text and text longer than 4,096 characters, SHALL be rejected without changing the saved value. Valid custom text SHALL be preserved exactly and SHALL replace, not append to, the factory prompt.

#### Scenario: Independent project choices

- **WHEN** the user enables a project and customizes its guidance
- **THEN** only that project uses the custom guidance
- **AND** other projects retain their saved explicit choices or continue to follow the default

#### Scenario: Disable and re-enable a project

- **WHEN** the user disables and later re-enables a project
- **THEN** fresh sessions omit guidance while it is disabled and use its saved custom guidance once it is re-enabled

#### Scenario: Invalid replacement

- **WHEN** the user submits an empty, whitespace-only, or over-limit custom instruction
- **THEN** the change is rejected and the previous project configuration remains effective

#### Scenario: Prompt-only edit on an inherited project

- **WHEN** a project follows the default and the user saves or resets its custom prompt
- **THEN** it continues to follow the default and no explicit enablement choice is introduced

#### Scenario: Return to the default

- **WHEN** the user removes a project's explicit enablement choice
- **THEN** that project immediately follows the current saved default
- **AND** its custom prompt remains unchanged

### Requirement: Plugin lifecycle boundaries

When the BB plugin is globally disabled or uninstalled, it SHALL stop contributing instructions to newly constructed sessions. Reloading the plugin SHALL NOT duplicate instructions. Existing running provider sessions MAY retain their earlier instructions until BB constructs a new session; the plugin's documentation SHALL explain this limit and BB's lack of a native per-project plugin enable switch.

#### Scenario: Disable plugin globally

- **WHEN** the BB Code Cleanup plugin is disabled and a new agent session starts
- **THEN** that session receives no Code Cleanup guidance from the plugin

#### Scenario: Reload enabled plugin

- **WHEN** the plugin is reloaded and a new session starts in an enabled project
- **THEN** that session receives exactly one Code Cleanup contribution

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

### Requirement: Preserve saved configuration on upgrade

Upgrading Code Cleanup SHALL preserve each existing project's effective enablement and exact custom prompt. Existing enabled and disabled states SHALL become explicit choices, including disabled rows that were created by saving a prompt. The new default SHALL initially be disabled. Migration SHALL be repeat-safe and SHALL NOT rewrite saved custom text to the new factory task-creation guidance.

#### Scenario: Existing configured project

- **WHEN** a project with a saved enabled state and multiline custom prompt is upgraded
- **THEN** it remains explicitly enabled and its exact prompt text is unchanged

#### Scenario: Existing disabled project

- **WHEN** a project with saved disabled state or a prompt-only disabled row is upgraded and the user later enables the default
- **THEN** that project remains explicitly disabled and retains its custom text

#### Scenario: Repeated plugin reload

- **WHEN** the upgraded plugin reloads more than once
- **THEN** saved explicit choices, inherited states, and prompt text are not migrated again or changed

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
