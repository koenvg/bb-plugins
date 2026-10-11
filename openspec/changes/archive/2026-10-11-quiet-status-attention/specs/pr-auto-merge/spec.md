# Spec Delta

## MODIFIED Requirements

### Requirement: Enable auto-merge button

The PR tab SHALL show an "Enable auto-merge" button when the PR is open and not a draft, the repository allows auto-merge and has no merge queue, auto-merge is off, the user's default merge method is allowed, and every blocker is "checks running", "checks waiting", or "review required". The label SHALL name the method, for example "Enable auto-merge (squash)". The tab SHALL NOT show the button in any other case.

#### Scenario: Waiting for checks

- **WHEN** an open PR has only the blocker "3 checks running", the repository allows auto-merge, and the default method is squash
- **THEN** the tab shows "Enable auto-merge (squash)"

#### Scenario: Check waits for the user

- **WHEN** an open PR has only the blocker "UI Review waiting for you", the repository allows auto-merge, and the default method is squash
- **THEN** the tab shows "Enable auto-merge (squash)"

#### Scenario: Failed check

- **WHEN** an open PR has the blocker "1 check failed"
- **THEN** the tab shows no "Enable auto-merge" button

#### Scenario: Repository does not allow auto-merge

- **WHEN** the repository setting for auto-merge is off
- **THEN** the tab shows no "Enable auto-merge" button

#### Scenario: Merge queue repository

- **WHEN** the PR requires a merge queue
- **THEN** the tab shows no "Enable auto-merge" button
