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
While a merge or enqueue runs, the button SHALL show a busy state and SHALL be disabled. On success, the plugin SHALL refresh the PR insight so the tab shows the new state. On failure, the tab SHALL show the error text near the button and keep the button available.

#### Scenario: Merge succeeds
- **WHEN** GitHub merges the PR
- **THEN** the tab refreshes and shows the PR as "Merged" with no button

#### Scenario: Enqueue succeeds
- **WHEN** GitHub adds the PR to the merge queue
- **THEN** the tab refreshes and shows "Queued"

#### Scenario: GitHub rejects the action
- **WHEN** GitHub rejects the merge because the user has no write access
- **THEN** the tab shows the GitHub error and the button is available again

#### Scenario: Double click
- **WHEN** the user clicks "Enqueue" twice quickly
- **THEN** the plugin sends one enqueue request

### Requirement: Merge action in the composer banner
The composer banner of a thread SHALL show the same merge action as the "PR" tab, with the same merge method, confirm step, head commit guard, progress, and result. A ready PR SHALL show "Ready to merge" or "Ready to enqueue" and the button. A queued PR SHALL show "Queued" and no button. A PR with blockers SHALL show the blocker banner as before. Clicking the banner text SHALL open the "PR" tab.

#### Scenario: Ready PR in the chat view
- **WHEN** the thread's PR has no blockers and its repository has no merge queue
- **THEN** the composer banner shows "Ready to merge" and a "Squash and merge" button (for a squash default)

#### Scenario: Merge from the banner
- **WHEN** the user clicks the merge button in the banner and confirms the dialog
- **THEN** the plugin merges the PR and the banner no longer shows

#### Scenario: Queued PR in the chat view
- **WHEN** the thread's PR is in the merge queue
- **THEN** the composer banner shows "Queued" and no button

#### Scenario: PR with blockers in the chat view
- **WHEN** the thread's PR has the blocker "1 check failed"
- **THEN** the composer banner shows the blocker text as before and no merge button

#### Scenario: Open the PR tab from the banner
- **WHEN** the user clicks the "Ready to merge" text
- **THEN** the "PR" tab opens and no GitHub write occurs

#### Scenario: Merged PR in the chat view
- **WHEN** the thread's PR is merged
- **THEN** the composer banner does not show

### Requirement: Writes only from the user
The plugin SHALL merge or enqueue only from a click in the "PR" tab or the composer banner. No CLI command and no agent tool of the plugin SHALL merge or enqueue a PR.

#### Scenario: CLI has no merge command
- **WHEN** a user or agent runs `bb github-insight --help`
- **THEN** no command merges or enqueues a PR
