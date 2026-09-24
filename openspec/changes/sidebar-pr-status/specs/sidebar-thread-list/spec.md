# Spec Delta

## Purpose

Provide a selectable BB thread list that keeps everyday sidebar navigation intact and makes each thread's branch pull request status visible without opening the thread.

## ADDED Requirements

### Requirement: Selectable replacement list
The system SHALL provide a selectable replacement for the scrolling sidebar thread list while leaving BB-owned navigation, new-thread controls, and footer available. The existing bundled list SHALL remain selectable.

#### Scenario: User selects the replacement
- **WHEN** a user chooses the new list under sidebar appearance settings
- **THEN** its thread rows occupy the scrolling list area without replacing the surrounding sidebar controls

#### Scenario: User switches back
- **WHEN** a user selects BB's bundled thread list again
- **THEN** the bundled list displays without uninstalling the replacement plugin

### Requirement: Familiar organization and visibility
The replacement SHALL support the existing list's active and archived visibility, pinned threads, thread nesting, grouping by project, machine, or user section, and collapse and sorting controls. It SHALL keep the user's choices for the replacement across reloads and SHALL not show hidden threads as ordinary rows.

#### Scenario: Grouped thread navigation
- **WHEN** a user selects an organization mode and collapses a group or parent thread
- **THEN** the visible rows follow that organization and hide the collapsed descendants until expanded

#### Scenario: Archived and pinned threads
- **WHEN** a user changes the active or archived filter or pins a thread
- **THEN** the replacement shows the corresponding threads and pinned ordering without duplicating rows in their original group

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
For a thread whose environment branch has a pull request, the replacement SHALL show a compact status and an accessible link to that pull request on the thread row. It SHALL distinguish draft, open with no special attention, checks pending or failed, review requested or changes requested, conflicts or blocked merge, ready to merge, merged, and closed states. The status SHALL not be mistaken for the thread's execution status.

#### Scenario: Branch has an open PR needing attention
- **WHEN** BB reports an open PR with failed checks or requested changes for a thread
- **THEN** its row identifies that PR and communicates the reported attention state in text as well as visual treatment

#### Scenario: Branch has a draft, merged, or closed PR
- **WHEN** BB reports a draft, merged, or closed PR
- **THEN** the row identifies the PR and communicates that state without implying it is ready to merge

#### Scenario: Several threads use one environment
- **WHEN** two visible threads share an environment with a PR
- **THEN** each row presents the status of that environment branch's PR

#### Scenario: Open PR status changes
- **WHEN** BB reports updated PR status while the list remains open
- **THEN** the affected row updates without requiring the user to reopen the thread

#### Scenario: PR link activation
- **WHEN** a user activates the PR link on a thread row
- **THEN** the PR opens without also navigating to the thread

### Requirement: Missing PR data does not disrupt navigation
The replacement SHALL keep thread rows usable when PR lookup is pending, the branch has no PR, or lookup cannot run. It SHALL not present missing PR data as a failed PR status.

#### Scenario: No PR or lookup unavailable
- **WHEN** BB returns no PR for a visible thread
- **THEN** the row shows no PR indicator and its normal thread navigation remains available

#### Scenario: Lookup pending
- **WHEN** PR status has not yet resolved
- **THEN** the row remains usable and does not claim a PR state it cannot verify
