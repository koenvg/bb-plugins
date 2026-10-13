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

The plugin SHALL store the seen comments per PR. Inline comments, conversation comments, and review texts SHALL share this store. A seen comment SHALL NOT be new when the user opens the Review tab or the Overview tab again, after a tab or thread switch or a bb reload, and in each review thread of the same PR. "Mark reviewed" and "Mark as needs review" SHALL delete the seen comments of the PR. When the save fails, the comment SHALL be new again the next time the user opens the tab that shows it.

#### Scenario: Seen, then open the tab again

- **WHEN** the user saw a new comment on `acme/api#15`, switches to the PR tab, and opens the Review tab again
- **THEN** the comment shows no glow

#### Scenario: Seen conversation comment, then reload

- **WHEN** the user saw a new PR comment on `acme/api#15` in the Overview tab and reloads bb
- **THEN** the comment card shows no glow

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

### Requirement: New conversation comments

A PR conversation comment, or a submitted review with text, SHALL be new when the PR has a reviewed mark, it was posted after the mark time, its author is a person other than the user, and the user has not seen it. Comments and reviews from bots and deleted users SHALL NOT be new. A review with no text SHALL NOT be a new conversation comment. A PR with no mark SHALL have no new conversation comments.

#### Scenario: PR comment after the mark

- **WHEN** the user marked `acme/api#15` reviewed and another reviewer then posts a PR comment
- **THEN** the comment is new in the Overview Conversation timeline of `#15`

#### Scenario: Review with text after the mark

- **WHEN** the user marked `acme/api#15` reviewed and another reviewer then submits a review with text
- **THEN** the review is new in the Overview Conversation timeline of `#15`

#### Scenario: Approval with no text

- **WHEN** the user marked `acme/api#15` reviewed and another reviewer then approves with no text
- **THEN** the review is not new

#### Scenario: PR comment before the mark

- **WHEN** another reviewer posted a PR comment and the user then marked `acme/api#15` reviewed
- **THEN** the comment is not new

#### Scenario: Bot PR comment

- **WHEN** the user marked `acme/api#15` reviewed and a bot then posts a PR comment
- **THEN** the comment is not new

#### Scenario: The user's own PR comment

- **WHEN** the user marked `acme/api#15` reviewed and the user then posts a PR comment
- **THEN** the comment is not new

#### Scenario: No mark

- **WHEN** `acme/api#15` has no reviewed mark and the author posts a PR comment
- **THEN** no comment is new

### Requirement: Glow in the Overview timeline

The Overview Conversation timeline SHALL show a glowing border around the card of each new conversation comment and each new review. The glow SHALL stay while the PR tab of that thread is open, also after the card is seen and after a refresh. When the user prefers reduced motion, the glow SHALL NOT animate.

#### Scenario: One new PR comment

- **WHEN** the timeline has 3 PR comments and only the last one is new
- **THEN** only the card of the last comment has the glowing border

#### Scenario: Glow stays after a refresh

- **WHEN** the user saw a new PR comment and the Overview tab refreshes
- **THEN** the card still has the glowing border

#### Scenario: Reduced motion

- **WHEN** the user prefers reduced motion and a PR comment is new
- **THEN** the card shows a static glowing border

### Requirement: Seeing a new conversation comment

A new conversation comment or review SHALL become seen when its card stays visible for 1.5 seconds without a break while the Overview tab is selected, the bb window has focus, and the page is visible. A card SHALL be visible when at least 60% of it is in the Overview scroll area, or when it fills at least 60% of the Overview scroll area height.

#### Scenario: User stops on the comment

- **WHEN** a new PR comment card is fully in the Overview scroll area for 1.5 seconds and the window has focus
- **THEN** the comment is seen and keeps its glow

#### Scenario: User scrolls past

- **WHEN** a new PR comment card is in the Overview scroll area for 0.5 seconds and the user scrolls it out
- **THEN** the comment is not seen

#### Scenario: Files sub-tab selected

- **WHEN** a new PR comment card is in the Overview scroll area and the user selects the Files sub-tab before 1.5 seconds
- **THEN** the comment is not seen

#### Scenario: Long review text

- **WHEN** a new review card is taller than the Overview scroll area and fills the full scroll area for 1.5 seconds
- **THEN** the review is seen
