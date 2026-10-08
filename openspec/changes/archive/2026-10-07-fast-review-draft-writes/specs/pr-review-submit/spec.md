# Spec Delta

## MODIFIED Requirements

### Requirement: Comment drafts in the Review tab

The Review tab SHALL show each comment draft below its line in the file diff, on its side, marked "Pending comment". The user SHALL be able to edit the body and delete the draft. Edits SHALL be kept after the tab closes. The tab SHALL update without a refresh when the agent saves a draft.

#### Scenario: Draft on its line

- **WHEN** the PR has a comment draft on new line 42 of `src/a.ts`
- **THEN** the diff of `src/a.ts` shows the draft below new line 42, marked "Pending comment"

#### Scenario: Agent saves while the tab is open

- **WHEN** the tab is open and the agent saves a comment draft
- **THEN** the draft shows in the tab without a manual refresh

#### Scenario: Delete a draft

- **WHEN** the user deletes a comment draft
- **THEN** the draft goes away from the tab and from `review list`, and nothing is written to GitHub

#### Scenario: Delete removes the card at once

- **WHEN** the user clicks "Delete" on a comment draft
- **THEN** the card goes away before the server replies

#### Scenario: Delete fails

- **WHEN** the user clicks "Delete" and the server returns an error
- **THEN** the card shows again with its text and the error

## ADDED Requirements

### Requirement: Draft writes do not read from GitHub

Creating, deleting, or discarding a draft from the Review tab SHALL NOT read from GitHub. After any draft write, from the tab or from the agent CLI, the Review tab SHALL update its drafts without loading the PR files, review threads, or PR head again. Exception: "+" and the drafts update MAY load the PR from GitHub once when the server has not loaded that PR since it started. The agent CLI MAY still read from GitHub to check its own write.

#### Scenario: Delete a draft on a large PR

- **WHEN** the tab is open on a PR with 93 files and the user deletes a comment draft
- **THEN** no GitHub request is made, and the tab shows the other drafts

#### Scenario: Agent saves a draft

- **WHEN** the tab is open and the agent saves a comment draft from the CLI
- **THEN** the draft shows in the tab, and the tab does not load the PR files, review threads, or PR head again

#### Scenario: Add a comment after the PR is loaded

- **WHEN** the tab has loaded the PR and the user clicks "+" on a line
- **THEN** the draft is saved without a GitHub request

#### Scenario: Add a comment after a restart

- **WHEN** bb restarted, the server has not loaded the PR, and the user clicks "+"
- **THEN** the server loads the PR from GitHub one time and saves the draft

### Requirement: "+" checks against the last loaded PR

"+" SHALL check the line, the PR state, and the head commit against the PR data from the last full load of that PR. Each full load (open, Refresh, submit) SHALL replace that data.

#### Scenario: Author pushed after the last load

- **WHEN** the author pushed a new commit, the tab has not loaded it, and the user clicks "+" on a line in the diff on screen
- **THEN** the draft is saved at the head commit that the tab shows

#### Scenario: Refresh picks up the new head

- **WHEN** the author pushed a new commit and the user clicks Refresh
- **THEN** the next "+" checks against the new head commit
