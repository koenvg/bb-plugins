# Spec Delta

## Purpose

Lets github-insight detect that a pull request is in a GitHub merge queue, and report the queue position and state to the PR tab and to other plugins through the PR summary.

## ADDED Requirements

### Requirement: Merge queue detection
The plugin SHALL read the merge queue entry of the PR in the same GitHub request that reads the overview. It SHALL map the GitHub entry state to one queue state:
- `QUEUED` to `queued`
- `AWAITING_CHECKS` to `awaiting_checks`
- `MERGEABLE` and `LOCKED` to `merging`
- `UNMERGEABLE` to `failed`
A PR without a queue entry SHALL have no queue state.

#### Scenario: PR waits in the queue
- **WHEN** GitHub reports a merge queue entry with state `QUEUED` and position 3
- **THEN** the PR insight has queue state `queued` and position 3

#### Scenario: Queue checks run
- **WHEN** GitHub reports a merge queue entry with state `AWAITING_CHECKS`
- **THEN** the PR insight has queue state `awaiting_checks`

#### Scenario: Queue fails the PR
- **WHEN** GitHub reports a merge queue entry with state `UNMERGEABLE`
- **THEN** the PR insight has queue state `failed`

#### Scenario: PR not in a queue
- **WHEN** GitHub reports no merge queue entry
- **THEN** the PR insight has no queue state

#### Scenario: No extra request
- **WHEN** the plugin refreshes a PR
- **THEN** it sends no more GitHub requests than it sent before this change

### Requirement: Queue state replaces merge blockers
While the PR has a queue state, the plugin SHALL give an empty blocker list, whatever the merge state, review decision, threads, and checks of the PR are.

#### Scenario: Queued PR that GitHub reports as blocked
- **WHEN** a PR has queue state `queued` and GitHub reports merge state `BLOCKED` and review decision `REVIEW_REQUIRED`
- **THEN** the blocker list is empty

#### Scenario: Queue failed
- **WHEN** a PR has queue state `failed`
- **THEN** the blocker list is empty

### Requirement: Merge queue in the summary
The version 1 summary SHALL have an optional `mergeQueue` field. It SHALL be `{ position, state }` when the PR has a queue state, where `state` is `queued`, `awaiting_checks`, `merging`, or `failed`. It SHALL be `null` when the PR has no queue state. `version` SHALL stay `1`. A reader SHALL treat a summary without `mergeQueue` as a PR with no queue state.

#### Scenario: Queued PR summary
- **WHEN** a PR has queue state `queued` at position 2
- **THEN** the summary has `mergeQueue` `{ "position": 2, "state": "queued" }`, `blockers` `[]`, and `version` 1

#### Scenario: PR not in a queue
- **WHEN** a PR has no queue state
- **THEN** the summary has `mergeQueue` `null`

#### Scenario: Old summary
- **WHEN** a reader gets a version 1 summary without a `mergeQueue` field
- **THEN** it reads the PR as not in a queue

### Requirement: Merge queue in the PR tab
The PR tab SHALL show the queue state in text when the PR has one: "In merge queue (#N)" for `queued`, "Merge queue checks running (#N)" for `awaiting_checks`, "Merging" for `merging`, and "Merge queue failed" for `failed`. The `failed` text SHALL use the problem tone. The composer banner SHALL show no blockers while the PR has a queue state.

#### Scenario: Queued PR in the tab
- **WHEN** the user opens the PR tab of a PR with queue state `queued` at position 3
- **THEN** the tab shows "In merge queue (#3)" and no merge blockers

#### Scenario: Failed queue entry in the tab
- **WHEN** the user opens the PR tab of a PR with queue state `failed`
- **THEN** the tab shows "Merge queue failed" in the problem tone
