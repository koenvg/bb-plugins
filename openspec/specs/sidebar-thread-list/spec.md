# sidebar-thread-list Specification

## Purpose

Provide a selectable BB thread list that keeps everyday sidebar navigation intact and makes each thread's branch pull request status visible without opening the thread.

## Requirements

### Requirement: Selectable replacement list
The system SHALL provide a selectable replacement for the scrolling sidebar thread list while leaving BB-owned navigation, new-thread controls, and footer available. The existing bundled list SHALL remain selectable.

#### Scenario: User selects the replacement
- **WHEN** a user chooses the new list under sidebar appearance settings
- **THEN** its thread rows occupy the scrolling list area without replacing the surrounding sidebar controls

#### Scenario: User switches back
- **WHEN** a user selects BB's bundled thread list again
- **THEN** the bundled list displays without uninstalling the replacement plugin

### Requirement: Familiar organization and visibility
The replacement SHALL support the existing list's active and archived visibility, pinned threads, thread nesting, grouping by project, machine, or user section, and collapse and sorting controls. The active and archived selection SHALL be in List options and SHALL apply only to the All tab. It SHALL keep the user's choices for the replacement across reloads and SHALL not show hidden threads as ordinary rows.

#### Scenario: Grouped thread navigation
- **WHEN** a user selects an organization mode and collapses a group or parent thread
- **THEN** the visible rows follow that organization and hide the collapsed descendants until expanded

#### Scenario: Archived and pinned threads
- **WHEN** a user changes the active or archived filter in List options while the All tab is selected, or pins a thread
- **THEN** the replacement shows the corresponding threads and pinned ordering without duplicating rows in their original group

#### Scenario: Archived selection outside All
- **WHEN** the archived selection is Archived and the user selects Needs attention
- **THEN** the list shows only active threads

#### Scenario: Hidden thread
- **WHEN** a thread is marked hidden
- **THEN** it does not appear as an ordinary navigable row

### Requirement: Existing thread interactions remain available
The replacement SHALL preserve navigation, the selected-thread and activity indicators, unread and draft cues, the thread context actions, split navigation where supported, and keyboard and compact-viewport behavior. Destructive actions SHALL use BB's confirmation flow.

#### Scenario: Open a thread on a compact viewport
- **WHEN** a user opens a thread from the replacement on a compact viewport
- **THEN** BB navigates to the thread and closes the sidebar drawer

#### Scenario: Thread actions
- **WHEN** a user uses a row's menu to pin, mark read or unread, rename, archive, or request deletion
- **THEN** the action operates on that thread and deletion requires BB's confirmation

#### Scenario: Keyboard and split navigation
- **WHEN** a user invokes BB's thread-row keyboard shortcut or drags a row into a split where supported
- **THEN** the replacement targets the same thread and respects BB's split behavior

### Requirement: Pull request status per thread
For a thread whose environment branch has a pull request, the replacement SHALL show a compact status and an accessible link to that pull request on the thread row. The status SHALL come from the github-insight PR summary of the thread, not from BB's per-row PR lookup. It SHALL distinguish draft, open with no special attention, checks pending or failed, review requested or changes requested, conflicts or blocked merge, ready to merge, merged, and closed states. The status SHALL not be mistaken for the thread's execution status.

#### Scenario: Branch has an open PR needing attention
- **WHEN** the github-insight summary reports an open PR with failed checks or requested changes for a thread
- **THEN** its row identifies that PR and communicates the reported attention state in text as well as visual treatment

#### Scenario: Branch has a draft, merged, or closed PR
- **WHEN** the github-insight summary reports a draft, merged, or closed PR
- **THEN** the row identifies the PR and communicates that state without implying it is ready to merge

#### Scenario: Several threads use one environment
- **WHEN** two visible threads share an environment with a PR
- **THEN** each row presents the status of that environment branch's PR

#### Scenario: Open PR status changes
- **WHEN** github-insight writes an updated summary while the list remains open
- **THEN** the affected row and its tab update within the next refresh, without requiring the user to reopen the thread

#### Scenario: PR link activation
- **WHEN** a user activates the PR link on a thread row
- **THEN** the PR opens without also navigating to the thread

### Requirement: Missing PR data does not disrupt navigation
The replacement SHALL keep thread rows usable when the PR summary is pending, the branch has no PR, github-insight is not installed, or the summary is not usable. It SHALL not present missing PR data as a failed PR status. An open or draft PR summary older than one hour SHALL count as missing. A merged or closed PR summary SHALL stay usable at any age.

#### Scenario: No PR or lookup unavailable
- **WHEN** no usable summary exists for a thread
- **THEN** the row shows no PR indicator and its normal thread navigation remains available

#### Scenario: Lookup pending
- **WHEN** the summaries have not yet loaded
- **THEN** the row remains usable and does not claim a PR state it cannot verify

#### Scenario: github-insight not installed
- **WHEN** the github-insight plugin is not installed or not running
- **THEN** rows show no PR indicator, the tabs use only thread signals, and a short notice above the rows tells the user that PR status needs github-insight

#### Scenario: Merged PR stays visible
- **WHEN** a thread's PR merged more than one hour ago
- **THEN** the row still shows the merged PR status

### Requirement: Summary changes reach the list within seconds
When github-insight writes, changes, or removes the PR summary of an active thread while the list is open, the replacement SHALL update the row and its tab within 10 seconds. This SHALL apply to any write, not only to writes that BB starts. When this signal is not available, the row SHALL still update on the next periodic refresh.

#### Scenario: Poller writes a new summary
- **WHEN** the github-insight background refresh writes a summary that shows checks running for an idle, read thread
- **THEN** the row shows the PR badge and the thread moves to In flight within 10 seconds

#### Scenario: Summary removed
- **WHEN** github-insight removes the summary of a thread because its branch has no PR
- **THEN** the row stops showing a PR badge within 10 seconds

#### Scenario: Summary did not change
- **WHEN** github-insight writes a summary with the same content as before
- **THEN** the list does not load the summaries again because of that write

#### Scenario: Connection lost
- **WHEN** the realtime connection is down while a summary changes, and then it connects again
- **THEN** the list loads the summaries again when it connects

### Requirement: PR status follows the end of an agent turn
When a thread goes idle and its environment branch has a PR, github-insight SHALL refresh that PR at once and SHALL NOT wait for the next periodic refresh. When BB does not yet link a PR to the environment, github-insight SHALL try one more time after a short delay. A failed refresh SHALL keep the last good summary, and the row SHALL catch up on the next periodic refresh.

#### Scenario: Agent opens a PR
- **WHEN** an agent opens a PR in its turn and the thread goes idle
- **THEN** the row shows the PR badge without a wait for the 60 second refresh

#### Scenario: Agent pushes to an existing PR
- **WHEN** an agent pushes a commit to its PR and the thread goes idle
- **THEN** the row shows the new check state from GitHub without a wait for the 60 second refresh

#### Scenario: PR link arrives late
- **WHEN** a thread goes idle and BB links the new PR to the environment a few seconds later
- **THEN** the second try finds the PR and the row shows the PR badge

#### Scenario: No PR
- **WHEN** a thread with no PR on its branch goes idle
- **THEN** the row stays without a PR badge and github-insight makes no GitHub request for that thread

#### Scenario: Refresh rate limited
- **WHEN** a thread goes idle while GitHub rate-limits github-insight
- **THEN** github-insight makes no GitHub request and the row keeps its last status

#### Scenario: Change on GitHub only
- **WHEN** a check finishes on GitHub while the thread stays idle
- **THEN** the row updates after the next periodic refresh
