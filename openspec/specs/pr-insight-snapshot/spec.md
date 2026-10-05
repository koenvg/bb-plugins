# pr-insight-snapshot Specification

## Purpose

Keeps the last known PR data of each thread, so the PR tab and composer banner show it at once on a thread switch and after a bb restart, then refresh it in the background.

## Requirements

### Requirement: Show the snapshot at once on a thread switch

When the window already loaded PR data for a thread, the PR tab and the composer banner of that thread SHALL show that data at once when the user returns to the thread. They SHALL NOT show "Loading pull request…" in that case. They SHALL then load current data in the background and replace the shown data when it arrives.

#### Scenario: Return to a thread

- **WHEN** the user opens thread A, switches to thread B, and switches back to thread A
- **THEN** the PR tab of thread A shows the PR data it showed before, with no loading notice
- **AND** the tab loads current data in the background

#### Scenario: New data arrives

- **WHEN** the background load returns a new check state for the shown snapshot
- **THEN** the tab shows the new check state without a loading notice

#### Scenario: First open of a thread

- **WHEN** the window has no PR data for a thread and the server has no stored reading
- **THEN** the PR tab shows "Loading pull request…" until the first load ends

### Requirement: Snapshot survives a restart

The plugin SHALL store the last good PR reading of each PR it tracks, so it survives a bb or plugin restart. After a restart, the first load of a thread SHALL return the stored reading with its original update time, and the plugin SHALL refresh it from GitHub in the background.

#### Scenario: Open a thread after a restart

- **WHEN** bb restarts and the user opens a thread whose PR was read before the restart
- **THEN** the PR tab shows the stored PR data with its original update time
- **AND** the plugin refreshes the PR from GitHub without a user action

#### Scenario: Thread loses its PR

- **WHEN** a later load finds no PR for a thread
- **THEN** the plugin no longer shows the stored reading for that thread

### Requirement: Visible data age

The PR tab SHALL always show when the shown data was read from GitHub, as relative time, for example "Updated 2 minutes ago". While a background load or a refresh runs, the tab SHALL show that it is updating. A failed background load SHALL keep the shown data and show the error, as before.

#### Scenario: Stored data after a restart

- **WHEN** the tab shows a reading from 3 hours ago
- **THEN** the tab shows "Updated 3 hours ago"

#### Scenario: Background load runs

- **WHEN** the tab shows a snapshot and its background load is running
- **THEN** the tab shows an updating indicator next to the data age

#### Scenario: Background load fails

- **WHEN** the background load fails with "rate limited"
- **THEN** the tab keeps the snapshot, its data age, and shows the error with a retry button

### Requirement: Snapshot stays with its thread

The PR tab and banner of a thread SHALL NOT show a snapshot of another thread, also not for a moment during a thread switch.

#### Scenario: Switch to a thread without data

- **WHEN** the user switches from thread A with a PR to thread B that the window did not load before
- **THEN** the tab of thread B shows the loading notice or thread B's stored reading, never thread A's PR

### Requirement: Actions from a snapshot keep the head guard

A merge, enqueue, branch update, or auto-merge started from a shown snapshot SHALL send the head commit of that snapshot. When GitHub has a different head, GitHub rejects the request and the tab SHALL show the error.

#### Scenario: Stale snapshot after a push

- **WHEN** the tab shows a snapshot with head commit A, the branch now has head commit B, and the user starts a merge before the background load ends
- **THEN** no merge occurs and the tab shows the GitHub error
