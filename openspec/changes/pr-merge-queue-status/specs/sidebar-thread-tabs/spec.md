# Spec Delta

## MODIFIED Requirements

### Requirement: PR status decides the tab of an idle thread
When no thread signal rule matches, the replacement SHALL use the github-insight PR summary. A PR with failed checks, requested changes, merge conflicts, unresolved review comments, or a failed merge queue entry SHALL put the thread in Needs attention. Otherwise, a PR with checks running, a required review, or a queued or merging merge queue entry SHALL put the thread in In flight. Every other PR state SHALL put the thread in Needs attention.

#### Scenario: Problem wins over waiting
- **WHEN** an idle, read thread has a PR with failed checks and a required review
- **THEN** the thread is in Needs attention

#### Scenario: Checks running
- **WHEN** an idle, read thread has a PR with checks running and no problem
- **THEN** the thread is in In flight

#### Scenario: Review required
- **WHEN** an idle, read thread has a PR that waits for a required review and has no problem
- **THEN** the thread is in In flight

#### Scenario: PR in a merge queue
- **WHEN** an idle, read thread has a PR with merge queue state `queued`, `awaiting_checks`, or `merging`
- **THEN** the thread is in In flight

#### Scenario: Merge queue failed
- **WHEN** an idle, read thread has a PR with merge queue state `failed`
- **THEN** the thread is in Needs attention

#### Scenario: Ready, draft, merged, or closed PR
- **WHEN** an idle, read thread has a PR that is ready to merge, a draft, merged, or closed
- **THEN** the thread is in Needs attention
