# Spec Delta

## MODIFIED Requirements

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
