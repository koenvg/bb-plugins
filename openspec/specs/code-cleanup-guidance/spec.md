# Code Cleanup Guidance Specification

## Purpose

Give agents project-selected guidance to report substantial cleanup discovered beside their current work to the user, without distracting them with minor nits or leaving guidance active after the plugin is disabled.

## Requirements

### Requirement: Project-scoped guidance

The Code Cleanup plugin SHALL contribute cleanup instructions only to newly constructed agent sessions for standard BB projects explicitly enabled for this plugin. It SHALL contribute nothing for other projects, personal or projectless contexts, or side chats. Enabling one project SHALL NOT enable another.

#### Scenario: Enabled project

- **WHEN** a fresh agent session starts for a standard project with Code Cleanup enabled
- **THEN** that session receives the project's cleanup guidance exactly once

#### Scenario: Other project or side chat

- **WHEN** a fresh agent session starts for an unconfigured or disabled project, a personal or projectless context, or a side chat
- **THEN** it receives no Code Cleanup guidance

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

A user SHALL be able to enable or disable Code Cleanup separately for each standard project, view its effective state, replace its default guidance with a nonblank project-specific instruction, and restore the default. Project choices and overrides SHALL persist across plugin reloads and global disable/re-enable without affecting other projects. Invalid or oversized custom instructions SHALL be rejected without changing the saved value.

#### Scenario: Independent project choices

- **WHEN** the user enables a project and customizes its guidance
- **THEN** only that project uses the custom guidance, while unconfigured projects remain disabled

#### Scenario: Disable and re-enable a project

- **WHEN** the user disables and later re-enables a project
- **THEN** fresh sessions omit guidance while it is disabled and use its saved custom guidance once it is re-enabled

#### Scenario: Invalid replacement

- **WHEN** the user submits an empty or over-limit custom instruction
- **THEN** the change is rejected and the previous project configuration remains effective

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
