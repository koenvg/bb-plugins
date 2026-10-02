## MODIFIED Requirements

### Requirement: Pull Requests panel
The plugin SHALL add a nav panel named "Pull Requests" with a pull request icon. The panel SHALL show one PR list with a "Needs review" section and a "Reviewed" section below it. Each section header SHALL show the number of PRs in that section. The panel title SHALL appear once. Refresh and the time of the last load SHALL sit on the "Needs review" header row, not on a row of their own.

#### Scenario: Open the panel
- **WHEN** the user opens the "Pull Requests" panel
- **THEN** the panel shows "Needs review" and "Reviewed", each with its count
- **AND** the "Needs review" header row shows Refresh and "Updated <time> ago"

#### Scenario: Reviewed section starts collapsed
- **WHEN** the user opens the panel and "Reviewed" holds 4 PRs
- **THEN** the "Reviewed" header shows "4" and its PRs are hidden until the user expands it

#### Scenario: No PRs to review
- **WHEN** no PR is in "Needs review"
- **THEN** that section shows "Nothing to review"

### Requirement: Review requests list content
The PR list SHALL contain each open pull request on GitHub that meets one or more of these conditions: a review from the logged-in `gh` user is requested, the user marked it reviewed, or an unarchived review thread that the plugin started is linked to it. Each PR SHALL show one time only. Each section SHALL group its PRs by repository. In each section, repository groups that hold a PR whose thread needs the user SHALL come first. In each group, those PRs SHALL come first. Other PRs SHALL follow, sorted by last update, newest first.

#### Scenario: Two review requests in one repo
- **WHEN** GitHub requests the user's review on `acme/api#12` (updated 1 hour ago) and `acme/api#15` (updated 5 minutes ago)
- **THEN** "Needs review" shows group `acme/api` with `#15` above `#12`

#### Scenario: Thread needs the user
- **WHEN** "Needs review" holds `acme/api#15` (updated 5 minutes ago) and `acme/web#3` (updated 2 days ago), and the thread of `acme/web#3` needs the user
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

### Requirement: List limit
The list SHALL show at most 50 PRs from the review request search. When GitHub reports more, the list SHALL show "Showing first 50". Marked PRs and PRs with a review thread SHALL show in addition to those 50.

#### Scenario: More than 50 review requests
- **WHEN** GitHub reports 70 open review requests
- **THEN** the list shows 50 of them and "Showing first 50"

### Requirement: Refresh
The plugin SHALL refresh the list in the background every 5 minutes, also while the panel is closed, and SHALL keep the last good result across plugin restarts. The panel SHALL show the kept result at once when it opens and SHALL update when a background refresh finishes. Refresh SHALL start a refresh at once. During a refresh the panel SHALL keep showing the last result.

#### Scenario: Manual refresh
- **WHEN** the user selects Refresh
- **THEN** the panel reloads the list from GitHub and keeps the old list visible until the new data arrives

#### Scenario: Open with a kept result
- **WHEN** a background refresh finished 3 minutes ago and the user opens the panel
- **THEN** the panel shows that result at once, with "Updated 3 minutes ago", without waiting for GitHub

#### Scenario: Background update while open
- **WHEN** the panel is open and a background refresh finishes with a new review request
- **THEN** the new request appears without a user action

#### Scenario: After a plugin restart
- **WHEN** bb restarts and the user opens the panel before the first background refresh finishes
- **THEN** the panel shows the result kept from before the restart

#### Scenario: Review thread started
- **WHEN** the user starts or archives a review thread
- **THEN** the thread on the PR row and the row actions update without waiting for the next background refresh

#### Scenario: Mark changed
- **WHEN** the user marks a PR reviewed or as needs review
- **THEN** the PR moves to its new section without waiting for the next background refresh

### Requirement: Repository to project match
For each PR, the plugin SHALL find the bb projects whose git remote points to the PR's GitHub repository. The match SHALL ignore case, the URL form (HTTPS or SSH), and a trailing `.git`. Personal projects SHALL NOT match.

#### Scenario: SSH remote matches
- **WHEN** a bb project has remote `git@github.com:Acme/API.git` and a PR is in `acme/api`
- **THEN** that project matches the PR

#### Scenario: No project for the repository
- **WHEN** no bb project has a remote for the PR's repository
- **THEN** the repo group header shows the hint "No bb project for this repository" once
- **AND** no card in that group shows "Review in thread"

### Requirement: Review in thread
A PR card with a matching project and no linked thread SHALL have a "Review in thread" action. It SHALL open the host's new-thread composer filled in with the matching project, a new worktree environment, and the review prompt. The user SHALL be able to edit all of these before submitting. When more than one project matches, the composer SHALL start with the most recently updated one.

#### Scenario: Start a review thread
- **WHEN** the user selects "Review in thread" on `acme/api#15` and submits the composer unchanged
- **THEN** bb starts a thread in the matching project, in a new worktree, with the review prompt
- **AND** the thread is hidden from the sidebar thread list
- **AND** the panel opens that thread

