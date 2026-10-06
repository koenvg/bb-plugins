# Spec Delta

## ADDED Requirements

### Requirement: Missing Git remotes mean no PR

The plugin SHALL treat a PR lookup that reports no Git remotes as no PR, not as a failed reading. After that result, the composer PR banner SHALL be hidden, with no error or Retry button, and the PR tab SHALL show its existing no-PR state. Other lookup and refresh failures SHALL keep their existing error behavior.

#### Scenario: Open a thread without a Git remote

- **WHEN** the thread's PR lookup returns `gh pr view failed: no git remotes found`
- **THEN** the composer shows no PR banner, error, or Retry button
- **AND** the PR tab shows `No pull request for this thread`

#### Scenario: Missing remotes after a good reading

- **WHEN** a thread has a shown PR snapshot and a later lookup reports no Git remotes
- **THEN** the thread no longer shows that snapshot
- **AND** the composer PR banner is hidden and the PR tab shows its no-PR state

#### Scenario: Other lookup failure

- **WHEN** a PR lookup fails because `gh` is missing or is not signed in
- **THEN** the existing error remains visible with a Retry button

#### Scenario: Other refresh failure

- **WHEN** a background refresh fails because GitHub is rate limited
- **THEN** the last good snapshot stays visible with the existing error and Retry button
