# pr-merge-actions Specification

## Purpose

Lets the user merge the thread's pull request, or add it to the merge queue, from the "PR" tab without going to GitHub.

## Requirements

### Requirement: One merge action for a ready PR

The "PR" tab SHALL show one action button when the PR is open, is not a draft, is not in the merge queue, and has no merge blockers. The button SHALL be "Enqueue" when the PR requires a merge queue and "Merge" when it does not. The tab SHALL NOT show the button in any other case.

#### Scenario: Ready PR without a merge queue

- **WHEN** an open PR has no merge blockers and its repository has no merge queue
- **THEN** the tab shows a "Merge" button

#### Scenario: Ready PR with a merge queue

- **WHEN** an open PR has no merge blockers and requires a merge queue
- **THEN** the tab shows an "Enqueue" button and no "Merge" button

#### Scenario: PR with a blocker

- **WHEN** an open PR has the blocker "1 check failed"
- **THEN** the tab shows the blocker and no merge action button

#### Scenario: Merged or closed PR

- **WHEN** the PR is merged or closed
- **THEN** the tab shows no merge action button

### Requirement: Queued PR

When the PR is in the merge queue, the tab SHALL show a "Queued" label and SHALL NOT show a merge action button.

#### Scenario: PR in the merge queue

- **WHEN** the PR is in the merge queue of its repository
- **THEN** the tab shows "Queued" and no button

### Requirement: Merge method

Merge SHALL use the user's default merge method for the repository, as GitHub reports it. The button label SHALL name that method: "Create merge commit", "Squash and merge", or "Rebase and merge". When the repository does not allow that method, the tab SHALL NOT show the "Merge" button.

#### Scenario: Default method is squash

- **WHEN** the user's default merge method is squash and the repository allows squash
- **THEN** the button reads "Squash and merge" and the merge uses squash

#### Scenario: Default method not allowed

- **WHEN** the user's default merge method is rebase and the repository does not allow rebase
- **THEN** the tab shows no "Merge" button

### Requirement: Confirm before merge

Clicking "Merge" SHALL open a confirm dialog that names the PR number, the PR title, and the merge method. The merge SHALL run only when the user confirms. Cancel SHALL close the dialog and do nothing. Clicking "Enqueue" SHALL run at once, without a dialog.

#### Scenario: Confirm merge

- **WHEN** the user clicks "Merge" and then confirms in the dialog
- **THEN** the plugin asks GitHub to merge the PR

#### Scenario: Cancel merge

- **WHEN** the user clicks "Merge" and then cancels
- **THEN** the dialog closes and no GitHub write occurs

#### Scenario: Enqueue

- **WHEN** the user clicks "Enqueue"
- **THEN** the plugin asks GitHub to add the PR to the merge queue, with no dialog

### Requirement: Guard on the shown head commit

Each merge or enqueue request SHALL send the head commit that the tab showed. When the PR head on GitHub is a different commit, GitHub rejects the request and the tab SHALL show the error and SHALL NOT merge or enqueue.

#### Scenario: Branch changed after the last refresh

- **WHEN** someone pushes a new commit to the PR branch, and the user then clicks "Enqueue" before the tab refreshes
- **THEN** the PR is not queued and the tab shows the GitHub error

### Requirement: Action progress and result

While a merge or enqueue runs for a thread in a window, every visible merge action button for that thread SHALL show the same busy state and SHALL be disabled. The busy label SHALL be "Merging…" for a merge and "Enqueuing…" for enqueue. An action button mounted during that operation SHALL immediately show the same busy state. Requests from the tab, composer banner, and palette during the same running operation SHALL cause at most one GitHub write. On success, the plugin SHALL refresh PR insight so the tab and banner show the new state. On failure, the tab and banner SHALL show the operation error and make a still-valid action available again. Operation state SHALL NOT appear in another thread. An error for an earlier head commit SHALL NOT appear as the error for a newly loaded head commit.

#### Scenario: Merge succeeds

- **WHEN** GitHub merges the PR
- **THEN** the tab and banner refresh and show the merged state with no merge action button

#### Scenario: Enqueue succeeds

- **WHEN** GitHub adds the PR to the merge queue
- **THEN** the tab and banner refresh and show "Queued"

#### Scenario: GitHub rejects the action

- **WHEN** GitHub rejects the merge because the user has no write access
- **THEN** the tab and banner show the GitHub error and any still-valid merge buttons are available again

#### Scenario: Double click

- **WHEN** the user clicks "Enqueue" twice quickly
- **THEN** the plugin sends one enqueue request

#### Scenario: Merge starts in the tab

