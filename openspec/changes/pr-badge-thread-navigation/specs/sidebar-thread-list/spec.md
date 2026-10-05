# Spec delta

## MODIFIED Requirements

### Requirement: Pull request status per thread

For a thread whose environment branch has a pull request, the replacement SHALL show a compact status and an accessible action to open that thread's PR tab on the thread row. The whole badge SHALL be one action, including its checks, review and conflict indicators, counts, and status text. The status SHALL come from the github-insight PR summary of the thread, not from BB's per-row PR lookup. It SHALL distinguish draft, open with no special attention, checks pending or failed, review requested or changes requested, conflicts or blocked merge, ready to merge, merged, and closed states. The status SHALL not be mistaken for the thread's execution status.

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

- **WHEN** a user clicks any indicator, count, status text, or background within a thread row's PR badge
- **THEN** BB opens that row's thread and selects its PR tab
- **AND** the badge does not open GitHub or a new browser tab

#### Scenario: Keyboard activation

- **WHEN** a user focuses a PR badge and activates it with Enter or Space
- **THEN** BB opens that row's thread and selects its PR tab
- **AND** the accessible action name communicates its destination while retaining the PR status

## ADDED Requirements

### Requirement: PR badge navigation targets the clicked thread

PR badge activation SHALL select the PR tab of the clicked row's thread, independently of which thread or panel was previously active. It SHALL open a closed panel and reuse an existing PR tab instead of creating a duplicate. On compact viewports it SHALL close the sidebar drawer as normal thread navigation does. An activation SHALL NOT open the PR tab in a different thread or client, and a consumed activation SHALL NOT reopen the panel on later unrelated navigation. Ordinary thread-title navigation SHALL NOT request the PR tab.

#### Scenario: Another thread is active

- **WHEN** thread A is active and the user activates thread B's PR badge
- **THEN** BB opens thread B and selects thread B's PR tab
- **AND** thread A's panel selection is unchanged

#### Scenario: Clicked thread is already active

- **WHEN** the user activates the active thread's PR badge while its panel is closed or another tab is selected
- **THEN** the panel opens and selects that thread's PR tab

#### Scenario: PR tab already exists

- **WHEN** the clicked thread already has a PR tab and the user activates its badge again
- **THEN** BB focuses that tab without creating another copy

#### Scenario: Compact viewport

- **WHEN** a user activates a PR badge on a compact viewport
- **THEN** BB opens the clicked thread, closes the sidebar drawer, and selects the PR tab

#### Scenario: Shared environment

- **WHEN** two threads share an environment and the user activates the second thread's badge
- **THEN** BB opens the second thread and selects its PR tab, not the first thread's tab

#### Scenario: Destination mounts after navigation

- **WHEN** the clicked thread's PR integration mounts after badge activation
- **THEN** the original activation still selects its PR tab without requiring a second click

#### Scenario: Rapid selection

- **WHEN** a user activates thread B's badge and then thread C's badge before B finishes opening
- **THEN** the latest activation targets thread C and does not later select thread B's PR tab

#### Scenario: Ordinary title navigation

- **WHEN** a user opens a thread using its title rather than its PR badge
- **THEN** normal thread navigation occurs without requesting a PR tab

#### Scenario: Activation already handled

- **WHEN** an activation has selected its PR tab and the user later closes the panel and revisits the thread
- **THEN** that previous activation does not reopen the panel

#### Scenario: PR integration becomes unavailable

- **WHEN** a badge remains visible during removal or failure of the PR integration and the user activates it
- **THEN** the clicked thread remains navigable without an external GitHub fallback or an uncaught navigation error
