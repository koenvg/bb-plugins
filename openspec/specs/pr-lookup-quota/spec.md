# pr-lookup-quota Specification

## Purpose

Limits how often github-insight asks bb for the pull request of an environment, and pauses those lookups when GitHub reports a rate limit, so the plugin stays inside the GitHub quota the user shares with agents and other tools.

## Requirements

### Requirement: Reuse recent PR lookups

github-insight SHALL reuse the last PR lookup result of an environment while it is valid, and SHALL NOT ask bb again in that time. A result SHALL stay valid for 60 seconds for an open or draft PR, 5 minutes for no PR, 15 minutes for a closed PR, and 60 minutes for a merged PR. Lookup failures SHALL NOT be reused.

#### Scenario: PR tab reload after a poll

- **WHEN** the poller looked up the PR of environment E 20 seconds ago and found an open PR
- **AND** the PR tab of a thread in E loads its insight
- **THEN** github-insight does not ask bb for the PR of E

#### Scenario: Open PR result expires

- **WHEN** the last lookup of environment E found an open PR 61 seconds ago
- **AND** the poller runs
- **THEN** github-insight asks bb for the PR of E once

#### Scenario: Merged PR

- **WHEN** the last lookup of environment E found a merged PR 10 minutes ago
- **AND** the poller runs
- **THEN** github-insight does not ask bb for the PR of E

#### Scenario: Failed lookup

- **WHEN** the last lookup of environment E failed with an error that is not a rate limit
- **AND** the poller runs
- **THEN** github-insight asks bb for the PR of E again

### Requirement: Share concurrent PR lookups

When several callers need the PR of the same environment while a lookup for it runs, github-insight SHALL send one request to bb and give its result to all of them.

#### Scenario: Poll and review-queue relink at the same time

- **WHEN** the poller and the review-queue relink both need the PR of environment E at the same time
- **THEN** github-insight asks bb for the PR of E once

### Requirement: Fresh lookups for user and idle refreshes

A manual refresh, the refresh after a thread becomes idle, and its retry after 10 seconds SHALL ask bb for the PR, also when a valid result exists. The new result SHALL replace the stored result.

#### Scenario: Agent opens a PR

- **WHEN** the last lookup of environment E found no PR 30 seconds ago
- **AND** the agent of a thread in E opens a PR and its turn ends
- **THEN** github-insight asks bb for the PR of E and shows the new PR in the thread

#### Scenario: Manual refresh

- **WHEN** the user presses refresh in the PR tab while the lookup result of the environment is still valid
- **THEN** github-insight asks bb for the PR before it reads the PR from GitHub

### Requirement: Pause on a rate-limited PR lookup

When a PR lookup through bb fails because GitHub reports a rate limit, github-insight SHALL pause all its background GitHub work, the same as for a rate limit on its own GitHub calls. The pause SHALL end at the GraphQL reset time, or 5 minutes after the failure when the reset time is not known.

#### Scenario: Host lookup is rate limited

- **WHEN** bb answers a PR lookup with `gh pr view failed: GraphQL: API rate limit already exceeded`
- **THEN** the poller, the idle refresh, and background PR loads make no GitHub requests and no PR lookups until the pause ends

#### Scenario: Reset time known

- **WHEN** a PR lookup is rate limited and GitHub reports that the GraphQL quota resets in 12 minutes
- **THEN** the next background lookup happens after those 12 minutes

### Requirement: Last known PR during a pause

While github-insight is paused for a rate limit, a PR lookup SHALL return the last known result of the environment, also when that result is expired, and SHALL NOT ask bb. When no result is known, the lookup SHALL fail with "rate limited". A manual refresh SHALL still ask bb.

#### Scenario: PR tab during a pause

- **WHEN** github-insight is paused for a rate limit and the user opens a thread whose PR was looked up and read before
- **THEN** the PR tab shows the last PR data with the "rate limited" error and a Retry button
- **AND** it does not show the full-page error `gh pr view failed: GraphQL: API rate limit already exceeded`

#### Scenario: Unknown environment during a pause

- **WHEN** github-insight is paused for a rate limit and a thread in an environment that was never looked up loads its insight
- **THEN** the PR tab shows the error "rate limited"
