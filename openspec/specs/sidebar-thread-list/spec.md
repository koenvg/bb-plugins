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

For a thread whose environment branch has a pull request, the replacement SHALL show a compact status and an accessible action to open that thread's PR tab on the thread row. The whole badge SHALL be one action, including its checks, review and conflict indicators, counts, and status text. The status SHALL come from the github-insight PR summary of the thread, not from BB's per-row PR lookup. It SHALL distinguish draft, open with no special attention, checks pending or failed, review requested or changes requested, conflicts or blocked merge, ready to merge, queued in a merge queue, merging, merge queue failed, merged, and closed states. The status SHALL not be mistaken for the thread's execution status.

#### Scenario: Branch has an open PR needing attention

- **WHEN** the github-insight summary reports an open PR with failed checks or requested changes for a thread
- **THEN** its row identifies that PR and communicates the reported attention state in text as well as visual treatment

#### Scenario: Branch has a draft, merged, or closed PR

- **WHEN** the github-insight summary reports a draft, merged, or closed PR
- **THEN** the row identifies the PR and communicates that state without implying it is ready to merge

#### Scenario: PR in a merge queue

- **WHEN** the github-insight summary reports `mergeQueue` with state `queued` or `awaiting_checks` at position 3
- **THEN** the row shows "Queued #3" in the waiting tone and does not claim the PR is ready or blocked
- **AND** for `awaiting_checks` the row also shows a running mark

#### Scenario: PR merging from the queue

- **WHEN** the github-insight summary reports `mergeQueue` with state `merging`
- **THEN** the row shows "Merging" in the ready tone

#### Scenario: Merge queue failed

- **WHEN** the github-insight summary reports `mergeQueue` with state `failed`
- **THEN** the row shows "Queue failed" in the problem tone

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

### Requirement: Thread trees stay together in groups

A thread SHALL show under its parent when the list shows the parent. The whole tree SHALL show in one group. In All, a tree SHALL be in the Needs you group when one or more members need the user. Else a tree with a pinned top thread SHALL be in the Pinned group. Else the project, section, or machine of the top thread SHALL decide the group. The group count SHALL count the members of its trees.

#### Scenario: Child needs the user in All

- **WHEN** the All tab is selected and a child thread waits for an approval
- **THEN** the Needs you group shows the parent with the child under it, and the parent shows in no other group

#### Scenario: Pinned child

- **WHEN** a child thread is pinned and its parent is not pinned
- **THEN** the child shows under its parent in the group of the parent, and not in the Pinned group

#### Scenario: Pinned top thread

- **WHEN** a top thread is pinned and has children
- **THEN** the Pinned group shows the top thread with its children under it

#### Scenario: Child in another project

- **WHEN** the organization is project and a child thread is in a different project than its parent
- **THEN** the child shows under its parent in the group of the parent's project

#### Scenario: Child in another section

- **WHEN** the organization is section and a child thread has a different section than its parent
- **THEN** the child shows under its parent in the section group of the parent

#### Scenario: Hidden parent

- **WHEN** the parent of a thread is hidden
- **THEN** the thread shows as a top-level row

### Requirement: Archived ancestor as a context row

When a shown thread has an ancestor that the lifecycle selection leaves out, and the list has that ancestor in its loaded data, the ancestor SHALL show as a dimmed context row above the thread. A context row SHALL open its thread and SHALL NOT count in its group count. When the ancestor is not loaded, the thread SHALL show as a top-level row.

#### Scenario: Archived parent is loaded

- **WHEN** the All tab with Both is selected, and an active child has an archived parent that is loaded
- **THEN** the parent shows as a normal row with the child under it

#### Scenario: Archived parent left out by the selection

- **WHEN** the All tab with Archived is selected, an archived child has an active parent, and the parent is loaded
- **THEN** the parent shows as a dimmed context row with the child under it, and the group count does not include the parent

#### Scenario: Archived parent not loaded

- **WHEN** the All tab with Active is selected and an active child has an archived parent
- **THEN** the child shows as a top-level row

#### Scenario: Open a context row

- **WHEN** the user activates a context row
- **THEN** BB opens that thread

### Requirement: PR status follows a resolve in BB

When the user resolves or unresolves a review thread from BB, the replacement SHALL update the PR status of the affected thread rows within a few seconds after BB confirms the write. It SHALL not wait for the next periodic refresh. A failed write or a failed refresh SHALL leave the row usable, and the row SHALL catch up on the next periodic refresh.

#### Scenario: Last unresolved thread resolved

- **WHEN** the user resolves the last unresolved review thread of a PR from BB and BB confirms the resolve
- **THEN** the row of that thread stops showing the unresolved threads attention state within a few seconds

#### Scenario: Post and resolve

- **WHEN** the user posts a reply with "Post + resolve" from BB and both the post and the resolve succeed
- **THEN** the row updates the same as for a resolve

#### Scenario: Thread unresolved

- **WHEN** the user unresolves a review thread from BB and BB confirms the write
- **THEN** the row shows the unresolved threads attention state within a few seconds

#### Scenario: Other rows on the same PR

- **WHEN** two visible threads share the PR whose review thread the user resolved
- **THEN** both rows show the updated status

#### Scenario: Resolve write fails

- **WHEN** BB reports that the resolve failed
- **THEN** the row keeps its current status and its navigation remains available

#### Scenario: Resolve outside BB

- **WHEN** a review thread is resolved on GitHub outside BB
- **THEN** the row updates on the next periodic refresh

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
