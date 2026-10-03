# Spec Delta

## MODIFIED Requirements

### Requirement: Writes only from the user
The plugin SHALL merge or enqueue only from a click in the "PR" tab or the composer banner, or from the "GitHub: Merge PR" command in bb's command palette. No CLI command and no agent tool of the plugin SHALL merge or enqueue a PR.

#### Scenario: CLI has no merge command
- **WHEN** a user or agent runs `bb github-insight --help`
- **THEN** no command merges or enqueues a PR

#### Scenario: Merge from the command palette
- **WHEN** the user runs "GitHub: Merge PR" on a ready PR and confirms the dialog
- **THEN** the plugin asks GitHub to merge the PR
