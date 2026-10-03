# Spec Delta

## MODIFIED Requirements

### Requirement: Merge from the palette
"GitHub: Merge PR" SHALL run the merge action of the thread in view without opening, closing, switching, or focusing a side-panel tab. For a "Merge" action, it SHALL open a confirm dialog that names the PR number, title, and merge method, and the merge SHALL run only when the user confirms. For an "Enqueue" action, it SHALL run the enqueue without a dialog. Progress and errors SHALL show in the composer banner. An already open PR tab SHALL also show the shared operation progress and result. Neither success nor failure SHALL change the side-panel layout or selected tab.

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
- **WHEN** the Review tab is selected and the user runs and confirms "GitHub: Merge PR"
- **THEN** the Review tab stays selected throughout preparation, confirmation, progress, and the result

### Requirement: Merge command when no merge is possible
When a new PR load after the command shows no runnable merge action, "GitHub: Merge PR" SHALL NOT write to GitHub or open a confirm dialog. The composer banner SHALL show the reason without opening the PR tab, including when the normal PR banner would be hidden. A failed load SHALL show the error in the banner and SHALL NOT use an earlier action.

#### Scenario: PR with a blocker
- **WHEN** the PR has the blocker "1 check failed" and the user runs "GitHub: Merge PR"
- **THEN** the banner shows the blocker, no GitHub write occurs, and the side panel stays unchanged

#### Scenario: No pull request
- **WHEN** the thread has no PR and the user runs a previously available "GitHub: Merge PR" command
- **THEN** the banner shows "No pull request for this thread", no GitHub write occurs, and the side panel stays unchanged

#### Scenario: PR already merged or queued
- **WHEN** a new load shows the PR is merged or queued after the palette listed the command
- **THEN** the banner shows the current PR state without confirmation or another write, and the side panel stays unchanged

#### Scenario: PR load fails
- **WHEN** the new load for "GitHub: Merge PR" fails
- **THEN** the banner shows the load error, no earlier merge action is used, and the side panel stays unchanged

### Requirement: Use the merge action of the load after the command
"GitHub: Merge PR" SHALL load the thread's current PR insight after the command and act only on the action from that load. It SHALL wait for that load before opening confirmation or enqueuing. An earlier merge action SHALL NOT be used. The confirmation and write SHALL remain bound to the PR and head commit from the command's load; a later load SHALL NOT silently change the confirmed target.

#### Scenario: Tab not open yet
- **WHEN** the PR tab is closed and the user runs "GitHub: Merge PR" on a ready PR
- **THEN** the plugin loads the PR and then shows the confirm dialog without opening the tab

#### Scenario: Merge method changed
- **WHEN** the last load offered a merge commit but the load after the command offers squash
- **THEN** the confirmation names squash and uses the head commit from the new load

### Requirement: One run for each command
Each run of a command SHALL cause at most one action. An action SHALL NOT run again when the tab or composer banner re-renders, reloads, remounts, or is restored after a BB restart. Repeated merge commands while preparation, confirmation, or a write is active for that thread in the same window SHALL NOT create another dialog or write. A pending preparation or confirmation SHALL be discarded when the user leaves that thread before confirmation or enqueue starts. An already sent write SHALL remain bound to its original thread and SHALL NOT affect another thread's banner.

#### Scenario: Run twice quickly
- **WHEN** the user runs "GitHub: Merge PR" twice quickly on a PR that requires a merge queue
- **THEN** the plugin sends one enqueue request

#### Scenario: Tab restored after restart
- **WHEN** the user ran "GitHub: Refresh PR" and then restarts BB with the PR tab open
- **THEN** the tab does not refresh because of the earlier command

#### Scenario: Repeat while confirmation is open
- **WHEN** the user runs "GitHub: Merge PR" again while its confirm dialog is open
- **THEN** one dialog stays open and confirming it sends at most one write

#### Scenario: Switch threads during preparation
- **WHEN** the user runs "GitHub: Merge PR" for thread A and switches to thread B before preparation finishes
- **THEN** no confirmation or enqueue starts from that pending command, and no command feedback appears in thread B

#### Scenario: Switch threads during a write
- **WHEN** the user confirms a merge in thread A and switches to thread B while the write runs
- **THEN** the result stays associated with thread A and no merge operation state appears in thread B
