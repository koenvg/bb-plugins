## MODIFIED Requirements

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

## ADDED Requirements

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
Each file row SHALL show the file name, the added and deleted line counts, and the number of pending comments on the file when that number is more than 0. A renamed file SHALL show at its new path. The full path SHALL show as the row's tooltip.

#### Scenario: File with comments
- **WHEN** `src/a.ts` has 12 added lines, 3 deleted lines, and 2 pending comments
- **THEN** its row shows `a.ts`, "+12", "-3", and a comment count of 2

#### Scenario: File without comments
- **WHEN** `src/b.ts` has no pending comments
- **THEN** its row shows no comment count

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
