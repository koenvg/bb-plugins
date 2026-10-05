# changes-diff-view Specification

## Purpose

Shows the diff of a bb thread's environment in a Changes tab of the thread's right panel, file by file, so the user can review the agent's work there.

## Requirements

### Requirement: Changes tab in the thread panel

The plugin SHALL add a "Changes" entry to the right-panel new-tab Actions list of an existing thread. Opening it SHALL show the diff of that thread's environment. It SHALL NOT be offered on the root New thread screen.

#### Scenario: Open the tab

- **WHEN** the user opens "Changes" from the new-tab list of a thread with a git worktree
- **THEN** a Changes tab opens and shows the changed files of that worktree

#### Scenario: Environment is not a git repository

- **WHEN** the thread's environment is not a git repository
- **THEN** the tab shows "No git repository for this thread" and no diff

### Requirement: Diff target picker

The tab SHALL have a picker with the targets "All changes", "Uncommitted", "Committed on branch", and one entry per commit of the branch. The default SHALL be "All changes". Branch targets SHALL compare against the merge base with the base branch of the thread's environment.

#### Scenario: Default target

- **WHEN** the tab opens
- **THEN** the picker shows "All changes" and the diff contains committed and uncommitted changes against the merge base

#### Scenario: Select one commit

- **WHEN** the user selects commit `abc1234` in the picker
- **THEN** the diff shows only the changes of that commit

### Requirement: One section per changed file

The tab SHALL show one section per changed file, in the order the environment returns them. Each section SHALL have a header with the path, the previous path for a rename, and the added and deleted line counts. The header SHALL stay visible while its section scrolls. The top of the tab SHALL show the file count and the total added and deleted lines.

#### Scenario: Renamed file

- **WHEN** a file moved from `src/old.ts` to `src/new.ts` with 3 changed lines
- **THEN** its header shows `src/old.ts` and `src/new.ts` and the counts of that file

#### Scenario: Summary line

- **WHEN** the diff has 2 files with 34 added and 5 deleted lines
- **THEN** the top of the tab shows "2 files", "+34" in the success color, and "-5" in the destructive color

### Requirement: File content that cannot show as a diff

A binary file SHALL show "Binary file" instead of a diff. A file that is too large SHALL show "Diff too large" instead of a diff. A file whose patch the environment loads on demand SHALL load its patch when its section comes near the visible area.

#### Scenario: Binary file

- **WHEN** the diff contains a changed PNG file
- **THEN** its section shows "Binary file" and no lines

#### Scenario: Large file loads on demand

- **WHEN** a file has an on-demand patch and the user scrolls to it
- **THEN** the tab loads that patch and shows its lines

### Requirement: Refresh the diff

The tab SHALL load the diff when it opens and when the user clicks the refresh button. While a load runs, the last diff SHALL stay visible. When a load fails, the tab SHALL show the error and a retry button.

#### Scenario: Agent changed files

- **WHEN** the agent changes a file and the user clicks refresh
- **THEN** the tab shows the new diff of that file

#### Scenario: Load fails

- **WHEN** the environment diff call fails with "permission denied"
- **THEN** the tab shows the error message and a retry button

### Requirement: Unified and split view

The tab SHALL have a control to switch between unified and split view. The default SHALL be unified.

#### Scenario: Switch to split view

- **WHEN** the user selects split view
- **THEN** every file section shows the old and new lines side by side
