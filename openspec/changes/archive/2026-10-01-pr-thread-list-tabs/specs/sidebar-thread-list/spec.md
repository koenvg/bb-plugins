# Spec Delta

## MODIFIED Requirements

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
