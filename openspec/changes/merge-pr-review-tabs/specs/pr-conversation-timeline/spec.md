# Spec Delta

## Purpose

Shows the PR conversation in the "Overview" sub-tab of the PR tab, and lets the user add a PR comment, so the user does not need GitHub to follow the discussion on a PR.

## ADDED Requirements

### Requirement: Timeline below the status

"Overview" SHALL show a timeline below the PR status content. The timeline SHALL show PR events oldest first. Each event SHALL show the actor login and the relative time. When the PR has no events, the timeline SHALL show "No conversation yet".

#### Scenario: Events in order

- **WHEN** alice commented 2 hours ago and bob reviewed 1 hour ago
- **THEN** the timeline shows alice's comment above bob's review

#### Scenario: Empty conversation

- **WHEN** the PR has no comments, reviews, commits, or lifecycle events
- **THEN** the timeline shows "No conversation yet"

### Requirement: PR description in its own section

"Overview" SHALL show the PR description in a "Description" section below the merge status, separate from the conversation timeline. It SHALL show the author login, "opened this", the relative time, and the body as Markdown. When the body is empty, it SHALL show "No description provided.". A description taller than 320px SHALL fold, with a "Show full description" control that shows all of it.

#### Scenario: PR with a description

- **WHEN** koenvg opened the PR with the description "Fixes the total."
- **THEN** the Description section shows "koenvg opened this" and "Fixes the total.", and the conversation does not show it

#### Scenario: PR without a description

- **WHEN** the PR description is empty
- **THEN** the Description section shows "No description provided."

#### Scenario: Long description

- **WHEN** the description is taller than 320px and the user clicks "Show full description"
- **THEN** the whole description shows, and the control changes to "Show less"

### Requirement: Event types

The timeline SHALL show these events and no other events: PR comments, submitted reviews, commit pushes, "ready for review", "closed", "reopened", and "merged".

#### Scenario: Label added

- **WHEN** a person adds a label to the PR
- **THEN** the timeline does not show that event

#### Scenario: PR merged

- **WHEN** the PR is merged by alice
- **THEN** the timeline shows a "merged" event by alice as the last event

### Requirement: Comment events

A PR comment event SHALL show the comment body as Markdown, and a link that opens the comment on GitHub.

#### Scenario: Comment with code

- **WHEN** a PR comment has a fenced code block
- **THEN** the timeline shows the code block formatted as code

### Requirement: Review events

A review event SHALL show the verdict (approved, changes requested, commented, or dismissed) and the review body as Markdown. When the review has inline comments, the event SHALL show "N inline comments". A click on it SHALL select "Files" and jump to the first inline comment of that review that "Files" shows. The timeline SHALL NOT show the inline comments.

#### Scenario: Review with inline comments

- **WHEN** bob requested changes with the body "Split this" and 3 inline comments
- **THEN** the event shows "Changes requested", "Split this", and "3 inline comments", and does not show the inline comment bodies

#### Scenario: Jump to inline comments

- **WHEN** the user clicks "3 inline comments" on bob's review
- **THEN** "Files" is selected and shows the first of those comments at the top of the diff area

#### Scenario: Inline comments all resolved

- **WHEN** the user clicks "3 inline comments" and all 3 threads are resolved and "Show resolved" is off
- **THEN** "Files" is selected and turns on "Show resolved" before the jump

### Requirement: Grouped commit pushes

Commit events next to each other in the timeline SHALL show as one event with the number of commits, and SHALL expand to list each commit's short hash and first message line.

#### Scenario: Three commits in a row

- **WHEN** the author pushed 3 commits and no other event is between them
- **THEN** the timeline shows one "3 commits" event that expands to 3 commit lines

### Requirement: Long timelines

The timeline SHALL load the most recent 100 events. When the PR has more, the timeline SHALL show "Load older events" at the top. A click SHALL load the next 100 older events above.

#### Scenario: Busy PR

- **WHEN** the PR has 250 timeline events
- **THEN** the timeline shows the most recent 100 events and "Load older events"

### Requirement: Timeline refresh

The timeline SHALL load with the PR status and refresh when the PR status refreshes. A failed timeline read SHALL show the error and a retry action in the timeline, and SHALL NOT hide the PR status.

#### Scenario: Timeline read fails

- **WHEN** the PR status loads and the timeline read fails
- **THEN** "Overview" shows the PR status, and the timeline shows the error and "Retry"

### Requirement: Post a PR comment

Below the timeline, "Overview" SHALL show a comment box and a "Comment" button. The button SHALL be disabled while the box is empty. A click SHALL post the text as a PR comment on GitHub, clear the box, and show the new comment in the timeline. When the post fails, the box SHALL keep the text and show the error.

#### Scenario: Post a comment

- **WHEN** the user types "Thanks, fixed" and clicks "Comment"
- **THEN** GitHub gets one PR comment "Thanks, fixed", the box is empty, and the timeline shows the comment as the last event

#### Scenario: Post fails

- **WHEN** GitHub rejects the comment
- **THEN** the box keeps "Thanks, fixed" and shows the GitHub error

#### Scenario: Locked conversation

- **WHEN** the PR conversation is locked and the viewer cannot comment
- **THEN** "Overview" shows that the conversation is locked and does not show the comment box

### Requirement: One post for each click

A click on "Comment" SHALL send at most one comment. The button SHALL be disabled while the post runs.

#### Scenario: Double click

- **WHEN** the user clicks "Comment" twice quickly
- **THEN** GitHub gets one comment
