# pr-review-comment-navigation Specification

## Purpose

Lets the user move from comment to comment in the PR Review tab, so they can find each comment draft and open review thread without scrolling through every file.

## Requirements

### Requirement: Comments are in page order

The Review tab SHALL put its comments in one list, in the order they show on the page: older comment drafts first, then outdated threads, then the comments of each file in file order. In a file, comments SHALL be sorted by line, old side before new side on the same line, and review threads before comment drafts on the same line and side. A comment is a comment draft or a review thread that is not resolved. When "Show resolved" is on, resolved threads SHALL also be in the list.

#### Scenario: Drafts and threads in one order

- **WHEN** file `a.ts` has an open thread on line 40 and a comment draft on line 12, file `b.ts` has an open thread on line 7, and there is one outdated thread
- **THEN** the order is: the outdated thread, the `a.ts` draft on line 12, the `a.ts` thread on line 40, the `b.ts` thread on line 7

#### Scenario: Resolved threads follow the switch

- **WHEN** a file has one open thread and one resolved thread, and "Show resolved" is off
- **THEN** the list has only the open thread
- **WHEN** the user turns "Show resolved" on
- **THEN** the list has both threads

### Requirement: Comment stepper in the header

When the list has one or more comments, the Review tab header SHALL show a counter `<position> / <total>` with a "Previous comment" button and a "Next comment" button. When the list is empty, the header SHALL NOT show the counter or the buttons.

#### Scenario: Stepper with comments

- **WHEN** the Review tab has 11 comment drafts and 1 open thread
- **THEN** the header shows `/ 12` with a "Previous comment" button and a "Next comment" button

#### Scenario: No comments

- **WHEN** the Review tab has no comment drafts and no open threads, and "Show resolved" is off
- **THEN** the header shows no counter and no stepper buttons

### Requirement: Position follows the scroll

The counter SHALL show the position of the current comment: the first comment in the list whose place on the page is at or below the top of the diff area. A comment in a file diff that has not loaded yet SHALL use the place of its file. When no comment is at or below the top, the current comment SHALL be the last comment. The counter SHALL update when the user scrolls.

#### Scenario: User scrolls by hand

- **WHEN** the user scrolls the diff area so that the top of the diff area is below comment 3 and above comment 4
- **THEN** the counter shows `4 / <total>`

#### Scenario: Comment in a file that has not loaded

- **WHEN** the top of the diff area is at the start of file 40, and file 40 has a comment but its diff has not loaded yet
- **THEN** the counter shows the position of the first comment of file 40

### Requirement: Next and previous go from the scroll position

"Next comment" SHALL jump to the current comment when it is below the top of the diff area, and else to the comment after it. "Previous comment" SHALL jump to the current comment when it is above the top of the diff area, and else to the comment before it. A comment in a file diff that has not loaded SHALL count as below the top when its file starts at or below the top. "Next comment" on the last comment SHALL jump to the first comment. "Previous comment" on the first comment SHALL jump to the last comment.

#### Scenario: Next after a manual scroll

- **WHEN** the user jumps to comment 3, scrolls by hand until comment 7 is the first comment below the top of the diff area, and clicks "Next comment"
- **THEN** the tab jumps to comment 7

#### Scenario: Next from a comment at the top

- **WHEN** comment 7 is at the top of the diff area and the user clicks "Next comment"
- **THEN** the tab jumps to comment 8

#### Scenario: Next with the first file not loaded

- **WHEN** the first file starts at the top of the diff area, its diff has not loaded, and it has a comment
- **THEN** "Next comment" jumps to that comment

#### Scenario: Wrap at the end

- **WHEN** the current comment is the last comment and the user clicks "Next comment"
- **THEN** the tab jumps to the first comment

#### Scenario: Scrolled past all comments

- **WHEN** the user scrolls below the last comment
- **THEN** "Next comment" jumps to the first comment, and "Previous comment" jumps to the last comment

#### Scenario: Wrap at the start

- **WHEN** the current comment is the first comment and the user clicks "Previous comment"
- **THEN** the tab jumps to the last comment

### Requirement: Jump shows the comment

A jump SHALL scroll the diff area so that the whole comment card shows at the top of the diff area, below the sticky header of its file, and SHALL highlight the card for a short time. When file diffs above the comment load and change height after the jump, the card SHALL stay at the top until the user scrolls or presses a key. A jump SHALL NOT change the text of a comment draft that the user is editing.

#### Scenario: Jump to a comment in a far file

- **WHEN** the user jumps to a comment in file 57 of 93, and the diffs of files 1 to 56 have not loaded
- **THEN** after the diffs near file 57 load, the comment card starts just below the sticky header of file 57 and is highlighted

#### Scenario: Sticky file header does not cover the card

- **WHEN** the user jumps to a comment in a file diff with a sticky file header
- **THEN** the header of the comment card (author and time) shows below the file header, not under it

#### Scenario: User scrolls during a jump

- **WHEN** the user turns the mouse wheel while the tab keeps a jumped comment at the top
- **THEN** the tab stops keeping the comment at the top and follows the user's scroll

#### Scenario: Jump while editing a draft

- **WHEN** the user types in a comment draft and then clicks "Next comment"
- **THEN** the tab jumps, and the draft keeps the typed text

### Requirement: Palette commands for next and previous comment

The plugin SHALL add the palette commands "GitHub: Next comment" and "GitHub: Previous comment". They SHALL be available only when the thread has a PR. A command SHALL open the Review tab when it is not open, then do the same jump as the matching stepper button. The commands SHALL NOT have a default keyboard shortcut.

#### Scenario: Next comment from the palette with the Review tab closed

- **WHEN** the thread has a PR with open threads, the Review tab is closed, and the user runs "GitHub: Next comment"
- **THEN** the Review tab opens and jumps to the first comment at or below the top of the diff area

#### Scenario: Thread without a PR

- **WHEN** the thread has no PR
- **THEN** the palette does not offer "GitHub: Next comment" or "GitHub: Previous comment"

#### Scenario: No comments in the Review tab

- **WHEN** the user runs "GitHub: Next comment" and the Review tab has no comments
- **THEN** the Review tab opens and does not scroll
