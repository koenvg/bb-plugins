# Spec Delta

## Purpose

Puts the PR state and the PR diff in one side-panel tab with two sub-tabs, so the user reads and reviews one PR without moving between side-panel tabs.

## ADDED Requirements

### Requirement: One PR tab with two sub-tabs

The plugin SHALL add one side-panel action, "PR". Its tab SHALL show a sub-tab bar with "Overview" and "Files" at the top. "Overview" SHALL show the PR status content and the conversation timeline. "Files" SHALL show the PR diff, review threads, comment drafts, and the "Submit review" panel. Only the selected sub-tab SHALL be visible.

#### Scenario: Open the PR tab

- **WHEN** the user opens the PR tab of a thread with a PR
- **THEN** the tab shows the "Overview" and "Files" sub-tabs, and one of them is selected

#### Scenario: Switch sub-tab

- **WHEN** "Overview" is selected and the user clicks "Files"
- **THEN** the tab shows the PR diff and hides the Overview content

### Requirement: No Review side-panel action

The plugin SHALL NOT add a "Review" side-panel action. The new-tab launcher SHALL list "PR" and SHALL NOT list "Review" for this plugin.

#### Scenario: Open the launcher

- **WHEN** the user opens the side-panel new-tab launcher in a thread
- **THEN** the launcher lists "PR" and does not list "Review" from GitHub Insight

### Requirement: Review tab name in other specs

A requirement in another spec that names the "Review tab" or the "PR Review tab" SHALL apply to the "Files" sub-tab of the PR tab. A requirement that names the "PR tab" for status content SHALL apply to the "Overview" sub-tab.

#### Scenario: Viewed files

- **WHEN** a spec says that a file section of the Review tab has a "Viewed" checkbox
- **THEN** each file section of the "Files" sub-tab has a "Viewed" checkbox

### Requirement: Sub-tab stays selected

The PR tab SHALL keep the selected sub-tab of each thread for the rest of the window session: while the tab stays open, when the user switches to another side-panel tab and back, when the user switches threads and back, and when the user closes and opens the PR tab again. An open of the PR tab with no target sub-tab SHALL keep that sub-tab. The first PR tab of a thread in the window SHALL start on "Overview".

#### Scenario: Back to the PR tab

- **WHEN** "Files" is selected, the user selects another side-panel tab, and then selects the PR tab again
- **THEN** "Files" is still selected

#### Scenario: First PR tab of a thread

- **WHEN** the user opens the PR tab of a thread for the first time in the window
- **THEN** "Overview" is selected

#### Scenario: Open with a target sub-tab

- **WHEN** the thread's PR tab was last on "Files", is closed, and the user clicks the PR badge of that thread
- **THEN** the PR tab opens on "Overview" and does not read the PR files

### Requirement: Status entry points open Overview

A click on the PR badge in the sidebar thread list and a click on the PR status in the composer banner SHALL open the PR tab of that thread with "Overview" selected. When the PR tab is already open, they SHALL select it and switch it to "Overview" without a second PR tab.

#### Scenario: Badge with Files selected

- **WHEN** the PR tab is open on "Files" and the user clicks the PR badge of the same thread in the sidebar
- **THEN** the PR tab is selected, shows "Overview", and the panel has one PR tab

#### Scenario: Banner click

- **WHEN** the user clicks the PR status in the composer banner and the PR tab is closed
- **THEN** the PR tab opens on "Overview"

### Requirement: Files loads when first shown

The PR tab SHALL NOT load the PR files and review threads before "Files" is shown, also when the tab opens on "Overview" for a thread whose last sub-tab was "Files". After "Files" has loaded, a switch to "Overview" and back SHALL keep its scroll position, its comment position, its open forms, and the text in them.

#### Scenario: Only Overview shown

- **WHEN** the user opens the PR tab on "Overview" and does not select "Files"
- **THEN** the plugin does not read the PR files or review threads from GitHub

#### Scenario: Back to Files

- **WHEN** the user scrolls "Files" to the third file, types in a reply, switches to "Overview", and switches back to "Files"
- **THEN** "Files" shows the third file at the same place and the reply keeps the typed text

### Requirement: Same PR states in both sub-tabs

Both sub-tabs SHALL show "Loading pull request…" before the first result, "No pull request for this thread" when the thread has no PR, and the error with a retry action when the read fails without a last good result. A sub-tab SHALL NOT show data of another thread.

#### Scenario: No PR

- **WHEN** the thread has no PR and the user selects "Files"
- **THEN** "Files" shows "No pull request for this thread"

### Requirement: Files tab shows the file count

Once the PR loads, the "Files" sub-tab SHALL show the number of changed files. It SHALL show a dot when the PR has unresolved review threads.

#### Scenario: PR with unresolved threads

- **WHEN** the PR changes 18 files and has an unresolved review thread
- **THEN** the "Files" sub-tab shows "18" and a dot
