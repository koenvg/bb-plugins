# Spec Delta

## ADDED Requirements

### Requirement: Sidebar review count

The Pull Requests sidebar row SHALL show the number of PRs in the "Needs review" section, summed across all repository groups. The count SHALL be hidden while no list has loaded and when the count is 0. When the list is truncated, the count SHALL show `50+`.

#### Scenario: PRs wait for review

- **WHEN** "Needs review" holds 10 PRs in one repository and 1 PR in another
- **THEN** the Pull Requests sidebar row shows `11`

#### Scenario: Nothing to review

- **WHEN** "Needs review" is empty
- **THEN** the Pull Requests sidebar row shows no count

#### Scenario: Reviewed PRs do not count

- **WHEN** "Needs review" holds 2 PRs and "Reviewed" holds 3 PRs
- **THEN** the Pull Requests sidebar row shows `2`

#### Scenario: Truncated list

- **WHEN** GitHub reports more review requests than the list limit
- **THEN** the Pull Requests sidebar row shows `50+`

### Requirement: Sidebar badge stays current

The sidebar count and dot SHALL update when a refresh finishes or thread state changes, without the panel being open and without a page reload. When a refresh fails and earlier data exists, the sidebar SHALL keep the state from that earlier data.

#### Scenario: New request arrives while the panel is closed

- **WHEN** the panel is closed and a background refresh adds a PR to "Needs review"
- **THEN** the count increases by one

#### Scenario: Refresh fails

- **WHEN** a refresh fails with "gh not logged in" after an earlier refresh loaded 4 PRs in "Needs review"
- **THEN** the count still shows `4`

### Requirement: Unseen PR accent

The count SHALL show as an accent pill when "Needs review" holds a PR that is not in the seen set. Otherwise the count SHALL use the muted color. A PR is identified by repository and number. New commits on a seen PR SHALL NOT make it unseen.

#### Scenario: A new review request arrives

- **WHEN** the seen set holds every PR in "Needs review" and a refresh adds a new PR
- **THEN** the count shows as an accent pill

#### Scenario: New commits on a seen PR

- **WHEN** a PR in "Needs review" is in the seen set and its author pushes new commits
- **THEN** the count keeps the muted color

### Requirement: Opening the panel marks PRs seen

When the Pull Requests panel shows the list, the seen set SHALL become the PRs then shown in "Needs review". While the panel stays open, PRs that a refresh adds SHALL also become seen. PRs that leave "Needs review" SHALL leave the seen set, so a later request for the same PR counts as unseen.

#### Scenario: User opens the panel

- **WHEN** the count shows as an accent pill and the user opens the Pull Requests panel
- **THEN** the count changes to the muted color

#### Scenario: PR arrives while the panel is open

- **WHEN** the panel is open and a refresh adds a PR to "Needs review"
- **THEN** the count keeps the muted color

#### Scenario: PR is requested again

- **WHEN** a seen PR leaves "Needs review", the panel opens, and later the PR returns to "Needs review" while the panel is closed
- **THEN** the count shows as an accent pill

### Requirement: Returned review thread

A review thread that the plugin started SHALL count as returned when it needs the user, or when its agent stopped running (idle or error) and the user has not opened the thread since the agent stopped. Other linked threads SHALL NOT count as returned.

#### Scenario: Agent finishes

- **WHEN** the agent of the review thread for `acme/api#15` stops and goes idle
- **THEN** the thread counts as returned

#### Scenario: Agent asks a question

- **WHEN** the review thread for `acme/api#15` has a pending question for the user
- **THEN** the thread counts as returned until the user answers

#### Scenario: Branch thread is not a review thread

- **WHEN** a visible thread is linked to `acme/api#15` through its branch and its agent goes idle
- **THEN** the thread does not count as returned

### Requirement: Opening a thread clears returned

Opening a returned review thread in bb SHALL clear its returned state, whether the user opens it from the PR card or another way. When the agent stops while the user has the thread open, the thread SHALL NOT count as returned. A pending question SHALL keep the thread returned until it is answered.

#### Scenario: Open from the card

- **WHEN** the review thread for `acme/api#15` counts as returned and the user selects "Open thread" on its card
- **THEN** the thread no longer counts as returned

#### Scenario: Agent finishes while the thread is open

- **WHEN** the user has the review thread open and its agent goes idle
- **THEN** the thread does not count as returned

