## Why

To see which pull requests wait for your review, you must leave bb and open GitHub. OpenForge has a Pull Requests tab with this list. bb has the detail view already (GitHub Insight PR and Review tabs), but only for a thread's own PR, and no list.

## What Changes

- GitHub Insight gets a new nav panel, "Pull Requests", with a **Review requests** list: open PRs where your review is requested.
- Each card shows number, title, author, age, draft, CI state, and review decision, grouped by repo.
- Data comes from `gh` on the primary host. A background service refreshes it every 5 minutes and keeps the last result in plugin storage, so the panel opens at once. Refresh fetches at once.
- "Review in thread" on a review request opens the host's new-thread composer. It is filled in with:
  - the bb project whose git remote matches the PR repo
  - a fresh worktree
  - a prompt that starts with `gh pr checkout <n>` and then asks for a review
- After the agent checks out the PR branch, the existing GitHub Insight PR and Review tabs show that PR in the thread.
- Review threads are hidden from the sidebar. A "My reviews" list at the top of the panel shows them, also after the PR has left the review requests, with "Open thread" and "Archive".
- If a bb thread already shows that PR, the card shows "Open thread" instead of "Review in thread".
- If no bb project matches the repo, the repo group shows a hint and its cards show only "Open on GitHub".
- Every card has "Open on GitHub".

Out of scope for this change:
- Read, reviewed, or removed state per PR, and sidebar badges.
- Filter for team review requests.
- Submitting a review from the panel.
- Picking a project for a repo that no bb project matches.
- One-click start without the composer.
- A list of the user's own PRs (removed after the first live check: not needed).

## Capabilities

### New Capabilities

- `pr-review-requests`: the Pull Requests panel, its lists, how it gets and refreshes data, and how a review request becomes a bb review thread.

### Modified Capabilities

None. The GitHub Insight PR and Review tab behavior does not change.

## Impact

- `bb-plugin-github-insight`: new nav panel slot in `app.tsx`, new RPC methods in `contract.ts` and `server.ts`, new host handler for `gh search prs` in `host.ts`.
- Needs `gh` with a logged-in user on the primary host.
- Adds two `gh` search calls per refresh.
- Depends on bb linking a worktree thread to a PR after its branch changes. Task 1 is a spike to check this.
- No change to bb core.
