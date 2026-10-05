# Spec Delta

## Purpose

Lets the user bring the thread's PR branch up to date with its base from the PR tab, with merge or rebase, without losing commits that exist only in the thread's worktree.

## ADDED Requirements

### Requirement: Update branch button

The PR tab SHALL show an "Update branch" split button when the PR is open or draft, its branch is behind its base, it has no merge conflicts, and it is not in the merge queue. The main part SHALL update with a merge. The menu SHALL hold "Update with rebase". The tab SHALL NOT show the button in any other case.

#### Scenario: Branch behind, no conflicts

- **WHEN** an open PR has the blocker "Branch out of date" and no merge conflicts
- **THEN** the tab shows "Update branch" with the menu item "Update with rebase"

#### Scenario: Branch with conflicts

- **WHEN** an open PR has merge conflicts
- **THEN** the tab shows no "Update branch" button

#### Scenario: Branch up to date

- **WHEN** the PR branch contains the latest base commit
- **THEN** the tab shows no "Update branch" button

### Requirement: Update with merge

Clicking the main part of "Update branch" SHALL ask GitHub to merge the base into the PR branch at once, with no dialog.

#### Scenario: Merge update

- **WHEN** the user clicks "Update branch"
- **THEN** the plugin asks GitHub to update the branch with a merge, and no dialog opens

### Requirement: Rebase needs a confirm

Clicking "Update with rebase" SHALL open a confirm dialog that names the PR and says that the thread's local branch will no longer match the remote branch. The rebase SHALL run only when the user confirms. Cancel SHALL close the dialog and do nothing.

#### Scenario: Confirm rebase

- **WHEN** the user clicks "Update with rebase" and confirms
- **THEN** the plugin asks GitHub to update the branch with a rebase

#### Scenario: Cancel rebase

- **WHEN** the user clicks "Update with rebase" and cancels
- **THEN** the dialog closes and no GitHub write occurs

### Requirement: Rebase blocked by unpushed commits

Before it enables "Update with rebase", the plugin SHALL check the thread's worktree on its host for commits that are not on the remote PR branch. With N such commits, the item SHALL be disabled and show "N unpushed commits. Push first.". When the check cannot run, the item SHALL be disabled and show "Cannot check local commits". "Update branch" with merge SHALL stay available in both cases.

#### Scenario: Unpushed commits

- **WHEN** the thread's worktree has 2 commits that are not on the remote PR branch
- **THEN** "Update with rebase" is disabled and shows "2 unpushed commits. Push first."
- **AND** "Update branch" with merge is enabled

#### Scenario: Worktree matches the remote

- **WHEN** the thread's worktree has no commits that are not on the remote PR branch
- **THEN** "Update with rebase" is enabled

#### Scenario: Check cannot run

- **WHEN** the thread has no worktree on its host, or the local branch has no remote branch
- **THEN** "Update with rebase" is disabled and shows "Cannot check local commits"

### Requirement: Branch update guard and progress

Each branch update SHALL send the head commit that the tab showed. While an update runs, the button SHALL show "Updating…", be disabled, and the plugin SHALL send at most one GitHub write. On success, the plugin SHALL refresh PR insight. On failure, the tab SHALL show the GitHub error and enable the button again.

#### Scenario: Head changed

- **WHEN** a new commit was pushed after the last refresh and the user clicks "Update branch"
- **THEN** GitHub rejects the update and the tab shows the error

#### Scenario: Double click

- **WHEN** the user clicks "Update branch" twice quickly
- **THEN** the plugin sends one update request

### Requirement: Pull reminder after an update

After a successful branch update, the PR tab of that thread SHALL show "Branch updated on GitHub. Pull before you push." until the user dismisses it or switches to another thread. It SHALL NOT appear in other threads.

#### Scenario: Update succeeds

- **WHEN** GitHub updates the branch
- **THEN** the tab shows "Branch updated on GitHub. Pull before you push." with a dismiss control
