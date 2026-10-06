## Purpose

Let users see Code Cleanup enablement and saved prompt sources across standard BB projects, change enablement in place, and safely edit one project's prompt in a dialog.

## ADDED Requirements

### Requirement: Cross-project settings overview

The Settings page SHALL show a project table below the existing default-enable control, replacing the project dropdown and inline prompt editor. It SHALL list all standard projects by name and show effective On/Off, Default or Project override as the enablement source, Custom or Plugin default as the saved prompt source, and an Edit prompt action. Reading the overview SHALL NOT write configuration.

#### Scenario: Mixed saved choices

- **WHEN** the overview loads projects with explicit and inherited choices, including a disabled project with custom text
- **THEN** every standard project appears with its resolved enablement and both saved sources
- **AND** the disabled project's prompt source remains Custom

#### Scenario: No standard projects

- **WHEN** no standard projects exist
- **THEN** the page shows an empty-project explanation and no project mutation controls
- **AND** the default-enable control remains available

### Requirement: Direct row enablement

Each loaded row SHALL provide an accessible switch that saves an explicit enabled or disabled choice for that project. Use default SHALL remove only its enablement override and be unavailable when already inherited. These actions SHALL preserve all prompt text and other projects' saved choices.

#### Scenario: Toggle a project

- **WHEN** the user changes a loaded project's switch
- **THEN** the confirmed row shows the new effective state and Project override
- **AND** its saved prompt and other projects' settings remain unchanged

#### Scenario: Return to default

- **WHEN** the user selects Use default for a project with an override
- **THEN** the confirmed row follows the current default and shows Default as its enablement source
- **AND** its saved prompt source and text remain unchanged

### Requirement: Confirmed row persistence

The overview SHALL report a row change as saved only after persistence succeeds. It SHALL prevent overlapping mutations from its own controls and identify the pending row. Failed writes SHALL retain the last confirmed settings, show a project-specific error, and allow manual retry. Unknown state SHALL NOT be represented as Off.

#### Scenario: Pending or failed toggle

- **WHEN** a row write is pending and then fails
- **THEN** the row shows saving feedback while pending and an error after failure
- **AND** no success is reported and the last confirmed state is retained for retry

#### Scenario: Overview load failure

- **WHEN** the initial summary read fails
- **THEN** the page shows a load error and Retry action without presenting unknown switches as Off
- **AND** project mutations remain unavailable until a successful read

### Requirement: Project-bound prompt dialog

Edit prompt SHALL open a modal dialog for that row's project without changing saved settings. The dialog SHALL show the project name, saved prompt source, effective source text, character count, Edit and Preview views, Reset to plugin default, Cancel, Save, and a close control. It SHALL allow prompt editing for disabled projects. The table behind it SHALL remain visible but inactive.

#### Scenario: Open a disabled project's prompt

- **WHEN** the user selects Edit prompt for a disabled project
- **THEN** the dialog shows that project's custom text or factory text and saved source
- **AND** opening the dialog neither enables the project nor writes its prompt

#### Scenario: Preview a draft

- **WHEN** the user edits the prompt and selects Preview
- **THEN** Preview renders the draft using the existing Markdown behavior
- **AND** returning to Edit retains the exact source text

### Requirement: Prompt Save

Save SHALL be unavailable for unchanged drafts or while a write is pending. A valid Save SHALL preserve exact nonblank source text of at most 4,096 JavaScript string characters and use the loaded saved-prompt precondition. Confirmed Save SHALL close the dialog and update the row's saved prompt source. Invalid, failed, or conflicting saves SHALL leave the dialog and draft open without overwriting saved text.

#### Scenario: Successful custom save

- **WHEN** the user saves a valid changed multiline prompt and persistence succeeds
- **THEN** its exact source is saved, the dialog closes, and the row shows Custom
- **AND** enablement and other projects remain unchanged

#### Scenario: Invalid draft

- **WHEN** the user attempts to save blank, whitespace-only, or oversized text
- **THEN** no saved prompt changes
- **AND** the dialog retains the draft and shows the validation error

#### Scenario: Concurrent replacement or failed save

- **WHEN** another client changed the saved prompt after loading, or the Save request fails
- **THEN** the dialog stays open with the draft and a conflict or failure message
- **AND** a conflicting request does not replace the newer saved prompt

### Requirement: Safe dialog dismissal

