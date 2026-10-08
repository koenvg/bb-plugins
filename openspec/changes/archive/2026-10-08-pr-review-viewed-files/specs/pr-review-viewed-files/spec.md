# Spec Delta

## Purpose

Lets the user mark a file of the PR Review tab as viewed, so that reviewed files collapse and a file that a new push changes shows again.

## ADDED Requirements

### Requirement: Mark a PR file as viewed

Each file section of the Review tab that shows a diff SHALL have a "Viewed" checkbox in its header. Checking it SHALL mark the file as viewed and collapse the section to its header. Unchecking it SHALL remove the mark and expand the section. A viewed section SHALL stay collapsed after a refresh, a tab or thread switch, and a bb reload, while the mark is valid.

#### Scenario: Mark a file

- **WHEN** the user checks "Viewed" on `src/a.ts`
- **THEN** the section of `src/a.ts` shows only its header, with "Viewed" checked

#### Scenario: Unmark a file

- **WHEN** the user unchecks "Viewed" on a viewed `src/a.ts`, also when the user expanded it before
- **THEN** the section of `src/a.ts` shows its diff

#### Scenario: Mark stays after a reload

- **WHEN** the user marks `src/a.ts`, reloads bb, and opens the Review tab of the same thread
- **THEN** `src/a.ts` is collapsed and "Viewed" is checked

#### Scenario: Review threads on a viewed file

- **WHEN** `src/a.ts` is viewed and has 2 open review threads
- **THEN** the header of `src/a.ts` still shows the thread count 2

### Requirement: Expand and collapse a PR file

Each file section of the Review tab that shows a diff SHALL have a button in its header to collapse or expand the section. The button SHALL NOT change the mark. A viewed file SHALL start collapsed and another file SHALL start expanded. A toggle by the button SHALL stay when the user switches tabs or threads, and SHALL be lost when bb reloads, when the user checks or unchecks "Viewed", or when the mark drops.

#### Scenario: Expand a viewed file

- **WHEN** `src/a.ts` is viewed and the user clicks its expand button
- **THEN** the section shows its diff, "Viewed" stays checked, and the counter does not change

#### Scenario: Collapse a file that is not viewed

- **WHEN** the user clicks the collapse button of `src/b.ts`, which is not viewed
- **THEN** the section shows only its header and "Viewed" stays unchecked

#### Scenario: Expanded viewed file after a reload

- **WHEN** the user expands a viewed `src/a.ts` and reloads bb
- **THEN** `src/a.ts` is collapsed

### Requirement: A change to the PR file drops the mark

A mark SHALL be valid only while the GitHub patch of the file is the same as the patch the user marked. When the patch is different, the tab SHALL show the file as not viewed and expanded, and SHALL delete the mark. A mark on a file that is not in the PR anymore SHALL be deleted.

#### Scenario: New push changes a viewed file

- **WHEN** `src/a.ts` is viewed, the author pushes a commit that changes `src/a.ts`, and the user refreshes
- **THEN** `src/a.ts` is expanded and "Viewed" is not checked

#### Scenario: New push does not touch a viewed file

- **WHEN** `src/a.ts` is viewed, the author pushes a commit that changes only `src/b.ts`, and the user refreshes
- **THEN** `src/a.ts` is still viewed and collapsed

#### Scenario: File leaves the PR

- **WHEN** `src/a.ts` is viewed and a push reverts all its changes
- **THEN** after a refresh `src/a.ts` is not in the diff, and when a later push changes it again, it shows as not viewed

### Requirement: Marks are per PR

A mark SHALL belong to one PR, identified by owner, repo and number. All threads that show the Review tab of the same PR SHALL show the same marks. A mark SHALL NOT show on another PR. bb SHALL NOT read or change the "Viewed" state on GitHub.

#### Scenario: Other thread on the same PR

- **WHEN** the user marks `src/a.ts` in the Review tab of thread A for PR #42, and opens the Review tab of thread B for PR #42
- **THEN** `src/a.ts` in thread B is viewed

#### Scenario: Other PR

- **WHEN** the user marks `src/a.ts` on PR #42 and opens the Review tab of PR #43, which also changes `src/a.ts`
- **THEN** `src/a.ts` on PR #43 is not viewed

#### Scenario: GitHub state stays the same

- **WHEN** the user marks `src/a.ts` in the Review tab
- **THEN** the "Viewed" checkbox of `src/a.ts` on github.com does not change

### Requirement: PR files that cannot be marked

A file that GitHub returns without a patch SHALL NOT have a "Viewed" checkbox or a collapse button.

#### Scenario: File without a patch

- **WHEN** the PR changes a PNG file and GitHub returns no patch for it
- **THEN** its section shows "Diff not available" and no "Viewed" checkbox

### Requirement: PR viewed counter

The top of the Review tab SHALL show "N/M viewed" next to the file count. M SHALL be the number of files in the PR that can be marked. N SHALL be the number of those files with a valid mark. When M is 0, the counter SHALL NOT show.

#### Scenario: Counter

- **WHEN** the PR has 4 files, one of them without a patch, and the user marks 2 files
- **THEN** the top of the tab shows "2/3 viewed"

#### Scenario: Counter after a push

- **WHEN** the counter shows "2/3 viewed", a push changes one viewed file, and the user refreshes
- **THEN** the counter shows "1/3 viewed"

### Requirement: Failed viewed save in the Review tab

When the tab cannot save a mark change, the checkbox SHALL go back to its previous state, and the tab SHALL show "Could not save viewed state" with the error.

#### Scenario: Storage fails

- **WHEN** the user checks "Viewed" on `src/a.ts` and the save fails with "disk full"
- **THEN** `src/a.ts` is expanded and not viewed, and the tab shows "Could not save viewed state: disk full"
