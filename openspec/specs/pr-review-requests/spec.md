# pr-review-requests Specification

## Purpose

Shows the open pull requests that wait for the user's review in a bb panel. Lets the user start a hidden bb thread that reviews a pull request, and find those review threads again.

## Requirements

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

### Requirement: List limit

The list SHALL show at most 50 PRs from the review request search. When GitHub reports more, the list SHALL show "Showing first 50". Marked PRs and PRs with a review thread SHALL show in addition to those 50.

#### Scenario: More than 50 review requests

- **WHEN** GitHub reports 70 open review requests
- **THEN** the list shows 50 of them and "Showing first 50"

### Requirement: Pull request card

Each PR card SHALL show the number, title, author, time since the last update, a "Draft" label for drafts, the CI state (passed, failed, running, or none), and the review decision (approved, changes requested, review required, or none). Every card SHALL have an "Open on GitHub" action that opens the PR URL.

#### Scenario: Draft with failing CI

- **WHEN** a PR is a draft and one of its checks failed
- **THEN** its card shows "Draft" and a failed CI state

#### Scenario: Repository shown once

- **WHEN** a repo group holds three PRs
- **THEN** the repository name shows in the group header and not on each card

#### Scenario: Age is last update

- **WHEN** a PR was created 5 months ago and updated 2 days ago
- **THEN** its card shows "2 days ago"

#### Scenario: Open on GitHub

- **WHEN** the user selects "Open on GitHub" on a card
- **THEN** bb opens the PR URL in the browser

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

### Requirement: Errors

When the lists cannot be loaded, the panel SHALL show the reason ("gh not installed", "gh not logged in", "rate limited", or the error text) and a retry action. When earlier data exists, the panel SHALL keep it visible and show the time it was loaded.

#### Scenario: gh not logged in

- **WHEN** `gh` on the primary host has no logged-in user
- **THEN** the panel shows "gh not logged in" and a retry action

#### Scenario: Error after a good load

- **WHEN** a refresh fails after an earlier refresh succeeded
- **THEN** the panel shows the earlier lists, the time they were loaded, and the error

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

### Requirement: Review thread environment

The plugin SHALL start a review thread only in an environment that no other thread can share. A new worktree meets this rule. The project checkout, a personal workspace, an existing environment, and the project's default environment do not. When the user submits the composer with an environment that does not meet the rule, the plugin SHALL not start a thread. The composer SHALL show an error that tells the user to pick a new worktree, and SHALL keep the draft.

#### Scenario: New worktree

- **WHEN** the user submits the review composer for `acme/api#15` with a new worktree environment
- **THEN** bb starts the review thread in that new worktree

#### Scenario: Project checkout

- **WHEN** the user changes the review composer environment for `acme/api#15` to the project checkout and submits
- **THEN** no thread is started
- **AND** the composer shows "Review threads need a new worktree"
- **AND** the prompt and other fields stay as the user left them

#### Scenario: Existing environment

- **WHEN** the user submits the review composer with an existing environment of another thread
- **THEN** no thread is started and the composer shows "Review threads need a new worktree"

#### Scenario: Another thread switches branch

- **WHEN** a review thread for `acme/api#15` runs in its new worktree and another thread checks out a different branch in the project checkout
- **THEN** the card for `#15` still opens the review thread
- **AND** the PR and Review tabs of that thread still show `#15`

### Requirement: Review prompt

The review prompt SHALL tell the agent to run `gh pr checkout <number>` first, then review the PR. It SHALL include the PR URL and title. It SHALL tell the agent to save each finding on a file and line with `bb github-insight review comment`, and to save one review summary with `bb github-insight review summary`. It SHALL tell the agent not to post comments or reviews to GitHub.

#### Scenario: Prompt content

- **WHEN** the composer opens for `acme/api#15` titled "Add rate limits"
- **THEN** the prompt contains `gh pr checkout 15`, the PR URL, the title "Add rate limits", and an instruction not to post to GitHub

#### Scenario: Prompt names the draft commands

- **WHEN** the composer opens for any review request
- **THEN** the prompt contains `bb github-insight review comment` and `bb github-insight review summary`

### Requirement: Open existing review thread

When an unarchived bb thread, hidden or visible, is linked to a PR on the list, the card SHALL show "Open thread" instead of "Review in thread". A thread is linked when bb links its branch to the PR, or when the plugin started it as a review thread for that PR. "Open thread" SHALL open the most recently updated linked thread.

#### Scenario: Thread already linked

- **WHEN** a thread's branch is the head branch of `acme/api#15`
- **THEN** the card for `#15` shows "Open thread"
- **AND** selecting it opens that thread

#### Scenario: Review thread before checkout

- **WHEN** the user started a review thread for `acme/api#15` and its agent has not run `gh pr checkout` yet
- **THEN** the card for `#15` shows "Open thread"

### Requirement: Hidden review threads

A thread started with "Review in thread" SHALL be hidden from the sidebar thread list. The plugin SHALL record on the thread which PR it reviews (repository, number, title, URL). The GitHub Insight PR and Review tabs SHALL work for hidden threads the same as for visible threads.

#### Scenario: PR tab on a hidden review thread

- **WHEN** the user opens a hidden review thread after its agent ran `gh pr checkout`
- **THEN** the PR and Review tabs show that PR and refresh like on a visible thread

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
