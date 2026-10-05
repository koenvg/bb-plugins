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

The default guidance SHALL tell the agent to notice substantial, actionable cleanup in files it edits or adjacent code it reads, report a separate follow-up candidate to the user when warranted, and stay focused on the current task. It SHALL explicitly exclude minor style preferences and trivial nits. The plugin SHALL NOT create tasks automatically.

#### Scenario: Substantial adjacent cleanup

- **WHEN** an agent finds a separate, worthwhile cleanup issue while carrying out an existing task
- **THEN** the guidance directs the agent to judge whether to report it as a follow-up rather than perform unrelated cleanup in the current task

#### Scenario: Minor nit

- **WHEN** the only finding is a trivial formatting or style preference
- **THEN** the guidance directs the agent not to report a cleanup candidate for it

### Requirement: Report follow-up candidates

The default guidance SHALL direct the agent to report a worthwhile follow-up to the user with its location, problem, and desired outcome. It SHALL NOT direct the agent to use a task CLI or claim to have created a task.

#### Scenario: Substantial cleanup worth reporting

- **WHEN** the agent judges that a substantial follow-up is warranted
- **THEN** the guidance asks the agent to report an actionable candidate to the user without creating a task

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
