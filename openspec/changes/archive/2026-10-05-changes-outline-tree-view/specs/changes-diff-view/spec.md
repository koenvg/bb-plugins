## MODIFIED Requirements

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

## ADDED Requirements

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
