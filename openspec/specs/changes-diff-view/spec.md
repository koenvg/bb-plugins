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

The tab SHALL show one section per changed file, in file outline order: at each folder level, folders come before files, and items with the same kind sort by name. Each section SHALL have a header with the path, the previous path for a rename, and the added and deleted line counts. The header SHALL stay visible while its section scrolls. The top of the tab SHALL show the file count and the total added and deleted lines.

#### Scenario: Renamed file

- **WHEN** a file moved from `src/old.ts` to `src/new.ts` with 3 changed lines
- **THEN** its header shows `src/old.ts` and `src/new.ts` and the counts of that file

#### Scenario: Summary line

- **WHEN** the diff has 2 files with 34 added and 5 deleted lines
- **THEN** the top of the tab shows "2 files", "+34" in the success color, and "-5" in the destructive color

#### Scenario: Folders before files

- **WHEN** the environment returns `README.md`, `src/b.ts`, and `src/ui/a.ts` in this order
- **THEN** the sections show in the order `src/ui/a.ts`, `src/b.ts`, `README.md`

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

### Requirement: File outline in a wide tab

When the tab is at least 768px wide and the diff has one or more files, the tab SHALL show a file outline at the left of the diff. The outline SHALL be a folder tree of the changed files in file outline order. A folder whose only child is one folder SHALL show as one row with the joined path. The outline SHALL scroll apart from the diff. When the tab is narrower than 768px, the tab SHALL show no outline.

#### Scenario: Wide tab

- **WHEN** the tab is 1000px wide and the diff changes `src/ui/lib/a.ts` and `src/ui/lib/b.ts`
- **THEN** the outline shows one folder row `src/ui/lib` and the file rows `a.ts` and `b.ts` under it

#### Scenario: Narrow tab

- **WHEN** the tab is 600px wide
- **THEN** the tab shows no outline and the diff uses the full width

#### Scenario: Tab becomes wide

- **WHEN** the user makes the right panel wider than 768px
- **THEN** the outline shows without a reload

### Requirement: File rows in the outline

Each file row SHALL show a file-type icon, the file name, a status badge, the added and deleted line counts, and the number of pending comments on the file when that number is more than 0. A renamed file SHALL show at its new path. The full path SHALL show as the row's tooltip.

#### Scenario: File with comments

- **WHEN** `src/a.ts` has 12 added lines, 3 deleted lines, and 2 pending comments
- **THEN** its row shows `a.ts`, "+12", "-3", and a comment count of 2

#### Scenario: File without comments

- **WHEN** `src/b.ts` has no pending comments
- **THEN** its row shows no comment count

#### Scenario: File-type icon

- **WHEN** the diff changes `src/a.ts` and `notes.xyz`
- **THEN** the row of `src/a.ts` shows the TypeScript icon and the row of `notes.xyz` shows the generic file icon

### Requirement: Jump to a file

A click on a file row SHALL scroll the diff so that the file's section starts at the top of the diff area. When diffs above the file load and change height after the click, the section SHALL stay at the top until the loads stop or the user scrolls. A folder row SHALL NOT scroll the diff.

#### Scenario: Jump down

- **WHEN** the diff has 30 files and the user clicks the row of the 25th file
- **THEN** the diff shows the 25th file's section at the top

#### Scenario: Diffs above load after the jump

- **WHEN** the user clicks a file row and a diff above that file loads after the scroll
- **THEN** the clicked file's section is still at the top

#### Scenario: User scrolls during the jump

- **WHEN** the user clicks a file row and then scrolls before the loads stop
- **THEN** the diff stays where the user scrolled to

### Requirement: Current file in the outline

The outline SHALL mark the row of the file whose section is at the top of the diff area. The mark SHALL follow when the user scrolls. When the marked row is outside the visible part of the outline, the outline SHALL scroll to show it.

#### Scenario: Scroll the diff

- **WHEN** the user scrolls the diff from `src/a.ts` into `src/b.ts`
- **THEN** the outline marks the row of `src/b.ts` and not the row of `src/a.ts`

#### Scenario: Click a row

- **WHEN** the user clicks the row of `src/c.ts`
- **THEN** the outline marks the row of `src/c.ts`

### Requirement: Status badge on file rows

Each file row SHALL show one letter for the kind of change: "A" for added, "M" for modified, "D" for deleted, "R" for renamed, "C" for copied, "T" for a type change, and "U" for an untracked file. The badge SHALL have the full word as its accessible name.

#### Scenario: Untracked file

- **WHEN** the diff has a new file that git does not track yet
- **THEN** its row shows "U" with the name "Untracked"

#### Scenario: Deleted file

- **WHEN** the diff deletes `src/old.ts`
- **THEN** its row shows "D" with the name "Deleted"

### Requirement: Fold a folder in the outline

A folder row SHALL show a chevron and a folder icon. A click on a folder row SHALL hide or show the rows under it. All folders SHALL be open when the diff loads. A merged folder SHALL show its parts with a separator between them. Folding SHALL NOT change the diff sections.

#### Scenario: Fold a folder

- **WHEN** the user clicks the folder row `src`
- **THEN** the rows under `src` hide, the chevron points right, and the diff still shows the sections of the files in `src`

#### Scenario: Unfold a folder

- **WHEN** the user clicks the folded folder row `src` again
- **THEN** the rows under `src` show again

#### Scenario: Merged folder

- **WHEN** the diff changes only files in `src/ui/lib`
- **THEN** the folder row shows `src`, `ui`, and `lib` with a separator between them

### Requirement: Indent guides in the outline

Each row SHALL show one thin vertical guide for each folder level above it.

#### Scenario: File two levels deep

- **WHEN** the outline shows `src/ui/a.ts` under the folder rows `src` and `ui`
- **THEN** the row of `a.ts` shows 2 guides

### Requirement: Resize the outline

The outline SHALL have a drag handle on its right edge. Dragging the handle SHALL change the outline width, from 240px to 520px, and never leave less than 400px for the diff. Double-clicking the handle SHALL reset the width to 320px. With the handle focused, the left and right arrow keys SHALL change the width by 10px. The width SHALL stay after the tab closes and after a reload.

#### Scenario: Drag wider

- **WHEN** the outline is 320px wide and the user drags the handle 100px to the right
- **THEN** the outline is 420px wide

#### Scenario: Drag past the limit

- **WHEN** the user drags the handle to make the outline 700px wide
- **THEN** the outline is 520px wide

#### Scenario: Reset

- **WHEN** the user double-clicks the handle
- **THEN** the outline is 320px wide

#### Scenario: Width stays

- **WHEN** the user sets the width to 400px and opens the Changes tab again
- **THEN** the outline is 400px wide
