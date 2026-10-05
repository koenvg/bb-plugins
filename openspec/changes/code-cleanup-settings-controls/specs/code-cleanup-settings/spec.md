## Purpose

Make Code Cleanup configuration visible and editable in BB Settings, without losing existing project choices or custom prompts. Let users control the default for unconfigured projects and inspect the effective choice for each project.

## ADDED Requirements

### Requirement: Discoverable Settings controls

An enabled, running Code Cleanup plugin SHALL appear in the BB Settings sidebar and expose its configuration on its plugin detail page. The page SHALL contain a default-enable control, an explicit standard-project selector, a project enable control, and a prompt editor with Save and Reset controls. These controls SHALL remain usable by keyboard and on compact viewports.

#### Scenario: Open Code Cleanup Settings

- **WHEN** the user selects Code Cleanup in Settings while the plugin is running
- **THEN** the page shows the default-enable control and project-specific controls without requiring CLI commands

#### Scenario: Compact or keyboard use

- **WHEN** the page is used at a compact viewport or without a pointing device
- **THEN** the project selector, switches, prompt editor, and actions remain reachable and have accessible names
- **AND** the editor and explanatory text fit the page without horizontal scrolling

### Requirement: Default enablement control

The Settings default-enable control SHALL change the effective enablement of standard projects that follow the default, including future projects. Its initial saved value SHALL be disabled unless the user changes it. The control SHALL explain that explicit project choices are not overwritten and SHALL distinguish this default from the BB plugin's global enable switch.

#### Scenario: Enable unconfigured projects

- **WHEN** the user enables the default and a standard project has no explicit enablement choice
- **THEN** the Settings page shows that project as enabled by the default
- **AND** a newly constructed eligible agent session receives cleanup guidance

#### Scenario: Disable the default without changing project overrides

- **WHEN** the user disables the default while one project is explicitly enabled and another follows the default
- **THEN** the explicit project remains enabled and the following project becomes disabled
- **AND** both projects retain their saved custom prompts

#### Scenario: Fresh installation

- **WHEN** Code Cleanup is installed without any previous configuration
- **THEN** its default-enable control is disabled and unconfigured projects receive no guidance

### Requirement: Project selection and enablement overrides

The Settings page SHALL list only standard BB projects and SHALL require a selected project before enabling project writes. It SHALL show the selected project's effective enabled state and whether that state comes from the default or an explicit choice. Changing the project enable control SHALL save an explicit choice. A Use default action SHALL remove only that project's enablement override. Selection alone SHALL NOT change saved configuration.

#### Scenario: Inspect an existing project

- **WHEN** the user selects a standard project that has an explicit enabled choice and a custom prompt
- **THEN** the page shows that choice and the exact stored custom text
- **AND** selecting the project writes nothing

#### Scenario: Override the default

- **WHEN** the default is enabled and the user disables the selected project
- **THEN** that project becomes explicitly disabled and remains disabled across later default changes
- **AND** its custom prompt is preserved

#### Scenario: Return a project to the default

- **WHEN** the user selects Use default for a project with an explicit choice
- **THEN** the page shows its state as following the current default
- **AND** the action leaves its prompt unchanged

#### Scenario: No standard projects

- **WHEN** there are no standard BB projects
- **THEN** the page shows an empty-project explanation and disables project-specific writes
- **AND** the default-enable control remains available

### Requirement: Prompt editing and reset

The selected project's editor SHALL display its custom prompt when one exists and otherwise the factory prompt for that project. The page SHALL show whether the saved source is Custom or Plugin default. Save SHALL preserve the submitted custom text exactly. The server SHALL reject whitespace-only prompts and prompts longer than 4,096 characters without changing saved state. Reset SHALL remove the custom prompt and display the factory task-creation prompt without changing enablement. Prompts SHALL remain editable while a project is disabled.

#### Scenario: Save a valid multiline prompt

- **WHEN** the user saves a nonblank multiline prompt of at most 4,096 characters
- **THEN** the exact submitted text becomes that project's custom prompt
- **AND** the page reports success only after the server confirms persistence

#### Scenario: Invalid prompt

- **WHEN** a caller submits a blank, whitespace-only, or oversized prompt
- **THEN** the server rejects the write and retains the previous prompt and enablement
- **AND** the UI keeps the user's draft and explains the error

