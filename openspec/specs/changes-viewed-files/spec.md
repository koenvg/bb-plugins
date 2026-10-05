# changes-viewed-files Specification

## Purpose

Lets the user mark a file of the Changes tab as viewed, so that reviewed files collapse and a file that changes after the review shows again.

## Requirements

### Requirement: Mark a file as viewed
Each file section that shows a diff SHALL have a "Viewed" checkbox in its header. Checking it SHALL mark the file as viewed and collapse the section to its header. Unchecking it SHALL remove the mark and expand the section. A viewed section SHALL stay collapsed after a refresh, a target switch, a tab or thread switch, and a bb reload, while the mark is valid.

#### Scenario: Mark a file
- **WHEN** the user checks "Viewed" on `src/a.ts`
- **THEN** the section of `src/a.ts` shows only its header, with "Viewed" checked

#### Scenario: Unmark a file
- **WHEN** the user unchecks "Viewed" on a viewed `src/a.ts`, also when the user expanded it before
- **THEN** the section of `src/a.ts` shows its diff

#### Scenario: Mark stays after a reload
- **WHEN** the user marks `src/a.ts`, reloads bb, and opens the Changes tab of the same thread with the same target
- **THEN** `src/a.ts` is collapsed and "Viewed" is checked

### Requirement: Expand and collapse a file
Each file section that shows a diff SHALL have a button in its header to collapse or expand the section. The button SHALL NOT change the mark. A viewed file SHALL start collapsed and another file SHALL start expanded. A toggle by the button SHALL stay when the user switches tabs or threads, and SHALL be lost when bb reloads, when the user checks or unchecks "Viewed", or when the mark drops.

#### Scenario: Expand a viewed file
- **WHEN** `src/a.ts` is viewed and the user clicks its expand button
- **THEN** the section shows its diff and "Viewed" stays checked, and the counter does not change

#### Scenario: Collapse a file that is not viewed
- **WHEN** the user clicks the collapse button of `src/b.ts`, which is not viewed
- **THEN** the section shows only its header and "Viewed" stays unchecked

#### Scenario: Expanded viewed file after a reload
- **WHEN** the user expands a viewed `src/a.ts` and reloads bb
- **THEN** `src/a.ts` is collapsed

### Requirement: A change to the file drops the mark
A mark SHALL be valid only while the patch of the file is the same as the patch the user marked. When the patch is different, the tab SHALL show the file as not viewed and expanded, and SHALL delete the mark. A mark on a file that is not in the diff of its target anymore SHALL be deleted.

#### Scenario: Agent edits a viewed file
- **WHEN** `src/a.ts` is viewed, the agent changes one line in it, and the user refreshes
- **THEN** `src/a.ts` is expanded and "Viewed" is not checked

#### Scenario: Edit with the same line counts
- **WHEN** `src/a.ts` is viewed with "+3 -1", and the agent replaces one added line with another line
- **THEN** after a refresh `src/a.ts` is not viewed, also if its counts are still "+3 -1"

#### Scenario: File leaves the diff
- **WHEN** `src/a.ts` is viewed and the agent reverts all its changes
- **THEN** after a refresh `src/a.ts` is not in the diff, and when the agent changes it again, it shows as not viewed

### Requirement: Marks are per thread and per diff target
A mark SHALL belong to one thread and one diff target. A commit target SHALL be identified by its commit sha. A mark on one target SHALL NOT show on another target.

#### Scenario: Other target
- **WHEN** the user marks `src/a.ts` on "All changes" and selects "Uncommitted"
- **THEN** `src/a.ts` on "Uncommitted" is not viewed, and on "All changes" it is still viewed

#### Scenario: Other thread
- **WHEN** the user marks `src/a.ts` in one thread and opens the Changes tab of another thread with the same file path
- **THEN** `src/a.ts` in the other thread is not viewed

### Requirement: Files that cannot be marked
A binary file and a file with "Diff too large" SHALL NOT have a "Viewed" checkbox or a collapse button.

#### Scenario: Binary file
- **WHEN** the diff contains a changed PNG file
- **THEN** its section shows "Binary file" and no "Viewed" checkbox

### Requirement: Viewed counter
The top of the tab SHALL show "N/M viewed" next to the file count. M SHALL be the number of files in the diff that can be marked. N SHALL be the number of those files with a valid mark. When M is 0, the counter SHALL NOT show.

#### Scenario: Counter
- **WHEN** the diff has 4 files, one of them binary, and the user marks 2 files
- **THEN** the top of the tab shows "2/3 viewed"

#### Scenario: Counter after a change
- **WHEN** the counter shows "2/3 viewed" and the agent changes one viewed file and the user refreshes
- **THEN** the counter shows "1/3 viewed"

### Requirement: Failed save
When the tab cannot save a mark change, the checkbox SHALL go back to its previous state, and the tab SHALL show "Could not save viewed state" with the error.

#### Scenario: Storage fails
- **WHEN** the user checks "Viewed" on `src/a.ts` and the save fails with "disk full"
- **THEN** `src/a.ts` is expanded and not viewed, and the tab shows "Could not save viewed state: disk full"
