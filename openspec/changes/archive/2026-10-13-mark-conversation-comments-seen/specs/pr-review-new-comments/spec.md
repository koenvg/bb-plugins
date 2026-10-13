# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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
