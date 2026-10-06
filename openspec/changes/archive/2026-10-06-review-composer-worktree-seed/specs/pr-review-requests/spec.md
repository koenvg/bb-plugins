# Spec Delta

## MODIFIED Requirements

### Requirement: Review in thread

A PR card with a matching project and no linked thread SHALL have a "Review in thread" action. It SHALL open the host's new-thread composer filled in with the matching project, a new worktree environment, and the review prompt. The user SHALL be able to edit all of these before submitting. When more than one project matches, the composer SHALL start with the most recently updated one.

#### Scenario: Start a review thread

- **WHEN** the user selects "Review in thread" on `acme/api#15` and submits the composer unchanged
- **THEN** bb starts a thread in the matching project, in a new worktree, with the review prompt
- **AND** the thread is hidden from the sidebar thread list
- **AND** the panel opens that thread

#### Scenario: Composer opens on a new worktree

- **WHEN** the user selects "Review in thread" on `acme/api#15` and bb has a primary host
- **THEN** the composer's environment picker shows a new worktree on that host before the user changes anything
- **AND** the branch picker shows the project's default base branch

#### Scenario: No primary host

- **WHEN** the user selects "Review in thread" and bb has no primary host
- **THEN** the composer opens with the host's own environment default
- **AND** submitting a shared environment still shows "Review threads need a new worktree"

#### Scenario: Leave the composer

- **WHEN** the user opens the composer from a card and goes back without submitting
- **THEN** no thread is started and the panel shows the list again
