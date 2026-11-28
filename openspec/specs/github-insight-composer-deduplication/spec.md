# github-insight-composer-deduplication Specification

## Purpose

Let users hide BB's built-in PR segment without losing Git controls or GitHub Insight.

## Requirements

### Requirement: BB controls native PR visibility

GitHub Insight SHALL leave native composer controls to BB and SHALL NOT change BB's `showPullRequest` setting. GitHub Insight continues to use the built-in GitHub PR Status plugin for PR lookup.

#### Scenario: Built-in PR segment enabled

- **GIVEN** a thread with a linked PR and local changes, with GitHub Insight, built-in GitHub PR Status, and built-in Git enabled, and `showGitChanges` set to `true`
- **WHEN** `showPullRequest` is `true`
- **THEN** BB's built-in PR segment and GitHub Insight's PR summary are visible
- **AND** the Git segment, Diff tab, and GitHub Insight PR tab remain usable

#### Scenario: Built-in PR segment hidden

- **GIVEN** the same thread and plugins
- **WHEN** `showPullRequest` is `false`
- **THEN** BB's built-in PR segment is hidden
- **AND** the Git segment and Diff tab remain usable
- **AND** GitHub Insight still finds the PR and its PR summary opens the PR tab