- **WHEN** the user confirms a merge in the PR tab while the composer banner is visible
- **THEN** both buttons show "Merging…" and are disabled until the operation ends

#### Scenario: Enqueue starts in the banner

- **WHEN** the user clicks "Enqueue" in the composer banner while the PR tab is visible
- **THEN** both buttons show "Enqueuing…" and are disabled until the operation ends

#### Scenario: Requests from different entry points

- **WHEN** an action from the tab and an action from the banner or palette overlap for the same thread
- **THEN** the plugin sends at most one GitHub write for the active operation

#### Scenario: PR tab opens during a merge

- **WHEN** a merge is running from the banner and the user explicitly opens the PR tab
- **THEN** the tab's merge button immediately shows "Merging…" and is disabled

#### Scenario: A new head commit loads

- **WHEN** a failed merge was for head commit A and a later load shows head commit B
- **THEN** the error for A does not appear as the merge error for B

### Requirement: Merge action in the composer banner

The composer banner of a thread SHALL show the same merge action as the PR tab, with the same merge method, confirm step, head commit guard, shared progress, and result. A ready PR SHALL show "Ready to merge" or "Ready to enqueue" and the button when idle. While an operation runs, the banner SHALL show "Merging…" or "Enqueuing…" instead of a ready message, including when the action started from the tab or palette. A queued PR SHALL show "Queued" and no button. A merged PR SHALL show "Pull request merged" with a violet merge icon and no merge action. A closed PR SHALL show no normal PR banner. Other PRs with blockers SHALL show the blocker banner as before. Palette preparation SHALL show a loading message in the banner. Palette errors or unavailable-action messages SHALL remain visible in the banner even if its normal PR state would hide it, until dismissed, replaced by a later attempt, or superseded by current PR data. Clicking the normal PR banner text SHALL open the PR tab. No operation or error SHALL automatically open the panel.

#### Scenario: Ready PR in the chat view

- **WHEN** the thread's PR has no blockers and its repository has no merge queue
- **THEN** the composer banner shows "Ready to merge" and a "Squash and merge" button for a squash default

#### Scenario: Merge from the banner

- **WHEN** the user clicks the merge button in the banner and confirms the dialog
- **THEN** the plugin merges the PR and, after the refreshed insight arrives, the banner shows "Pull request merged" without a merge action

#### Scenario: Queued PR in the chat view

- **WHEN** the thread's PR is in the merge queue
- **THEN** the composer banner shows "Queued" and no button

#### Scenario: PR with blockers in the chat view

- **WHEN** the thread's PR has the blocker "1 check failed"
- **THEN** the composer banner shows the blocker text as before and no merge button

#### Scenario: Open the PR tab from the banner

- **WHEN** the user clicks the "Ready to merge" text
- **THEN** the PR tab opens and no GitHub write occurs

#### Scenario: Merged PR in the chat view

- **WHEN** the thread's PR is merged
- **THEN** the composer banner shows "Pull request merged" with a violet merge icon and no merge action
- **AND** clicking the banner opens the PR tab without a GitHub write

#### Scenario: Palette merge progress

- **WHEN** the user confirms a palette merge with the PR tab closed
- **THEN** the banner shows "Merging…", disables its merge action, and does not open the side panel

#### Scenario: Palette preparation

- **WHEN** the user runs "GitHub: Merge PR" and the new PR load is pending
- **THEN** the banner shows a loading message without opening the side panel

#### Scenario: Hidden normal banner with palette feedback

- **WHEN** a palette merge attempt finds no PR or a closed PR
- **THEN** the banner shows the reason without a merge button or an automatic panel opening

### Requirement: Writes only from the user

The plugin SHALL merge or enqueue only from a click in the "PR" tab or the composer banner, or from the "GitHub: Merge PR" command in bb's command palette. The plugin SHALL update the PR branch or turn auto-merge on or off only from a click in the "PR" tab. No CLI command and no agent tool of the plugin SHALL merge, enqueue, update the branch of, or change auto-merge for a PR.

#### Scenario: CLI has no merge command

- **WHEN** a user or agent runs `bb github-insight --help`
- **THEN** no command merges, enqueues, updates the branch of, or changes auto-merge for a PR

#### Scenario: Merge from the command palette

- **WHEN** the user runs "GitHub: Merge PR" on a ready PR and confirms the dialog
- **THEN** the plugin asks GitHub to merge the PR

#### Scenario: Branch update only from the PR tab

- **WHEN** the PR branch is behind its base
- **THEN** only the PR tab offers "Update branch", and the composer banner and command palette do not
