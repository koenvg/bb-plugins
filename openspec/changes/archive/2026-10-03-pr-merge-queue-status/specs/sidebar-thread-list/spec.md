# Spec Delta

## MODIFIED Requirements

### Requirement: Pull request status per thread
For a thread whose environment branch has a pull request, the replacement SHALL show a compact status and an accessible link to that pull request on the thread row. The status SHALL come from the github-insight PR summary of the thread, not from BB's per-row PR lookup. It SHALL distinguish draft, open with no special attention, checks pending or failed, review requested or changes requested, conflicts or blocked merge, ready to merge, queued in a merge queue, merging, merge queue failed, merged, and closed states. The status SHALL not be mistaken for the thread's execution status.

#### Scenario: Branch has an open PR needing attention
- **WHEN** the github-insight summary reports an open PR with failed checks or requested changes for a thread
- **THEN** its row identifies that PR and communicates the reported attention state in text as well as visual treatment

#### Scenario: Branch has a draft, merged, or closed PR
- **WHEN** the github-insight summary reports a draft, merged, or closed PR
- **THEN** the row identifies the PR and communicates that state without implying it is ready to merge

#### Scenario: PR in a merge queue
- **WHEN** the github-insight summary reports `mergeQueue` with state `queued` or `awaiting_checks` at position 3
- **THEN** the row shows "Queued #3" in the waiting tone and does not claim the PR is ready or blocked
- **AND** for `awaiting_checks` the row also shows a running mark

#### Scenario: PR merging from the queue
- **WHEN** the github-insight summary reports `mergeQueue` with state `merging`
- **THEN** the row shows "Merging" in the ready tone

#### Scenario: Merge queue failed
- **WHEN** the github-insight summary reports `mergeQueue` with state `failed`
- **THEN** the row shows "Queue failed" in the problem tone

#### Scenario: Several threads use one environment
- **WHEN** two visible threads share an environment with a PR
- **THEN** each row presents the status of that environment branch's PR

#### Scenario: Open PR status changes
- **WHEN** github-insight writes an updated summary while the list remains open
- **THEN** the affected row and its tab update within the next refresh, without requiring the user to reopen the thread

#### Scenario: PR link activation
- **WHEN** a user activates the PR link on a thread row
- **THEN** the PR opens without also navigating to the thread
