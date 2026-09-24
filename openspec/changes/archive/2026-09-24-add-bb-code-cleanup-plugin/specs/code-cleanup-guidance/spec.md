# Spec Delta

## Purpose

Give agents project-selected guidance to log substantial cleanup discovered beside their current work as separate BB tasks, without distracting them with minor nits or leaving guidance active after the plugin is disabled.

## ADDED Requirements

### Requirement: Project-scoped guidance
The Code Cleanup plugin SHALL contribute cleanup instructions only to newly constructed agent sessions for standard BB projects explicitly enabled for this plugin. It SHALL contribute nothing for other projects, personal or projectless contexts, or side chats. Enabling one project SHALL NOT enable another.

#### Scenario: Enabled project
- **WHEN** a fresh agent session starts for a standard project with Code Cleanup enabled
- **THEN** that session receives the project's cleanup guidance exactly once

#### Scenario: Other project or side chat
- **WHEN** a fresh agent session starts for an unconfigured or disabled project, a personal or projectless context, or a side chat
- **THEN** it receives no Code Cleanup guidance

### Requirement: Agent-judged follow-up tasks
The default guidance SHALL tell the agent to notice substantial, actionable cleanup in files it edits or adjacent code it reads, create a separate follow-up task when warranted, and stay focused on the current task. It SHALL explicitly exclude minor style preferences and trivial nits. The plugin SHALL NOT create tasks automatically.

#### Scenario: Substantial adjacent cleanup
- **WHEN** an agent finds a separate, worthwhile cleanup issue while carrying out an existing task
- **THEN** the guidance directs the agent to judge whether to record it as a follow-up rather than perform unrelated cleanup in the current task

#### Scenario: Minor nit
- **WHEN** the only finding is a trivial formatting or style preference
- **THEN** the guidance directs the agent not to open a cleanup task for it

### Requirement: BB task-board instructions
The default guidance SHALL use the installed BB task-board command and the current project's ID when describing how to create a follow-up task. It SHALL NOT refer to OpenForge commands, fabricate a cleanup-specific task command, or direct the agent to create a task when the task-board command is unavailable. It SHALL ask the agent to check for an existing matching task before creating a new one and to write an actionable task prompt.

#### Scenario: Task board available
- **WHEN** the agent judges that a substantive, nonduplicate follow-up is warranted and `bb task-board` is available
- **THEN** the guidance names `bb task-board add --project <project-id> --prompt <actionable-text>` as the task-creation command

#### Scenario: Task board unavailable
- **WHEN** `bb task-board` is unavailable to the agent
- **THEN** the guidance tells the agent to report the candidate follow-up to the user instead of claiming to have created a task

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
