## Purpose

Shows the open pull requests that wait for the user's review, and the user's own open pull requests, in a bb panel. Lets the user start a bb thread that reviews a pull request.

## ADDED Requirements

### Requirement: Pull Requests panel
The plugin SHALL add a nav panel named "Pull Requests" with a pull request icon. The panel SHALL show a "My reviews" list at the top, and below it two lists side by side: "Review requests" and "My PRs". Each list header SHALL show the number of items in that list. The panel title SHALL appear once.

#### Scenario: Open the panel
- **WHEN** the user opens the "Pull Requests" panel
- **THEN** the panel shows "My reviews", "Review requests", and "My PRs", each with its count

### Requirement: Review requests list content
The "Review requests" list SHALL contain the open pull requests on GitHub where a review from the logged-in `gh` user is requested. It SHALL group them by repository and sort each group by last update, newest first.

#### Scenario: Two review requests in one repo
- **WHEN** GitHub requests the user's review on `acme/api#12` (updated 1 hour ago) and `acme/api#15` (updated 5 minutes ago)
- **THEN** the list shows group `acme/api` with `#15` above `#12`

#### Scenario: Review submitted
- **WHEN** the user submits a review on GitHub and GitHub no longer requests their review
- **THEN** the PR is not in the list after the next refresh

### Requirement: My PRs list content
The "My PRs" list SHALL contain the open pull requests authored by the logged-in `gh` user. It SHALL group them by repository and sort each group by last update, newest first.

#### Scenario: Merged PR leaves the list
- **WHEN** one of the user's PRs is merged
- **THEN** the PR is not in "My PRs" after the next refresh

### Requirement: List limit
Each list SHALL show at most 50 pull requests. When GitHub reports more, the list SHALL show "Showing first 50".

#### Scenario: More than 50 review requests
- **WHEN** GitHub reports 70 open review requests
- **THEN** the list shows 50 PRs and "Showing first 50"

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
The panel SHALL load both lists when it opens, when the user selects Refresh, and every 5 minutes while the panel is open. During a refresh the panel SHALL keep showing the last loaded lists.

#### Scenario: Manual refresh
- **WHEN** the user selects Refresh
- **THEN** the panel reloads both lists from GitHub and keeps the old lists visible until the new data arrives

#### Scenario: Panel closed
- **WHEN** the panel is not open
- **THEN** the plugin makes no GitHub calls for these lists

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
- **THEN** the repo group header in "Review requests" shows the hint "No bb project for this repository" once
- **AND** each card in that group shows only "Open on GitHub"

### Requirement: Review in thread
A review request card with a matching project SHALL have a "Review in thread" action. It SHALL open the host's new-thread composer filled in with the matching project, a new worktree environment, and the review prompt. The user SHALL be able to edit all of these before submitting. When more than one project matches, the composer SHALL start with the most recently updated one.

#### Scenario: Start a review thread
- **WHEN** the user selects "Review in thread" on `acme/api#15` and submits the composer unchanged
- **THEN** bb starts a thread in the matching project, in a new worktree, with the review prompt
- **AND** the thread is hidden from the sidebar thread list
- **AND** the panel opens that thread

#### Scenario: Leave the composer
- **WHEN** the user opens the composer from a card and goes back without submitting
- **THEN** no thread is started and the panel shows the lists again

### Requirement: Review prompt
The review prompt SHALL tell the agent to run `gh pr checkout <number>` first, then review the PR. It SHALL include the PR URL and title. It SHALL tell the agent not to post comments or reviews to GitHub.

#### Scenario: Prompt content
- **WHEN** the composer opens for `acme/api#15` titled "Add rate limits"
- **THEN** the prompt contains `gh pr checkout 15`, the PR URL, the title "Add rate limits", and an instruction not to post to GitHub

### Requirement: Open existing review thread
When an unarchived bb thread, hidden or visible, is linked to a PR on the list, the card SHALL show "Open thread" instead of "Review in thread". A thread is linked when bb links its branch to the PR, or when the plugin started it as a review thread for that PR. "Open thread" SHALL open the most recently updated linked thread.

#### Scenario: Thread already linked
- **WHEN** a thread's branch is the head branch of `acme/api#15`
- **THEN** the card for `#15` shows "Open thread"
- **AND** selecting it opens that thread

#### Scenario: Review thread before checkout
- **WHEN** the user started a review thread for `acme/api#15` and its agent has not run `gh pr checkout` yet
- **THEN** the card for `#15` shows "Open thread"

#### Scenario: Linked thread on My PRs
- **WHEN** a thread's branch is the head branch of one of the user's own PRs
- **THEN** that card in "My PRs" shows "Open thread"

### Requirement: Hidden review threads
A thread started with "Review in thread" SHALL be hidden from the sidebar thread list. The plugin SHALL record on the thread which PR it reviews (repository, number, title, URL). The GitHub Insight PR and Review tabs SHALL work for hidden threads the same as for visible threads.

#### Scenario: PR tab on a hidden review thread
- **WHEN** the user opens a hidden review thread after its agent ran `gh pr checkout`
- **THEN** the PR and Review tabs show that PR and refresh like on a visible thread

### Requirement: My reviews list
The "My reviews" list SHALL show every unarchived review thread the plugin started, newest first, also when the PR is no longer a review request. Each row SHALL show the repository, PR number, PR title, and thread status, with "Open thread" and "Archive" actions. The list SHALL be collapsible and SHALL show "No review threads" when empty.

#### Scenario: Review submitted on GitHub
- **WHEN** the user started a review thread for `acme/api#15` and then submitted the review, so `#15` left "Review requests"
- **THEN** "My reviews" still shows `acme/api #15` with "Open thread"

#### Scenario: Archive a review thread
- **WHEN** the user selects "Archive" on a row
- **THEN** bb archives that thread and the row leaves the list

#### Scenario: Thread status
- **WHEN** a review thread's agent is running
- **THEN** its row shows a running status
