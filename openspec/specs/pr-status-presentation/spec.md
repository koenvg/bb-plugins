# pr-status-presentation Specification

## Purpose

Lets users read the same pull request state in the right-hand PR panel and above the composer, without confusing lifecycle state, merge readiness, queue progress, and data availability.

## Requirements

### Requirement: Known PR lifecycle remains visible

The PR panel and composer banner SHALL show the lifecycle of a known PR independently of blockers and available actions. Draft, Open, Closed, and Merged SHALL remain distinguishable. A merged banner SHALL keep the existing "Pull request merged" outcome. An open PR without an action SHALL show Open without claiming readiness.

#### Scenario: Draft with passing checks

- **WHEN** the loaded PR is Draft, all checks pass, and its blocker list is empty
- **THEN** the panel and banner both show Draft
- **AND** neither offers merge or enqueue

#### Scenario: Draft with higher-priority blockers

- **WHEN** the loaded PR is Draft with failed checks, pending review, or merge conflicts
- **THEN** the banner keeps Draft visible alongside its compact blocker summary
- **AND** the PR panel still shows Draft and the full details

#### Scenario: Open PR without an available action

- **WHEN** the loaded PR is Open with no blockers but no allowed merge action
- **THEN** the banner shows Open with no merge button
- **AND** it does not show "Ready to merge" or "Ready to enqueue"

#### Scenario: Closed PR

- **WHEN** the loaded PR is Closed
- **THEN** the panel and banner both show Closed and no merge action

#### Scenario: Terminal state overrides stale detail

- **WHEN** a merged or closed PR snapshot also contains old blockers, a queue entry, or an available action
- **THEN** both views show the terminal lifecycle without active blocker, queue, or readiness messages
- **AND** no merge action is offered

### Requirement: Queue detail matches the PR panel

For an open PR with a queue entry, the banner SHALL show the same queue state and position as the PR panel. It SHALL use "In merge queue (#N)", "Merge queue checks running (#N)", "Merging", or "Merge queue failed" for the corresponding reported state. Queue failure SHALL use a problem tone, not a waiting or ready tone. Queue status SHALL show no merge blockers or merge action.

#### Scenario: Waiting and queue checks

- **WHEN** an open PR has queue state queued or awaiting_checks at position 3
- **THEN** both views show "In merge queue (#3)" or "Merge queue checks running (#3)" respectively
- **AND** the banner retains the Open lifecycle and offers no merge action

#### Scenario: Queue merging

- **WHEN** an open PR has queue state merging
- **THEN** both views show Merging without claiming that the PR is already merged

#### Scenario: Queue failure

- **WHEN** an open PR has queue state failed
- **THEN** both views show "Merge queue failed" in a problem tone
- **AND** the banner does not describe that state only as Queued

### Requirement: Initial data availability is explicit

Before the first PR result is available, the banner SHALL show "Loading pull request…". A read failure without a good result SHALL show the error and a retry action, without inventing a PR lifecycle or readiness. A confirmed no-PR result SHALL hide normal PR status. Separate feedback from an explicit user action SHALL remain available as required by the merge-action contract.

#### Scenario: First load

- **WHEN** the selected thread's first PR read is pending
- **THEN** the panel and banner show a loading state rather than a terminal or ready state

#### Scenario: Read fails

- **WHEN** the first PR read fails because GitHub access is unavailable
- **THEN** both views show the failure and a retry action
- **AND** the banner offers no merge action and opens no panel automatically

#### Scenario: No linked PR

- **WHEN** the read confirms that the thread has no PR
- **THEN** the panel says "No pull request for this thread" and the normal PR banner disappears

### Requirement: Failed refresh keeps visibly stale data

When a refresh fails but a last good PR result exists, both views SHALL keep its lifecycle and details while identifying the failure, the time of the last good refresh, and a retry action. Refreshing SHALL NOT replace known PR status with an empty banner or present old data as newly confirmed.

#### Scenario: Last good draft after refresh failure

- **WHEN** the last good result is Draft and the next refresh is rate limited
- **THEN** both views keep Draft and identify the refresh failure and last good refresh time
- **AND** the banner provides retry without displaying a ready message

#### Scenario: Refresh in progress

- **WHEN** a manual refresh is pending with a good result already loaded
- **THEN** the lifecycle stays visible while refresh progress is indicated

### Requirement: State updates stay with the correct thread

After both views consume the same updated PR result, they SHALL agree on lifecycle and queue state. A result, loading state, or error belonging to another thread SHALL NOT appear after thread navigation. Showing the banner SHALL NOT add a separate GitHub data source or polling schedule.

#### Scenario: Draft becomes open

- **WHEN** a refreshed result changes the PR from Draft to Open and both views finish consuming it
- **THEN** both views show Open and remove the Draft label
- **AND** merge readiness reflects the new result, not the earlier one

#### Scenario: Switching threads during a read

- **WHEN** the user switches from thread A to thread B while A has a pending PR read
- **THEN** B shows only B's loading state or PR result
- **AND** a late result for A does not replace B's status

### Requirement: Compact status remains accessible

The banner SHALL keep the PR lifecycle readable at normal and compact widths. A click on known-PR status SHALL open that thread's PR panel without a GitHub write. Status and retry controls SHALL support keyboard use and accessible names. Truncated detail SHALL NOT hide the lifecycle or prevent access to the full detail in the panel.

#### Scenario: Compact draft banner

- **WHEN** a draft PR with long blocker text is shown at a compact width
- **THEN** Draft stays readable, file controls stay usable, and the status opens the PR panel

#### Scenario: Status selected with the keyboard

- **WHEN** the user focuses and activates the PR status control with the keyboard
- **THEN** the matching PR panel opens and no PR write occurs

### Requirement: Existing host controls remain available

The status presentation SHALL preserve existing changed-file controls and the host's Mark ready action when the host offers it. Displaying Draft SHALL NOT itself mark the PR ready or add a plugin mark-ready write.

#### Scenario: Draft beside file controls

- **WHEN** the host offers changed-file controls and Mark ready for a draft PR
- **THEN** both remain usable when the plugin banner shows Draft
- **AND** displaying or opening the PR status makes no change to the PR
