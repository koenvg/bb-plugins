# Spec Delta

## Purpose

Lets the user turn GitHub auto-merge on or off for the thread's PR from the PR tab, so a PR that waits for checks or reviews merges when it is ready.

## ADDED Requirements

### Requirement: Enable auto-merge button

The PR tab SHALL show an "Enable auto-merge" button when the PR is open and not a draft, the repository allows auto-merge and has no merge queue, auto-merge is off, the user's default merge method is allowed, and every blocker is "checks running" or "review required". The label SHALL name the method, for example "Enable auto-merge (squash)". The tab SHALL NOT show the button in any other case.

#### Scenario: Waiting for checks

- **WHEN** an open PR has only the blocker "3 checks running", the repository allows auto-merge, and the default method is squash
- **THEN** the tab shows "Enable auto-merge (squash)"

#### Scenario: Failed check

- **WHEN** an open PR has the blocker "1 check failed"
- **THEN** the tab shows no "Enable auto-merge" button

#### Scenario: Repository does not allow auto-merge

- **WHEN** the repository setting for auto-merge is off
- **THEN** the tab shows no "Enable auto-merge" button

#### Scenario: Merge queue repository

- **WHEN** the PR requires a merge queue
- **THEN** the tab shows no "Enable auto-merge" button

### Requirement: Enable auto-merge

Clicking "Enable auto-merge" SHALL ask GitHub at once, with no dialog, to turn on auto-merge for the PR with the user's default merge method and the head commit that the tab showed.

#### Scenario: Enable

- **WHEN** the user clicks "Enable auto-merge (squash)"
- **THEN** the plugin asks GitHub to turn on auto-merge with squash

### Requirement: Auto-merge on

When auto-merge is on for the PR, the PR tab SHALL show "Auto-merge on" with the merge method, and a "Disable" button. Clicking "Disable" SHALL ask GitHub at once to turn off auto-merge. This state SHALL show also when auto-merge was turned on outside bb.

#### Scenario: Auto-merge on from GitHub

- **WHEN** someone turned on auto-merge with squash on github.com
- **THEN** the tab shows "Auto-merge on (squash)" and a "Disable" button

#### Scenario: Disable

- **WHEN** the user clicks "Disable"
- **THEN** the plugin asks GitHub to turn off auto-merge, and after the refresh the tab shows no "Auto-merge on"

### Requirement: Auto-merge progress and result

While an auto-merge write runs, its button SHALL show "Enabling…" or "Disabling…", be disabled, and the plugin SHALL send at most one GitHub write. On success, the plugin SHALL refresh PR insight. On failure, the tab SHALL show the GitHub error and enable the button again.

#### Scenario: GitHub rejects enable

- **WHEN** GitHub rejects the request because the user has no write access
- **THEN** the tab shows the GitHub error and "Enable auto-merge" is enabled again
