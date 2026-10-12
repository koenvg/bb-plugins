## MODIFIED Requirements

### Requirement: New activity after the mark

A marked PR SHALL have new activity when, after the mark time, a person other than the user posts a PR comment, a review comment or reply, or a review with text, or when GitHub requests the user's review again. Activity from bots and from the user SHALL NOT count. A review with no text and no comments SHALL NOT count. An inline review comment or reply that the user saw in the Review tab SHALL NOT count. The card SHALL show "New comments" for comments and "Review requested again" for a new request. "Mark reviewed" SHALL set a new mark time, which clears both labels.

#### Scenario: Reply on the user's comment

- **WHEN** the user marked `acme/api#15` reviewed and the author then replies to the user's review comment
- **THEN** after the next refresh, `#15` is in "Needs review" with the label "New comments"

#### Scenario: PR conversation comment from a person

- **WHEN** the user marked `acme/api#15` reviewed and another reviewer then posts a PR comment
- **THEN** after the next refresh, `#15` is in "Needs review" with the label "New comments"

#### Scenario: Bot comment

- **WHEN** the user marked `acme/api#15` reviewed and a bot then posts a PR comment
- **THEN** `#15` stays in "Reviewed"

#### Scenario: Approval with no text

- **WHEN** the user marked `acme/api#15` reviewed and another reviewer then approves with no text and no comments
- **THEN** `#15` stays in "Reviewed"

#### Scenario: The user's own comment

- **WHEN** the user marked `acme/api#15` reviewed and the user then posts a PR comment
- **THEN** `#15` stays in "Reviewed"

#### Scenario: Comment before the mark

- **WHEN** the author replied to the user's comment and the user then marked `acme/api#15` reviewed
- **THEN** `#15` is in "Reviewed"

#### Scenario: Both kinds of activity

- **WHEN** the user marked `acme/api#15` reviewed, the author replies, and the author requests the user's review again
- **THEN** after the next refresh, `#15` is in "Needs review" with "New comments" and "Review requested again"

#### Scenario: Push and a reply

- **WHEN** the user marked `acme/api#15` reviewed at `abc123`, the author pushes `def456`, and the author replies
- **THEN** after the next refresh, `#15` is in "Needs review" with "Updated since review" and "New comments"

#### Scenario: Mark reviewed again

- **WHEN** `acme/api#15` is in "Needs review" with "New comments" and the user selects "Mark reviewed"
- **THEN** `#15` moves to "Reviewed" and the label is gone

#### Scenario: Sidebar shows the return

- **WHEN** the Pull Requests panel is closed and a refresh moves the marked PR `acme/api#15` to "Needs review" because of new activity
- **THEN** the Pull Requests sidebar count shows as an accent pill

#### Scenario: Unmarked PR with a review thread

- **WHEN** `acme/api#15` has a review thread, has no mark, and is not requested, and the author posts a comment
- **THEN** `#15` stays in "Needs review" with no "New comments" label

#### Scenario: User saw all new replies

- **WHEN** the user marked `acme/api#15` reviewed at `abc123`, the author replies twice in review threads, and the user sees both replies in the Review tab
- **THEN** `#15` moves to "Reviewed" and "New comments" is gone

#### Scenario: User saw one of two replies

- **WHEN** the user marked `acme/api#15` reviewed, the author replies twice in review threads, and the user sees only one reply
- **THEN** `#15` stays in "Needs review" with "New comments"

#### Scenario: Conversation comment keeps the label

- **WHEN** the user marked `acme/api#15` reviewed, the author replies in a review thread and posts a PR comment, and the user sees the reply in the Review tab
- **THEN** `#15` stays in "Needs review" with "New comments"

#### Scenario: Seen reply and a new push

- **WHEN** the user marked `acme/api#15` reviewed at `abc123`, the author replies and pushes `def456`, and the user sees the reply
- **THEN** `#15` stays in "Needs review" with "Updated since review" and without "New comments"
