# Spec Delta

## MODIFIED Requirements

### Requirement: Commands in the palette

The plugin SHALL add these commands to bb's command palette: "GitHub: Merge PR", "GitHub: Open PR tab", "GitHub: Open PR files", "GitHub: Submit review", "GitHub: Refresh PR", and "GitHub: Open PR on GitHub". The plugin SHALL NOT add a command that sends review threads to the agent. The plugin SHALL NOT add "GitHub: Open Review tab".

#### Scenario: No send to agent command

- **WHEN** the user searches the palette for "agent"
- **THEN** no "GitHub:" command is in the result

#### Scenario: No Review tab command

- **WHEN** the user searches the palette for "Review tab"
- **THEN** no "GitHub:" command is in the result

### Requirement: Commands only for a thread with a PR

The palette SHALL list the "GitHub:" commands only when the thread in view has a PR, as the last PR load of that thread in this window showed. Before the first load of the thread ends, and when the thread has no PR, the palette SHALL list no "GitHub:" command. A failed load SHALL keep what the last good load showed.

#### Scenario: Thread with a PR

- **WHEN** the thread in view has a merged PR and the user opens the palette
- **THEN** the palette lists "GitHub: Open PR tab", "GitHub: Open PR files", "GitHub: Submit review", "GitHub: Refresh PR", and "GitHub: Open PR on GitHub"

#### Scenario: Thread without a PR

- **WHEN** the thread in view has no PR and the user opens the palette
- **THEN** the palette lists no "GitHub:" command

#### Scenario: No thread in view

- **WHEN** the user opens the command palette on a screen without a thread
- **THEN** the palette lists no "GitHub:" command

#### Scenario: PR not loaded yet

- **WHEN** the user opens a thread and opens the palette before the first PR load of that thread ends
- **THEN** the palette lists no "GitHub:" command

#### Scenario: PR appears later

- **WHEN** the thread had no PR, and a later load shows a PR
- **THEN** the palette lists the "GitHub:" commands

### Requirement: Open a tab from the palette

"GitHub: Open PR tab" SHALL open the "PR" tab of the thread in view on "Overview", and "GitHub: Open PR files" SHALL open it on "Files". When the PR tab is already open, the command SHALL focus it, select the named sub-tab, and SHALL NOT open a second tab.

#### Scenario: Open the PR tab

- **WHEN** the user runs "GitHub: Open PR tab" and the "PR" tab is closed
- **THEN** the "PR" tab opens on "Overview"

#### Scenario: Open the PR files

- **WHEN** the user runs "GitHub: Open PR files" and the "PR" tab is closed
- **THEN** the "PR" tab opens on "Files"

#### Scenario: Tab already open

- **WHEN** the user runs "GitHub: Open PR files" and the "PR" tab is already open on "Overview"
- **THEN** the "PR" tab gets focus, shows "Files", and the panel has one "PR" tab

### Requirement: Merge from the palette

"GitHub: Merge PR" SHALL run the merge action of the thread in view without opening, closing, switching, or focusing a side-panel tab or a PR sub-tab. For a "Merge" action, it SHALL open a confirm dialog that names the PR number, title, and merge method, and the merge SHALL run only when the user confirms. For an "Enqueue" action, it SHALL run the enqueue without a dialog. Progress and errors SHALL show in the composer banner. An already open PR tab SHALL also show the shared operation progress and result. Neither success nor failure SHALL change the side-panel layout, the selected tab, or the selected sub-tab.

#### Scenario: Merge with confirm

- **WHEN** the PR is ready, its repository has no merge queue, and the user runs "GitHub: Merge PR"
- **THEN** the confirm dialog names the PR number, title, and merge method, no GitHub write occurs before confirmation, and the side panel stays unchanged

#### Scenario: Cancel the dialog

- **WHEN** the user runs "GitHub: Merge PR" and then cancels the dialog
- **THEN** the dialog closes, no GitHub write occurs, and the side panel stays unchanged

#### Scenario: Enqueue

- **WHEN** the PR is ready, requires a merge queue, and the user runs "GitHub: Merge PR"
- **THEN** the plugin asks GitHub to add the PR to the merge queue without a dialog, shows progress in the banner, and leaves the side panel unchanged

#### Scenario: GitHub rejects the action

- **WHEN** the user runs "GitHub: Merge PR" and GitHub rejects the merge
- **THEN** the chat banner shows the GitHub error and the side panel stays unchanged

#### Scenario: Another panel tab is selected

- **WHEN** another side-panel tab is selected and the user runs and confirms "GitHub: Merge PR"
- **THEN** that tab stays selected throughout preparation, confirmation, progress, and the result

#### Scenario: Files sub-tab is selected

- **WHEN** the PR tab shows "Files" and the user runs and confirms "GitHub: Merge PR"
- **THEN** the PR tab keeps showing "Files" throughout preparation, confirmation, progress, and the result

### Requirement: Submit review from the palette

"GitHub: Submit review" SHALL open the "PR" tab on "Files" with the "Submit review" panel open. It SHALL NOT submit. The user submits from the panel as before.

#### Scenario: Open the submit panel

- **WHEN** the user runs "GitHub: Submit review"
- **THEN** the "PR" tab opens on "Files" with the "Submit review" panel open, and no GitHub write occurs

#### Scenario: Panel already open

- **WHEN** the "Submit review" panel is already open and the user runs "GitHub: Submit review"
- **THEN** the panel stays open with the body the user typed

#### Scenario: PR tab on Overview

- **WHEN** the "PR" tab shows "Overview" and the user runs "GitHub: Submit review"
- **THEN** the "PR" tab shows "Files" with the "Submit review" panel open
