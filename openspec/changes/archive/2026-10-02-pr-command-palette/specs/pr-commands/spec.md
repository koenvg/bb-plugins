# Spec Delta

## Purpose

Lets the user run the PR actions of the thread in view from bb's command palette, through the "PR" and "Review" tabs, without a mouse.

## ADDED Requirements

### Requirement: Commands in the palette
The plugin SHALL add these commands to bb's command palette: "GitHub: Merge PR", "GitHub: Open PR tab", "GitHub: Open Review tab", "GitHub: Submit review", "GitHub: Refresh PR", and "GitHub: Open PR on GitHub". The plugin SHALL NOT add a command that sends review threads to the agent.

#### Scenario: No send to agent command
- **WHEN** the user searches the palette for "agent"
- **THEN** no "GitHub:" command is in the result

### Requirement: Commands only for a thread with a PR
The palette SHALL list the "GitHub:" commands only when the thread in view has a PR, as the last PR load of that thread in this window showed. Before the first load of the thread ends, and when the thread has no PR, the palette SHALL list no "GitHub:" command. A failed load SHALL keep what the last good load showed.

#### Scenario: Thread with a PR
- **WHEN** the thread in view has a merged PR and the user opens the palette
- **THEN** the palette lists "GitHub: Open PR tab", "GitHub: Open Review tab", "GitHub: Submit review", "GitHub: Refresh PR", and "GitHub: Open PR on GitHub"

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

### Requirement: Merge command only for a PR that can merge
The palette SHALL list "GitHub: Merge PR" only when the last PR load of the thread in view showed a "Merge" or "Enqueue" action.

#### Scenario: Ready PR
- **WHEN** the thread's PR has no blockers and the user opens the palette
- **THEN** the palette lists all six "GitHub:" commands

#### Scenario: PR with a blocker
- **WHEN** the thread's PR has the blocker "1 check failed"
- **THEN** the palette lists the "GitHub:" commands without "GitHub: Merge PR"

#### Scenario: Queued PR
- **WHEN** the thread's PR is in the merge queue
- **THEN** the palette lists the "GitHub:" commands without "GitHub: Merge PR"

### Requirement: Open a tab from the palette
"GitHub: Open PR tab" SHALL open the "PR" tab of the thread in view, and "GitHub: Open Review tab" SHALL open its "Review" tab. When the tab is already open, the command SHALL focus it and SHALL NOT open a second tab.

#### Scenario: Open the PR tab
- **WHEN** the user runs "GitHub: Open PR tab" and the "PR" tab is closed
- **THEN** the "PR" tab opens

#### Scenario: Tab already open
- **WHEN** the user runs "GitHub: Open Review tab" and the "Review" tab is already open
- **THEN** the "Review" tab gets focus and the panel has one "Review" tab

### Requirement: Merge from the palette
"GitHub: Merge PR" SHALL open the "PR" tab and then do what a click on the tab's merge action button does. For a "Merge" action, it SHALL open the confirm dialog, and the merge SHALL run only when the user confirms. For an "Enqueue" action, it SHALL run the enqueue at once. Progress and errors SHALL show in the tab.

#### Scenario: Merge with confirm
- **WHEN** the PR is ready, its repository has no merge queue, and the user runs "GitHub: Merge PR"
- **THEN** the "PR" tab opens with the confirm dialog that names the PR number, title, and merge method, and no GitHub write occurs before the user confirms

#### Scenario: Cancel the dialog
- **WHEN** the user runs "GitHub: Merge PR" and then cancels the dialog
- **THEN** the dialog closes and no GitHub write occurs

#### Scenario: Enqueue
- **WHEN** the PR is ready, requires a merge queue, and the user runs "GitHub: Merge PR"
- **THEN** the "PR" tab opens and the plugin asks GitHub to add the PR to the merge queue, with no dialog

#### Scenario: GitHub rejects the action
- **WHEN** the user runs "GitHub: Merge PR" and GitHub rejects the merge
- **THEN** the "PR" tab shows the GitHub error near the merge button

### Requirement: Merge command when no merge is possible
When the PR has no merge action button at the time the "PR" tab loads (for example, a new blocker since the palette listed the command), "GitHub: Merge PR" SHALL open the "PR" tab and SHALL NOT write to GitHub. The tab SHALL show its normal content, which tells the user why.

#### Scenario: PR with a blocker
- **WHEN** the PR has the blocker "1 check failed" and the user runs "GitHub: Merge PR"
- **THEN** the "PR" tab opens and shows the blocker, and no GitHub write occurs

#### Scenario: No pull request
- **WHEN** the thread has no PR and the user runs "GitHub: Merge PR"
- **THEN** the "PR" tab opens and shows "No pull request for this thread"

### Requirement: Use the merge action of the load after the command
"GitHub: Merge PR" SHALL act on the merge action that the "PR" tab shows after it has loaded. When the tab is still loading, the command SHALL wait for that load. An earlier merge action SHALL NOT be used.

#### Scenario: Tab not open yet
- **WHEN** the "PR" tab is closed and the user runs "GitHub: Merge PR" on a ready PR
- **THEN** the tab opens, loads the PR, and then shows the confirm dialog

### Requirement: Submit review from the palette
"GitHub: Submit review" SHALL open the "Review" tab with the "Submit review" panel open. It SHALL NOT submit. The user submits from the panel as before.

#### Scenario: Open the submit panel
- **WHEN** the user runs "GitHub: Submit review"
- **THEN** the "Review" tab opens with the "Submit review" panel open, and no GitHub write occurs

#### Scenario: Panel already open
- **WHEN** the "Submit review" panel is already open and the user runs "GitHub: Submit review"
- **THEN** the panel stays open with the body the user typed

### Requirement: Refresh from the palette
"GitHub: Refresh PR" SHALL open the "PR" tab and refresh the PR insight, the same as a click on the tab's refresh button. The tab SHALL show the refresh progress and any refresh error.

#### Scenario: Refresh
- **WHEN** the user runs "GitHub: Refresh PR"
- **THEN** the "PR" tab opens and shows the refresh progress, then the new data

### Requirement: Open the PR on GitHub from the palette
"GitHub: Open PR on GitHub" SHALL open the PR URL with bb's browser preference. When the thread has no PR, the command SHALL open the "PR" tab, which shows "No pull request for this thread", and SHALL NOT open a URL.

#### Scenario: PR exists
- **WHEN** the thread has PR #123 and the user runs "GitHub: Open PR on GitHub"
- **THEN** bb opens the URL of PR #123

#### Scenario: No pull request
- **WHEN** the thread has no PR and the user runs "GitHub: Open PR on GitHub"
- **THEN** no URL opens and the "PR" tab shows "No pull request for this thread"

### Requirement: One run for each command
Each run of a command SHALL cause at most one action. An action SHALL NOT run again when the tab re-renders, reloads, or is restored after a bb restart.

#### Scenario: Run twice quickly
- **WHEN** the user runs "GitHub: Merge PR" twice quickly on a PR that requires a merge queue
- **THEN** the plugin sends one enqueue request

#### Scenario: Tab restored after restart
- **WHEN** the user ran "GitHub: Refresh PR" and then restarts bb with the "PR" tab open
- **THEN** the tab does not refresh because of the earlier command
