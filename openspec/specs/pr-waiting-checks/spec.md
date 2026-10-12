# pr-waiting-checks Specification

## Purpose

Finds pending commit statuses that wait for a person, not for a machine, and reports them as waiting so the user sees that the PR needs them.

## Requirements

### Requirement: Quiet pending status is waiting

github-insight SHALL give the status "waiting" to a pending commit status when no check run of the PR is still running and the last update of that status is 3 minutes old or more. A pending commit status that does not meet both conditions SHALL stay "running". Check runs SHALL never be "waiting". The rule SHALL use no settings and no check name, text, or URL.

#### Scenario: Status waits after CI is done

- **WHEN** all check runs are done and the commit status "UI Review" has been pending with no update for 5 minutes
- **THEN** "UI Review" has the status "waiting"

#### Scenario: Status updated recently

- **WHEN** all check runs are done and the commit status "UI Review" was last updated 1 minute ago
- **THEN** "UI Review" has the status "running"

#### Scenario: Check run still running

- **WHEN** the check run "build" is running and the commit status "UI Review" has been pending with no update for 20 minutes
- **THEN** "UI Review" has the status "running"

#### Scenario: Check run never waits

- **WHEN** the check run "e2e" has been queued for 30 minutes and no other check is running
- **THEN** "e2e" has the status "running"

### Requirement: Waiting checks blocker

When a PR has waiting checks, github-insight SHALL add the merge blocker "checks waiting". Its text SHALL be "<name> waiting for you" for one waiting check and "N checks waiting for you" for more. It SHALL come directly after "checks failed" in the blocker order and use the attention tone. Waiting checks SHALL NOT count in the "checks running" blocker.

#### Scenario: One waiting check

- **WHEN** "UI Review" is the only waiting check and no check is running
- **THEN** the blockers include "UI Review waiting for you"
- **AND** the blockers do not include a "checks running" blocker

#### Scenario: Waiting and failed checks

- **WHEN** one check failed and "UI Review" is waiting
- **THEN** the blocker order starts with "1 check failed", then "UI Review waiting for you"

### Requirement: Waiting checks in the PR panel

The PR panel SHALL show a waiting check in the open check groups, with an icon that is different from the running spinner. The banner SHALL show the waiting blocker text.

#### Scenario: Panel shows waiting check

- **WHEN** "UI Review" is waiting
- **THEN** the check list shows "UI Review" open, with the waiting icon and not a spinner
- **AND** the banner shows "UI Review waiting for you"

### Requirement: Waiting checks in the PR summary

The PR summary SHALL report the number of waiting checks and SHALL include the "checks waiting" blocker code. The running count SHALL NOT include waiting checks. The summary format version SHALL stay the same.

#### Scenario: Summary counts

- **WHEN** 1 check is waiting and 0 checks are running
- **THEN** the summary has a waiting count of 1, a running count of 0, and the blocker code for waiting checks

### Requirement: Waiting is found without a manual refresh

A pending status that turns quiet SHALL become "waiting" on the next background refresh of the PR, with no user action and no extra GitHub request.

#### Scenario: Status turns quiet between polls

- **WHEN** the last check run finishes and "UI Review" stays pending with no update
- **THEN** within 3 minutes plus one poll interval the PR summary reports "UI Review" as waiting
