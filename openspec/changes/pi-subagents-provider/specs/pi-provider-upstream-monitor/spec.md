# Spec Delta

## Purpose

Track the Pi provider fork's upstream baseline and provide weekly change reports for user review without modifying the fork or merging upstream changes automatically.

## ADDED Requirements

### Requirement: Recorded upstream provenance

The fork SHALL record its upstream repository, tracked branch, exact imported commit, imported source path, relevant version information, preserved license attribution, and reviewed upstream contract paths. The baseline SHALL identify the upstream code incorporated into the fork, not merely the last revision inspected by a scheduled check. Local adaptations SHALL be documented separately.

#### Scenario: Initial provider import

- **WHEN** the upstream provider is imported into the standalone package
- **THEN** the committed provenance record identifies that exact source revision and the retained license notice

#### Scenario: User-approved upstream update

- **WHEN** an upstream update is deliberately incorporated and verified
- **THEN** the provenance record is updated to the incorporated revision rather than being advanced merely because a check observed it

### Requirement: Weekly project-scoped check after setup

The project SHALL have one explicitly created weekly BB automation for the fork after its baseline and checker exist in a stable source accessible on the BB server host. The default schedule SHALL be Monday at 09:00 UTC. Setup SHALL record the automation ID and resolved source and SHALL avoid duplicate schedules. Installation and reload SHALL NOT schedule it implicitly, and it SHALL NOT depend on an expiring thread or temporary worktree.

#### Scenario: Fork baseline is ready

- **WHEN** the stable source contains the fork baseline and the checker prerequisites pass
- **THEN** setup creates or reuses one weekly automation owned by this project and records its ID and source

#### Scenario: Baseline or stable source is missing

- **WHEN** automation setup cannot resolve the baseline or stable server-host source
- **THEN** setup reports the blocker and does not create an enabled schedule that assumes the missing prerequisite

#### Scenario: Setup runs a second time

- **WHEN** the same project already has the owned upstream-check automation
- **THEN** setup reuses that record rather than creating a second weekly check

### Requirement: Relevant upstream change report

A check SHALL compare upstream's tracked branch against the incorporated baseline and examine the provider source and the recorded contract paths. Relevant changes SHALL produce a report with baseline and head revisions, affected commits and paths, and a clear statement that review is required. The report SHALL be available in the automation run output. A complete comparison with no relevant change SHALL finish silently without starting an agent.

#### Scenario: Provider implementation changes

- **WHEN** new upstream commits modify the provider since the incorporated baseline
- **THEN** the next successful check reports the affected provider changes and identifies both comparison revisions

#### Scenario: Required upstream contract changes

- **WHEN** a recorded SDK, protocol, runtime-retention, or imported UI/build contract path changes without a provider-directory change
- **THEN** the check still reports that contract change for compatibility review

#### Scenario: No relevant upstream changes

- **WHEN** the complete comparison contains no changes in the watched provider or contract paths
- **THEN** the check produces silent success and does not create an agent thread or a merge operation

### Requirement: Upstream checking is read-only

The check SHALL NOT modify project files, Git state, the provenance baseline, plugin dependencies, or running provider settings. It SHALL NOT merge, cherry-pick, push, create a pull request, install updates, or execute upstream code. Scheduling approval SHALL NOT confer approval to incorporate any reported change.

#### Scenario: Relevant changes are found

- **WHEN** the check reports upstream changes for review
- **THEN** the fork's files, baseline, Git state, and installed plugin remain unchanged

#### Scenario: The fork has uncommitted local work

- **WHEN** a check runs while the stable checkout has local modifications
- **THEN** the checker leaves those modifications and Git state untouched

### Requirement: Incomplete checks are not reported as current

Missing or invalid provenance, upstream unavailability, rate limits, incomplete pagination, comparison truncation, or incompatible history SHALL produce an explicit inconclusive or failed check. The automation SHALL NOT report that the fork is up to date when it could not complete the required comparison. Reports SHALL exclude credentials.

#### Scenario: Upstream history is unavailable

- **WHEN** the recorded baseline cannot be compared to the current branch history
- **THEN** the check reports that comparison is inconclusive rather than claiming no updates exist

#### Scenario: API result is incomplete

- **WHEN** a response is truncated or pagination cannot be completed
- **THEN** the check reports incomplete coverage and does not issue a no-change success result

#### Scenario: Rate limit prevents the check

- **WHEN** upstream access is rate-limited before comparison completes
- **THEN** the automation records a visible failed or inconclusive run without exposing credentials or changing the fork