#### Scenario: Reset a custom prompt

- **WHEN** the user confirms Reset for a project with a saved custom prompt
- **THEN** the custom prompt is removed and the editor shows the factory task-creation prompt
- **AND** the project's explicit or default-based enablement remains unchanged

#### Scenario: Save while disabled

- **WHEN** the user saves valid custom text for a disabled project
- **THEN** the text is stored without enabling the project
- **AND** enabling it later uses that saved text

### Requirement: Safe editing and concurrent changes

The page SHALL keep prompt drafts separate from saved state. Changing projects or resetting a prompt SHALL NOT silently discard a dirty draft. A delayed read or save response SHALL NOT replace the state of a different selected project. Prompt Save and Reset SHALL reject a stale saved-prompt precondition rather than silently replace a newer prompt written elsewhere. External configuration changes SHALL refresh clean views and SHALL NOT overwrite dirty drafts.

#### Scenario: Change projects with a dirty draft

- **WHEN** the user selects another project while the prompt draft has unsaved changes
- **THEN** the page offers an explicit discard or cancel choice before changing selection
- **AND** cancel leaves the selected project and draft intact

#### Scenario: Late response for a previous project

- **WHEN** a response for project A arrives after the user selected project B
- **THEN** the page remains scoped to project B and does not display A's prompt or saved result as B's

#### Scenario: Concurrent prompt save

- **WHEN** another client or CLI command changes the saved prompt after the editor loaded it
- **THEN** saving or resetting against the old value fails as a conflict without modifying the newer prompt
- **AND** the page retains the draft and offers an explicit reload

#### Scenario: External change during editing

- **WHEN** a configuration-change notification arrives while the prompt is dirty
- **THEN** the page preserves the draft and indicates that saved state changed

### Requirement: Shared persistent configuration

Settings controls and CLI commands SHALL read and write the same project configuration. A successful Settings save SHALL be visible to subsequent CLI reads, and a successful CLI change SHALL become visible to an open clean Settings view. The default and project choices SHALL persist across plugin reload and global disable/re-enable. No separate copy of cleanup guidance SHALL be added to agent sessions by the UI.

#### Scenario: Settings write followed by CLI read

- **WHEN** the user saves project enablement or a custom prompt in Settings and then reads the project through the CLI
- **THEN** the CLI reports the same effective enablement and prompt source

#### Scenario: CLI write followed by Settings refresh

- **WHEN** a CLI command successfully changes a project while its Settings view has no dirty prompt
- **THEN** the page refreshes to show the new saved values

#### Scenario: Plugin reload

- **WHEN** the plugin reloads after a default, explicit project choice, and custom prompt have been saved
- **THEN** the page and newly constructed eligible sessions use those saved values
- **AND** each eligible session receives exactly one guidance contribution

### Requirement: Visible failures and mutation validation

The Settings page SHALL distinguish loading from disabled state, block writes before the selected project's state has loaded, and show retryable load and save failures. It SHALL prevent overlapping writes from its own controls. All project mutations SHALL validate that the selected ID names an existing standard project before saving. Invalid inputs or rejected writes SHALL NOT change configuration for another project.

#### Scenario: Load failure

- **WHEN** the project state cannot be loaded
- **THEN** the page shows an error and Retry action instead of treating unknown state as disabled
- **AND** project writes stay unavailable until a successful load

#### Scenario: Save failure

- **WHEN** a write fails
- **THEN** the page does not report success or clear a prompt draft
- **AND** it shows the failure and permits a safe retry after the pending request ends

#### Scenario: Invalid project target

- **WHEN** a caller attempts a write to an unknown, personal, or projectless target
- **THEN** the server rejects the write without changing any saved project configuration

### Requirement: Operational limits are visible

The page SHALL explain that guidance changes apply to newly constructed agent sessions, that the factory prompt records tasks through BB Tasks, and that task creation needs an available task CLI and a linked task tracker. Settings operations SHALL NOT create trackers or tasks, dispatch workers, or modify existing provider sessions.

#### Scenario: User edits guidance

- **WHEN** the user views or changes a project's guidance
- **THEN** the page states the new-session limit and the task-tracker requirement
- **AND** editing configuration alone creates no task, tracker, or worker
