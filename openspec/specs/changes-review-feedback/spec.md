# changes-review-feedback Specification

## Purpose

Lets the user write review comments on lines of the Changes tab diff, collect them as a pending review, and send them to the thread's agent as one message.

## Requirements

### Requirement: Start a comment on a line
When the pointer is on a diff line, the gutter SHALL show a "+" button. Clicking it SHALL open a comment form below that line. A comment SHALL be on one line and one side: the new side for added and context lines, the old side for deleted lines. Only one form SHALL be open per line and side.

#### Scenario: Comment on an added line
- **WHEN** the user clicks "+" on added line 42 of `src/a.ts`
- **THEN** a comment form opens below new line 42 of `src/a.ts`

#### Scenario: Comment on a deleted line
- **WHEN** the user clicks "+" on deleted line 10 of `src/a.ts`
- **THEN** a comment form opens below old line 10 of `src/a.ts`

### Requirement: Add a comment to the pending review
The comment form SHALL have a text box, "Add to review", and "Cancel". "Add to review" SHALL add the comment to the pending review of the thread and close the form. It SHALL be disabled while the text is empty or only white space. Cmd/Ctrl+Enter SHALL add the comment. Escape SHALL cancel the form.

#### Scenario: Add a comment
- **WHEN** the user types "Null check missing" and clicks "Add to review"
- **THEN** the form closes and the comment shows below its line as a pending comment

#### Scenario: Empty text
- **WHEN** the comment text is only spaces
- **THEN** "Add to review" is disabled

#### Scenario: Cancel
- **WHEN** the user presses Escape in the form
- **THEN** the form closes and the pending review does not change

### Requirement: Unsent form text stays with its line
The text of an open comment form SHALL stay when the file section scrolls out of view, when the diff refreshes, and when the user switches tabs or threads, until the user adds or cancels the comment or bb reloads.

#### Scenario: Switch tab and back
- **WHEN** the user types text in a form, opens the PR tab, and comes back to the Changes tab
- **THEN** the form is open on the same line with the same text

### Requirement: Show and remove pending comments
Each pending comment SHALL show below its line with its text and a remove button. Remove SHALL delete the comment from the pending review. The top of the tab SHALL show the number of pending comments.

#### Scenario: Remove a comment
- **WHEN** the user clicks remove on a pending comment
- **THEN** the comment leaves the diff and the pending count goes down by 1

### Requirement: Pending review lifetime
The pending review SHALL belong to one thread. It SHALL stay when the user switches tabs or threads and when the diff target or the diff changes. It SHALL be lost when bb reloads.

#### Scenario: Switch thread and back
- **WHEN** the user adds 2 comments, opens another thread, and comes back
- **THEN** the Changes tab of the first thread shows the same 2 pending comments

#### Scenario: Other thread
- **WHEN** thread A has 2 pending comments and the user opens the Changes tab of thread B
- **THEN** thread B shows 0 pending comments

### Requirement: Pending comments outside the current diff
A pending comment whose file or line is not in the current diff SHALL show in a "Not in this diff" section at the top of the tab, with its path, line, side, and text. It SHALL stay in the pending review and in the review prompt.

#### Scenario: Line gone after refresh
- **WHEN** a comment is on new line 42 of `src/a.ts` and, after a refresh, line 42 is not in the diff
- **THEN** the comment shows in "Not in this diff" with `src/a.ts`, line 42, and its text

#### Scenario: Other diff target
- **WHEN** the user adds a comment under "All changes" and then selects a commit that does not change that file
- **THEN** the comment shows in "Not in this diff"

### Requirement: Review prompt
"Send feedback (N)" SHALL show N, the number of pending comments, and SHALL be disabled when N is 0. Clicking it SHALL open a dialog with the review prompt in an editable text box. The prompt SHALL start with "Please address the following review comments:" and list each comment as a numbered line `` `path:line` - text ``, with " (deleted line)" after the line number for old-side comments, in file order and then line order. It SHALL end with an instruction to check each comment against the current code first, fix the valid ones at their location, and explain why for each comment that is invalid, stale, or already addressed.

#### Scenario: Prompt content
- **WHEN** the pending review has a comment "Null check missing" on new line 42 of `src/a.ts` and a comment "Why remove this?" on old line 10 of `src/b.ts`
- **THEN** the prompt lists `` 1. `src/a.ts:42` - Null check missing `` and `` 2. `src/b.ts:10 (deleted line)` - Why remove this? ``

#### Scenario: Nothing pending
- **WHEN** the pending review is empty
- **THEN** "Send feedback (0)" is disabled

### Requirement: Send the review to the agent
"Send to agent" in the dialog SHALL send the text of the text box, with the user's edits, to the thread as one user message, and close the dialog. Cmd/Ctrl+Enter SHALL send. When the agent is busy, bb SHALL queue the message, and the tab SHALL show "Queued until the agent is idle". The send SHALL NOT commit, push, or write to GitHub.

#### Scenario: Agent idle
- **WHEN** the user clicks "Send to agent" and the agent is idle
- **THEN** the thread gets one message with the prompt text and the tab shows "Sent to agent"

#### Scenario: Agent busy
- **WHEN** the user clicks "Send to agent" while the agent runs a turn
- **THEN** the message is queued and the tab shows "Queued until the agent is idle"

#### Scenario: Edited prompt
- **WHEN** the user adds "Also run the tests." to the prompt and sends it
- **THEN** the thread message contains that sentence

### Requirement: Clear sent comments
After a successful send, the comments that were in the prompt SHALL leave the pending review and the diff. When the send fails, all comments SHALL stay pending and the dialog SHALL show the error. Cancel SHALL close the dialog, drop the prompt edits, and keep all comments pending.

#### Scenario: Successful send
- **WHEN** the dialog shows 3 comments and the send succeeds
- **THEN** the 3 comments leave the diff and the pending count is 0

#### Scenario: Cancel the dialog
- **WHEN** the user edits the prompt and clicks Cancel
- **THEN** the dialog closes, all comments stay pending, and the next "Send feedback" shows the prompt without the edits

#### Scenario: Send fails
- **WHEN** the send fails
- **THEN** the dialog stays open with the error and all comments stay pending