#### Scenario: Leave the composer
- **WHEN** the user opens the composer from a card and goes back without submitting
- **THEN** no thread is started and the panel shows the list again

## ADDED Requirements

### Requirement: Reviewed state
The plugin SHALL keep, per PR, the head commit at which the user marked it reviewed. A PR SHALL be in "Reviewed" when that commit is the PR's current head commit. A PR SHALL be in "Needs review" when it has no kept commit, or when its head commit is different from the kept commit. The kept commit SHALL stay after a bb restart.

#### Scenario: Reviewed at the current head
- **WHEN** the user marked `acme/api#15` reviewed at commit `abc123` and its head is `abc123`
- **THEN** `#15` is in "Reviewed"

#### Scenario: Author pushes
- **WHEN** the user marked `acme/api#15` reviewed at `abc123` and the author pushes, so the head is `def456`
- **THEN** after the next refresh, `#15` is in "Needs review" with the label "Updated since review"

#### Scenario: Author force pushes
- **WHEN** the user marked `acme/api#15` reviewed at `abc123` and the author force pushes to `fff000`
- **THEN** after the next refresh, `#15` is in "Needs review" with the label "Updated since review"

#### Scenario: Review requested again with no push
- **WHEN** the user marked `acme/api#15` reviewed at its head and the author requests their review again without a push
- **THEN** `#15` stays in "Reviewed"

### Requirement: Mark reviewed
Each open PR card in "Needs review" SHALL have a "Mark reviewed" action. It SHALL keep the head commit that the card shows as the reviewed commit, and SHALL move the PR to "Reviewed". When the save fails, the PR SHALL stay in "Needs review" and the panel SHALL show the error.

#### Scenario: Mark a PR reviewed
- **WHEN** the user selects "Mark reviewed" on `acme/api#15`
- **THEN** `#15` moves to "Reviewed"

#### Scenario: Head changed before the refresh
- **WHEN** the card shows head `abc123`, the author already pushed `def456`, and the user selects "Mark reviewed"
- **THEN** the kept commit is `abc123`
- **AND** after the next refresh, `#15` is in "Needs review" with "Updated since review"

### Requirement: Mark as needs review
Each PR card in "Reviewed" SHALL have a "Mark as needs review" action. It SHALL delete the kept commit for that PR and SHALL move the PR to "Needs review". A PR with no review request and no review thread SHALL then leave the list.

#### Scenario: Unmark a requested PR
- **WHEN** GitHub requests the user's review on `acme/api#15`, `#15` is in "Reviewed", and the user selects "Mark as needs review"
- **THEN** `#15` moves to "Needs review" with no "Updated since review" label

#### Scenario: Unmark a PR that is not requested
- **WHEN** `acme/api#15` is in "Reviewed" only because of the mark, and the user selects "Mark as needs review"
- **THEN** `#15` leaves the list

### Requirement: Merged and closed PRs leave the list
The list SHALL show open PRs only. When a refresh finds that a marked PR is merged or closed, or does not exist, the plugin SHALL delete its kept commit. A merged or closed PR with an unarchived review thread SHALL leave the list. The thread SHALL stay unarchived.

#### Scenario: Marked PR merged
- **WHEN** `acme/api#15` is marked reviewed and the author merges it
- **THEN** after the next refresh, `#15` is not in the list and its kept commit is deleted

#### Scenario: PR with a review thread closed
- **WHEN** an unarchived review thread is linked to `acme/api#15` and the PR is closed
- **THEN** after the next refresh, `#15` is not in the list and the thread is not archived

### Requirement: Thread on the PR row
When a thread is linked to a PR on the list, the PR card SHALL show the thread status (running, needs you, idle, or error) and an "Open thread" action. When the linked thread is a review thread that the plugin started, the card SHALL also have an "Archive thread" action that archives that thread.

#### Scenario: Running review thread
- **WHEN** the agent of the review thread for `acme/api#15` is running
- **THEN** the card for `#15` shows a running status and "Open thread"

#### Scenario: Archive from the row
- **WHEN** the user selects "Archive thread" on the card for `acme/api#15`, and `#15` is still requested
- **THEN** bb archives the thread and the card shows "Review in thread" again

#### Scenario: Archive a thread on an unrequested, unmarked PR
- **WHEN** `acme/api#15` is in the list only because of its review thread, and the user selects "Archive thread"
- **THEN** bb archives the thread and `#15` leaves the list

## REMOVED Requirements

### Requirement: My reviews list
**Reason**: A review thread now shows on the row of its PR, and marked PRs and PRs with a review thread stay in the list. A separate list of threads shows the same PR two times.
**Migration**: Find a review thread on the card of its PR. Use "Open thread" and "Archive thread" on that card.
