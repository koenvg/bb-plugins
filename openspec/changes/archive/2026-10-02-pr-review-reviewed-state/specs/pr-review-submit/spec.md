## ADDED Requirements

### Requirement: Submit marks the PR reviewed
After a successful submit on a PR where the viewer is not the author, the plugin SHALL mark that PR reviewed at the commit of the submitted review. The Pull Requests panel SHALL show the new state without waiting for its next background refresh. When the mark cannot be saved, the submit SHALL still count as successful and the Review tab SHALL tell the user to use "Mark reviewed" in the Pull Requests panel.

#### Scenario: Approve marks reviewed
- **WHEN** the user submits Approve on `acme/api#15` at head `abc123`
- **THEN** `#15` is in "Reviewed" in the Pull Requests panel

#### Scenario: Submit on older drafts
- **WHEN** the comment drafts are at `abc123`, the head is `def456`, and the user submits
- **THEN** the PR is marked reviewed at `abc123` and shows in "Needs review" with "Updated since review"

#### Scenario: Comment on your own PR
- **WHEN** the viewer is the PR author and submits Comment
- **THEN** the plugin does not mark the PR reviewed

#### Scenario: Mark save fails
- **WHEN** GitHub accepts the review and the plugin cannot save the mark
- **THEN** the Review tab shows the review as submitted and tells the user to use "Mark reviewed"
