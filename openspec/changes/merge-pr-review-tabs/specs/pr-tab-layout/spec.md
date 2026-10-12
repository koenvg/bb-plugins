# Spec Delta

## MODIFIED Requirements

### Requirement: Summary line

Below the header, the Overview SHALL show one "Merge status" card for an open or draft PR. Its first line SHALL give the verdict: "Can't merge yet" with the number of blockers, "Ready to merge" or "Ready to enqueue", the merge queue state, or the auto-merge state. A draft with no other blocker SHALL show "Draft, not ready for review". Below the verdict, the card SHALL list each merge blocker once, in the existing blocker order, without Draft. A merged or closed PR SHALL show no card.

#### Scenario: One blocker

- **WHEN** the only blocker is "Review required"
- **THEN** the card shows "Can't merge yet" and "1 blocker"
- **AND** the card lists "Review required"

#### Scenario: Several blockers

- **WHEN** the blockers are "Merge conflicts", "1 check failed", and "Review required"
- **THEN** the card shows "Can't merge yet" and "3 blockers"
- **AND** the card lists all three blockers in that order, and the Overview shows "1 check failed" once

#### Scenario: Ready PR

- **WHEN** an open PR has no blockers and its repository has no merge queue
- **THEN** the card shows "Ready to merge" and the merge button

#### Scenario: Merged PR

- **WHEN** the PR is merged
- **THEN** the tab shows the merged state as before and no card

## ADDED Requirements

### Requirement: Blocker fixes in the merge status card

Each blocker row SHALL show the action that clears it, when one exists. "Branch out of date" SHALL show "Update branch" when the branch can update. A failed, running, or waiting check blocker SHALL open in place, on a click, to list the checks with that status and their failure details. "Review required" and "Changes requested" SHALL list the reviewers below the row, always open, and the separate Reviewers section SHALL then not show. "Merge conflicts" SHALL link to the PR's conflict page on GitHub. Unresolved threads SHALL show "Open in Files".

#### Scenario: Branch out of date

- **WHEN** the branch is behind its base and can update
- **THEN** the "Branch out of date" row shows "Update branch", and the Overview shows no other "Update branch" button

#### Scenario: Show failed checks

- **WHEN** the user clicks the "2 checks failed" row
- **THEN** the row opens and lists the 2 failed checks with their failure details
- **AND** a second click closes it

#### Scenario: Review required

- **WHEN** the blockers include "Review required" and the PR has 2 reviewers
- **THEN** the row lists both reviewers with their state, without a toggle
- **AND** the Overview shows no separate Reviewers section

#### Scenario: Branch can update without a blocker row

- **WHEN** the branch can update and no "Branch out of date" row shows
- **THEN** "Update branch" shows at the bottom of the card

### Requirement: Failure reason shown once

A failed check SHALL NOT show its failure reason when one of its annotations has the same message.

#### Scenario: Reason equals annotation

- **WHEN** a failed check has the reason "Process completed with exit code 1." and an annotation with the same message
- **THEN** the check shows that message once, in the annotation

### Requirement: Checks listed once

When the merge status card lists a check blocker, the Checks section SHALL NOT list the checks of that status again. The Checks section summary SHALL still count all checks.

#### Scenario: Failed checks in the card

- **WHEN** the PR has 2 failed checks and 50 passed checks
- **THEN** the card's "2 checks failed" row holds the 2 failed checks, and the Checks section shows only the collapsed "50 passed" line with the summary "2 failed · 50 passed"
