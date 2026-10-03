# Spec Delta

## ADDED Requirements

### Requirement: PR status follows a resolve in BB
When the user resolves or unresolves a review thread from BB, the replacement SHALL update the PR status of the affected thread rows within a few seconds after BB confirms the write. It SHALL not wait for the next periodic refresh. A failed write or a failed refresh SHALL leave the row usable, and the row SHALL catch up on the next periodic refresh.

#### Scenario: Last unresolved thread resolved
- **WHEN** the user resolves the last unresolved review thread of a PR from BB and BB confirms the resolve
- **THEN** the row of that thread stops showing the unresolved threads attention state within a few seconds

#### Scenario: Post and resolve
- **WHEN** the user posts a reply with "Post + resolve" from BB and both the post and the resolve succeed
- **THEN** the row updates the same as for a resolve

#### Scenario: Thread unresolved
- **WHEN** the user unresolves a review thread from BB and BB confirms the write
- **THEN** the row shows the unresolved threads attention state within a few seconds

#### Scenario: Other rows on the same PR
- **WHEN** two visible threads share the PR whose review thread the user resolved
- **THEN** both rows show the updated status

#### Scenario: Resolve write fails
- **WHEN** BB reports that the resolve failed
- **THEN** the row keeps its current status and its navigation remains available

#### Scenario: Resolve outside BB
- **WHEN** a review thread is resolved on GitHub outside BB
- **THEN** the row updates on the next periodic refresh
