# Spec Delta

## Purpose

Defines what the PR tab shows at the top and how it lists checks, so the user sees at a glance which PR it is, how big it is, and whether it can merge.

## ADDED Requirements

### Requirement: PR header

The PR tab header SHALL show the PR number, the lifecycle state, the head branch and base branch as `head -> base`, the lines added and removed, the number of changed files, the author login, and the title. For a PR from a fork, the head branch SHALL include the fork owner as `owner:branch`.

#### Scenario: Same-repo PR

- **WHEN** PR #25707 is open from branch `kvg/fix-total` to `main`, adds 42 lines, removes 7 lines, changes 3 files, and is by `koenvg`
- **THEN** the header shows "#25707", "Open", "kvg/fix-total -> main", "+42", "-7", "3 files", "koenvg", and the title

#### Scenario: Fork PR

- **WHEN** the PR head branch `fix` is in the fork of `alice`
- **THEN** the header shows "alice:fix -> main"

#### Scenario: One file

- **WHEN** the PR changes 1 file
- **THEN** the header shows "1 file"

### Requirement: Summary line

Below the header, the PR tab SHALL show one summary line for an open or draft PR. It SHALL show the first merge blocker in the existing blocker order, and "+N more" when there are more. Without blockers, it SHALL show "Ready to merge" or "Ready to enqueue". For a PR in the merge queue, or with auto-merge on, it SHALL show that state instead. A merged or closed PR SHALL show no summary line.

#### Scenario: One blocker

- **WHEN** the only blocker is "Review required"
- **THEN** the summary line shows "Review required"

#### Scenario: Several blockers

- **WHEN** the blockers are "Merge conflicts", "1 check failed", and "Review required"
- **THEN** the summary line shows "Merge conflicts" and "+2 more"

#### Scenario: Ready PR

- **WHEN** an open PR has no blockers and its repository has no merge queue
- **THEN** the summary line shows "Ready to merge"

#### Scenario: Merged PR

- **WHEN** the PR is merged
- **THEN** the tab shows the merged state as before and no summary line

### Requirement: Required checks label

Each check that GitHub reports as required for the PR SHALL show a "required" label in the check list.

#### Scenario: Required check fails

- **WHEN** the required check "build" fails
- **THEN** the failed group shows "build" with a "required" label

#### Scenario: Optional check

- **WHEN** the check "lint-docs" is not required
- **THEN** "lint-docs" shows no "required" label

### Requirement: Passed and skipped checks in one line

The check list SHALL show failed, cancelled, and running checks open, as before. It SHALL show passed and skipped checks as one collapsed line with both counts, for example "52 passed, 2 skipped". Expanding that line SHALL show the passed and skipped checks.

#### Scenario: Only passed and skipped checks

- **WHEN** a PR has 52 passed checks and 2 skipped checks
- **THEN** the check list shows one collapsed line "52 passed, 2 skipped"

#### Scenario: Expand the line

- **WHEN** the user expands "52 passed, 2 skipped"
- **THEN** the tab lists the 52 passed checks and the 2 skipped checks

#### Scenario: Failed check with passed checks

- **WHEN** a PR has 1 failed check and 10 passed checks
- **THEN** the failed check shows open with its failure reason, above the collapsed line "10 passed"
