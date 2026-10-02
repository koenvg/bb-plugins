See the checks of a thread's pull request, and the pull requests that wait for your review, without leaving bb.

- A **PR** tab in the thread's right panel.
- The PR number, title, state, and a link to GitHub.
- Merge blockers, most important first: conflicts, failed checks, changes requested, branch out of date, review required, unresolved threads, running checks, draft, blocked.
- Reviewers with their state, "(team)" for teams, and a "code owner" label. An open review request shows as pending, also after an earlier review.
- Every check on the head commit, one entry per check name, grouped by status.
- Failed and cancelled checks show why: a reason and up to 5 failure annotations.
- Updates by itself every 60 seconds while the PR is open. A refresh button updates it at once.
- Errors show as "gh not installed", "gh not logged in", or "rate limited", with a retry button. The last good data stays visible with its time.

- A **Review** tab with the diff of each changed file at the PR head. Files without a patch show "Diff not available". Review threads show below their line, with all comments. Outdated threads show in an "Outdated" section at the top. Resolved threads show collapsed with "Show resolved". The top shows "N open" and "N outdated". A draft reply from the agent fills the thread's reply box as "Draft from agent". The user can edit it, post it, post and resolve it, or discard it.
- `bb github-insight review list` and `review draft` let the thread's agent read the open review threads and save draft replies. Drafts are never posted to GitHub by the agent.

- A **Pull Requests** nav panel with two lists: "Review requests" (open PRs that wait for your review) and "My PRs" (your open PRs). Each card shows the repo, number, title, author, age, draft, CI state, review decision, and "Open on GitHub".
- "Review in thread" opens the new-thread composer with the matching bb project, a new worktree, and a review prompt. The agent checks out the PR and reviews it, but does not post to GitHub. When a thread already shows the PR, the card shows "Open thread".

The plugin uses the `gh` CLI login of the host that runs the thread. The Pull Requests panel uses the `gh` login of bb's primary host. It needs no token of its own.
