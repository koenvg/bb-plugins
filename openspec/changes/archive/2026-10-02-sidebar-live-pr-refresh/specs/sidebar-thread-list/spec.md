# Spec Delta

## ADDED Requirements

### Requirement: Summary changes reach the list within seconds
When github-insight writes, changes, or removes the PR summary of an active thread while the list is open, the replacement SHALL update the row and its tab within 10 seconds. This SHALL apply to any write, not only to writes that BB starts. When this signal is not available, the row SHALL still update on the next periodic refresh.

#### Scenario: Poller writes a new summary
- **WHEN** the github-insight background refresh writes a summary that shows checks running for an idle, read thread
- **THEN** the row shows the PR badge and the thread moves to In flight within 10 seconds

#### Scenario: Summary removed
- **WHEN** github-insight removes the summary of a thread because its branch has no PR
- **THEN** the row stops showing a PR badge within 10 seconds

#### Scenario: Summary did not change
- **WHEN** github-insight writes a summary with the same content as before
- **THEN** the list does not load the summaries again because of that write

#### Scenario: Connection lost
- **WHEN** the realtime connection is down while a summary changes, and then it connects again
- **THEN** the list loads the summaries again when it connects

### Requirement: PR status follows the end of an agent turn
When a thread goes idle and its environment branch has a PR, github-insight SHALL refresh that PR at once and SHALL NOT wait for the next periodic refresh. When BB does not yet link a PR to the environment, github-insight SHALL try one more time after a short delay. A failed refresh SHALL keep the last good summary, and the row SHALL catch up on the next periodic refresh.

#### Scenario: Agent opens a PR
- **WHEN** an agent opens a PR in its turn and the thread goes idle
- **THEN** the row shows the PR badge without a wait for the 60 second refresh

#### Scenario: Agent pushes to an existing PR
- **WHEN** an agent pushes a commit to its PR and the thread goes idle
- **THEN** the row shows the new check state from GitHub without a wait for the 60 second refresh

#### Scenario: PR link arrives late
- **WHEN** a thread goes idle and BB links the new PR to the environment a few seconds later
- **THEN** the second try finds the PR and the row shows the PR badge

#### Scenario: No PR
- **WHEN** a thread with no PR on its branch goes idle
- **THEN** the row stays without a PR badge and github-insight makes no GitHub request for that thread

#### Scenario: Refresh rate limited
- **WHEN** a thread goes idle while GitHub rate-limits github-insight
- **THEN** github-insight makes no GitHub request and the row keeps its last status

#### Scenario: Change on GitHub only
- **WHEN** a check finishes on GitHub while the thread stays idle
- **THEN** the row updates after the next periodic refresh