Cancel, the close control, and Escape SHALL close a clean dialog without writes. When the draft has unsaved changes, these actions SHALL show a discard confirmation inside the same dialog. Keep editing SHALL preserve the draft and resume editing; confirmed discard SHALL close without saving it. Dialog dismissal SHALL be blocked while persistence is pending.

#### Scenario: Cancel a dirty dialog

- **WHEN** the user selects Cancel after changing the prompt
- **THEN** the dialog asks whether to discard the unsaved draft
- **AND** Keep editing returns to that draft without changing saved settings

#### Scenario: Escape or close control

- **WHEN** the user presses Escape or selects the close control
- **THEN** a clean dialog closes and a dirty dialog uses the same discard confirmation
- **AND** neither action silently discards changed text

#### Scenario: Discard confirmed

- **WHEN** the user confirms discard
- **THEN** the dialog closes and the saved prompt source in the table remains unchanged

### Requirement: Confirmed prompt Reset

Reset SHALL ask for confirmation inside the prompt dialog before removing custom text or a dirty draft. A confirmed Reset SHALL immediately persist removal using the loaded saved-prompt precondition, keep the dialog open on the factory prompt, and update the table's saved source. Failed or conflicting Reset SHALL keep the prior draft and saved text. Reset SHALL NOT change enablement.

#### Scenario: Reset saved custom text

- **WHEN** the user confirms Reset and persistence succeeds
- **THEN** the dialog displays factory text with Plugin default as its saved source
- **AND** the table shows Plugin default and enablement remains unchanged

#### Scenario: Cancel or fail Reset

- **WHEN** the user cancels Reset, or its write fails or conflicts
- **THEN** the dialog stays open and retains the draft
- **AND** no newer saved prompt is overwritten

### Requirement: External changes and response isolation

Configuration notifications and reconnect SHALL refresh the overview and clean dialog. Refresh SHALL preserve dirty drafts and stale-prompt protection. Responses SHALL remain bound to the project and dialog instance that requested them and SHALL NOT reopen a closed dialog or populate a different one. Failed refresh SHALL retain useful saved content, visibly mark it as not current, and offer retry.

#### Scenario: Default change

- **WHEN** the saved default changes and the overview refreshes
- **THEN** inherited rows show the new effective state
- **AND** explicit choices and all saved prompt sources remain unchanged

#### Scenario: CLI change during editing

- **WHEN** the CLI changes a prompt while its dialog has unsaved edits
- **THEN** the overview reflects the saved prompt source and the dialog retains its draft
- **AND** the dialog indicates the external change and offers explicit reload with draft-discard confirmation

#### Scenario: Late dialog response

- **WHEN** a response for project A arrives after its dialog closes or a dialog for project B opens
- **THEN** it does not reopen A's dialog or replace B's text or saved feedback

#### Scenario: Refresh failure

- **WHEN** a refresh fails after the overview loaded successfully
- **THEN** the last confirmed rows stay visible with a stale-state error and retry action
- **AND** unknown current state is not shown as a new confirmed value

### Requirement: Accessible and compact interaction

The table and dialog SHALL have accessible project-specific controls and visible keyboard focus. The modal SHALL contain focus, have an accessible title, and return focus to its Edit prompt trigger on close. Confirmation SHALL focus the safe action. Compact layouts SHALL keep labels, switches, editor, and actions usable without horizontal page scrolling or clipped dialog actions.

#### Scenario: Keyboard-only editing

- **WHEN** the user opens, edits, confirms, and closes a prompt dialog using the keyboard
- **THEN** focus stays inside the modal while open and returns to the row's Edit prompt action when closed
- **AND** confirmation starts on Keep editing or the Reset-cancel action

#### Scenario: Compact viewport

- **WHEN** the page is used on a compact viewport
- **THEN** project fields form labelled stacked rows and the dialog fits the viewport
- **AND** long project names and prompt text do not hide its actions

### Requirement: Settings boundaries remain visible

The overview and prompt dialog SHALL state that changes apply to new agent sessions only. Existing task-recording help SHALL remain available. Overview reads and edits SHALL NOT create tasks, trackers, or workers, alter the factory guidance, change the global plugin switch, or modify existing provider sessions.

#### Scenario: Settings-only operation

- **WHEN** the user views the overview, changes enablement, or saves or resets a prompt
- **THEN** the new-session limit stays visible
- **AND** only the requested configuration field changes without task or provider-session side effects
