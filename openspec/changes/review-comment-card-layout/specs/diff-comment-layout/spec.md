# Spec Delta

## Purpose

Keeps file diffs readable when comment cards (review threads, comment drafts, pending comments, inline forms) show inside them, in the Changes tab and the PR Review tab.

## ADDED Requirements

### Requirement: Comment cards do not set diff column width

A comment card inside a file diff SHALL fill the width of the diff column it is in. The content of the card SHALL NOT make that column wider. In split view, the old and new code columns SHALL keep the widths they have when the file has no comments.

#### Scenario: Wide comment on the new side in split view

- **WHEN** the Review tab shows a file in split view, and a review thread on a new-side line has a code block with a 300-character line
- **THEN** the old code column keeps the same width it has with no comments, and the old code wraps as it does with no comments

#### Scenario: Long unbroken text in a comment

- **WHEN** a comment card has a 200-character path with no spaces
- **THEN** the card stays inside its diff column, and the path wraps inside the card

### Requirement: Wide code blocks scroll inside the comment

A code block in a review comment that is wider than its card SHALL scroll horizontally inside the card. The code block SHALL NOT be cut off, and it SHALL NOT make the diff scroll horizontally.

#### Scenario: Read a wide code block

- **WHEN** a review comment has a code block wider than its card
- **THEN** the user can scroll the code block horizontally to read all of each line, and the diff around it does not scroll horizontally

### Requirement: Review tab diffs have no add-comment gutter

The PR Review tab SHALL NOT show a gutter control to add a comment on a diff line. This is the same behavior as before this change.

#### Scenario: Hover a diff line in the Review tab

- **WHEN** the user moves the pointer over a diff line in the Review tab
- **THEN** no add-comment control shows in the gutter

### Requirement: Review tab keeps split view

The PR Review tab SHALL show file diffs in split view.

#### Scenario: Open the Review tab

- **WHEN** the user opens the Review tab on a PR with a changed file
- **THEN** the file diff shows old and new code side by side
