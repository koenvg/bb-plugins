## Purpose

Shows the open pull requests that wait for the user's review, and the user's own open pull requests, in a bb panel. Lets the user start a bb thread that reviews a pull request.

## ADDED Requirements

### Requirement: Pull Requests panel
The plugin SHALL add a nav panel named "Pull Requests". The panel SHALL show two lists side by side: "Review requests" and "My PRs". Each list header SHALL show the number of PRs in that list.

#### Scenario: Open the panel
- **WHEN** the user opens the "Pull Requests" panel
- **THEN** the panel shows a "Review requests" list and a "My PRs" list, each with its count

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
Each PR card SHALL show the repository, number, title, author, age, a "Draft" label for drafts, the CI state (passed, failed, running, or none), and the review decision (approved, changes requested, review required, or none). Every card SHALL have an "Open on GitHub" action that opens the PR URL.

#### Scenario: Draft with failing CI
- **WHEN** a PR is a draft and one of its checks failed
- **THEN** its card shows "Draft" and a failed CI state

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
- **THEN** the review request card shows only "Open on GitHub" and the hint "No bb project for this repository"

### Requirement: Review in thread
A review request card with a matching project SHALL have a "Review in thread" action. It SHALL open the host's new-thread composer filled in with the matching project, a new worktree environment, and the review prompt. The user SHALL be able to edit all of these before submitting. When more than one project matches, the composer SHALL start with the most recently updated one.

#### Scenario: Start a review thread
- **WHEN** the user selects "Review in thread" on `acme/api#15` and submits the composer unchanged
- **THEN** bb starts a thread in the matching project, in a new worktree, with the review prompt
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
When an unarchived bb thread is linked to a PR on the list, the card SHALL show "Open thread" instead of "Review in thread". "Open thread" SHALL open that thread. When more than one thread is linked, it SHALL open the most recently updated one.

#### Scenario: Thread already linked
- **WHEN** a thread's branch is the head branch of `acme/api#15`
- **THEN** the card for `#15` shows "Open thread"
- **AND** selecting it opens that thread

#### Scenario: Linked thread on My PRs
- **WHEN** a thread's branch is the head branch of one of the user's own PRs
- **THEN** that card in "My PRs" shows "Open thread"
