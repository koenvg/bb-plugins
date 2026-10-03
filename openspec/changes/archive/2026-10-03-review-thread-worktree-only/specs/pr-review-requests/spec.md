# Spec Delta

## ADDED Requirements

### Requirement: Review thread environment
The plugin SHALL start a review thread only in an environment that no other thread can share. A new worktree meets this rule. The project checkout, a personal workspace, an existing environment, and the project's default environment do not. When the user submits the composer with an environment that does not meet the rule, the plugin SHALL not start a thread. The composer SHALL show an error that tells the user to pick a new worktree, and SHALL keep the draft.

#### Scenario: New worktree
- **WHEN** the user submits the review composer for `acme/api#15` with a new worktree environment
- **THEN** bb starts the review thread in that new worktree

#### Scenario: Project checkout
- **WHEN** the user changes the review composer environment for `acme/api#15` to the project checkout and submits
- **THEN** no thread is started
- **AND** the composer shows "Review threads need a new worktree"
- **AND** the prompt and other fields stay as the user left them

#### Scenario: Existing environment
- **WHEN** the user submits the review composer with an existing environment of another thread
- **THEN** no thread is started and the composer shows "Review threads need a new worktree"

#### Scenario: Another thread switches branch
- **WHEN** a review thread for `acme/api#15` runs in its new worktree and another thread checks out a different branch in the project checkout
- **THEN** the card for `#15` still opens the review thread
- **AND** the PR and Review tabs of that thread still show `#15`
