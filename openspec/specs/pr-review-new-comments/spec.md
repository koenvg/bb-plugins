# pr-review-new-comments Specification

## Purpose

Shows the user which inline review comments in the PR Review tab are new since they marked the PR reviewed, and records when the user has seen them.

## Requirements

### Requirement: New inline comments

An inline review comment SHALL be new when the PR has a reviewed mark, the comment was posted after the mark time, its author is a person other than the user, and the user has not seen it. Comments from bots and deleted users SHALL NOT be new. A PR with no mark SHALL have no new comments.

#### Scenario: Reply after the mark

- **WHEN** the user marked `acme/api#15` reviewed and the author then replies in a review thread
- **THEN** the reply is new in the Review tab of `#15`

#### Scenario: Comment before the mark

- **WHEN** the author replied in a review thread and the user then marked `acme/api#15` reviewed
- **THEN** the reply is not new

#### Scenario: Bot comment

- **WHEN** the user marked `acme/api#15` reviewed and a bot then posts an inline comment
- **THEN** the bot comment is not new

#### Scenario: The user's own comment

- **WHEN** the user marked `acme/api#15` reviewed and the user then replies in a review thread
- **THEN** the reply is not new

#### Scenario: No mark

- **WHEN** `acme/api#15` has no reviewed mark and the author posts an inline comment
- **THEN** no comment is new

### Requirement: Glow on a new comment

The Review tab SHALL show a glowing border around each new comment. The border SHALL be on the comment, not on the full thread. The glow SHALL stay while the Review tab of that thread is open, also after the comment is seen and after a refresh. When the user prefers reduced motion, the glow SHALL NOT animate.

#### Scenario: One new reply in a thread

- **WHEN** a review thread has 3 comments and only the last one is new
- **THEN** only the last comment has the glowing border

#### Scenario: Glow stays after a refresh

- **WHEN** the user saw a new comment and the Review tab refreshes
- **THEN** the comment still has the glowing border

#### Scenario: Reduced motion

- **WHEN** the user prefers reduced motion and a comment is new
- **THEN** the comment shows a static glowing border

### Requirement: Seeing a new comment

A new comment SHALL become seen when it stays visible for 1.5 seconds without a break while the bb window has focus and the page is visible. A comment SHALL be visible when at least 60% of it is in the diff area, or when it fills at least 60% of the diff area height.

#### Scenario: User stops on the comment

- **WHEN** a new comment is fully in the diff area for 1.5 seconds and the window has focus
- **THEN** the comment is seen and keeps its glow

#### Scenario: User scrolls past

- **WHEN** a new comment is in the diff area for 0.5 seconds and the user scrolls it out
- **THEN** the comment is not seen

#### Scenario: Window without focus

- **WHEN** a new comment is in the diff area and the bb window does not have focus
- **THEN** the comment is not seen until the window has focus for 1.5 seconds

#### Scenario: Comment taller than the diff area

- **WHEN** a new comment is taller than the diff area and fills the full diff area for 1.5 seconds
- **THEN** the comment is seen

### Requirement: Seen comments are stored

The plugin SHALL store the seen comments per PR. A seen comment SHALL NOT be new when the user opens the Review tab again, after a tab or thread switch or a bb reload, and in each review thread of the same PR. "Mark reviewed" and "Mark as needs review" SHALL delete the seen comments of the PR. When the save fails, the comment SHALL be new again the next time the user opens the Review tab.

#### Scenario: Seen, then open the tab again

- **WHEN** the user saw a new comment on `acme/api#15`, switches to the PR tab, and opens the Review tab again
- **THEN** the comment shows no glow

#### Scenario: Mark reviewed resets

- **WHEN** the user saw a new comment on `acme/api#15`, selects "Mark reviewed", and the author then replies again
- **THEN** only the new reply has a glow

#### Scenario: Failed save

- **WHEN** a comment becomes seen, the plugin cannot save it, and the user opens the Review tab again
- **THEN** the comment has a glow

### Requirement: New comments are not hidden

A resolved thread with a new comment SHALL show and be expanded, also when "Show resolved" is off. A viewed file with a new comment SHALL start expanded. After all comments of the thread or file are seen, the thread or file SHALL stay as it is while the Review tab of that thread is open.

#### Scenario: New reply on a resolved thread

- **WHEN** "Show resolved" is off and a resolved thread gets a new reply
- **THEN** the thread shows, expanded, with the glow on the reply

#### Scenario: New comment on a viewed file

- **WHEN** `src/a.ts` is viewed and has a new comment
- **THEN** `src/a.ts` starts expanded and "Viewed" stays checked

#### Scenario: Seen, then reload

- **WHEN** the user saw the new reply on a resolved thread, "Show resolved" is off, and the user reloads bb
- **THEN** the resolved thread does not show