#### Scenario: Agent runs again after a follow-up

- **WHEN** the user opened a returned thread, sent a follow-up, closed the thread, and the agent then goes idle
- **THEN** the thread counts as returned again

### Requirement: Returned thread dot

The Pull Requests sidebar row SHALL show a dot, separate from the count, when one or more review threads on the list count as returned. The dot SHALL show even when the count is hidden. The dot SHALL update within seconds of an agent stopping, without waiting for the background GitHub refresh.

#### Scenario: Agent finishes while the panel is closed

- **WHEN** the panel is closed and the agent of a review thread goes idle
- **THEN** the sidebar row shows the dot

#### Scenario: All returned threads opened

- **WHEN** the user opens the last returned review thread
- **THEN** the sidebar row no longer shows the dot

#### Scenario: Returned thread on a reviewed PR

- **WHEN** "Needs review" is empty and a PR in "Reviewed" has a returned review thread
- **THEN** the sidebar row shows the dot and no count

## MODIFIED Requirements

### Requirement: Review requests list content

The PR list SHALL contain each open pull request on GitHub that meets one or more of these conditions: a review from the logged-in `gh` user is requested, the user marked it reviewed, or an unarchived review thread that the plugin started is linked to it. Each PR SHALL show one time only. Each section SHALL group its PRs by repository. In each section, repository groups that hold a PR whose thread needs the user or whose review thread counts as returned SHALL come first. In each group, those PRs SHALL come first. Other PRs SHALL follow, sorted by last update, newest first.

#### Scenario: Two review requests in one repo

- **WHEN** GitHub requests the user's review on `acme/api#12` (updated 1 hour ago) and `acme/api#15` (updated 5 minutes ago)
- **THEN** "Needs review" shows group `acme/api` with `#15` above `#12`

#### Scenario: Thread needs the user

- **WHEN** "Needs review" holds `acme/api#15` (updated 5 minutes ago) and `acme/web#3` (updated 2 days ago), and the thread of `acme/web#3` needs the user
- **THEN** group `acme/web` shows above group `acme/api`, with `#3` at the top of its group

#### Scenario: Review thread came back

- **WHEN** "Needs review" holds `acme/api#15` (updated 5 minutes ago) and `acme/web#3` (updated 2 days ago), and the review thread of `acme/web#3` counts as returned
- **THEN** group `acme/web` shows above group `acme/api`, with `#3` at the top of its group

#### Scenario: Review submitted

- **WHEN** the user submits a review on github.com, GitHub no longer requests their review, and the PR has no mark and no review thread
- **THEN** the PR is not in the list after the next refresh

#### Scenario: Marked PR no longer requested

- **WHEN** the user marked `acme/api#15` reviewed and GitHub no longer requests their review
- **THEN** `#15` stays in the list

#### Scenario: Review thread on a PR that is not requested

- **WHEN** an unarchived review thread is linked to `acme/api#15` and GitHub no longer requests the user's review
- **THEN** `#15` stays in the list with its thread

### Requirement: Thread on the PR row

When a thread is linked to a PR on the list, the PR card SHALL show the thread status (running, needs you, idle, or error) and an "Open thread" action. When the linked thread is a review thread that the plugin started, the card SHALL also have an "Archive thread" action that archives that thread. When the review thread counts as returned, the card SHALL show the status in the accent style as "Agent finished", "Needs you", or "Failed".

#### Scenario: Running review thread

- **WHEN** the agent of the review thread for `acme/api#15` is running
- **THEN** the card for `#15` shows a running status and "Open thread"

#### Scenario: Returned review thread

- **WHEN** the agent of the review thread for `acme/api#15` went idle and the user has not opened the thread since
- **THEN** the card for `#15` shows "Agent finished" in the accent style

#### Scenario: Opened review thread

- **WHEN** the user opened the review thread for `acme/api#15` after its agent went idle
- **THEN** the card for `#15` shows the plain idle status

#### Scenario: Archive from the row

- **WHEN** the user selects "Archive thread" on the card for `acme/api#15`, and `#15` is still requested
- **THEN** bb archives the thread and the card shows "Review in thread" again

#### Scenario: Archive a thread on an unrequested, unmarked PR

- **WHEN** `acme/api#15` is in the list only because of its review thread, and the user selects "Archive thread"
- **THEN** bb archives the thread and `#15` leaves the list
