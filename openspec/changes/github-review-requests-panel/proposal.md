## Why

To see which pull requests wait for your review, you must leave bb and open GitHub. OpenForge has a Pull Requests tab with this list. bb has the detail view already (GitHub Insight PR and Review tabs), but only for a thread's own PR, and no list.

## What Changes

- GitHub Insight gets a new nav panel, "Pull Requests", with two lists:
  - **Review requests**: open PRs where your review is requested.
  - **My PRs**: open PRs you wrote.
- Each card shows repo, number, title, author, age, draft, CI state, and review decision.
- Data comes from `gh` on the primary host. It loads when the panel opens, on Refresh, and every 5 minutes while the panel is open.
- "Review in thread" on a review request opens the host's new-thread composer. It is filled in with:
  - the bb project whose git remote matches the PR repo
  - a fresh worktree
  - a prompt that starts with `gh pr checkout <n>` and then asks for a review
- After the agent checks out the PR branch, the existing GitHub Insight PR and Review tabs show that PR in the thread.
- If a bb thread already shows that PR, the card shows "Open thread" instead of "Review in thread".
- If no bb project matches the repo, the card shows only "Open on GitHub" and a hint.
- Every card has "Open on GitHub".

Out of scope for this change:
- Read, reviewed, or removed state per PR, and sidebar badges.
- Filter for team review requests.
- Submitting a review from the panel.
- Picking a project for a repo that no bb project matches.
- One-click start without the composer.

## Capabilities

### New Capabilities

- `pr-review-requests`: the Pull Requests panel, its two lists, how it gets and refreshes data, and how a review request becomes a bb review thread.

### Modified Capabilities

None. The GitHub Insight PR and Review tab behavior does not change.

## Impact

- `bb-plugin-github-insight`: new nav panel slot in `app.tsx`, new RPC methods in `contract.ts` and `server.ts`, new host handler for `gh search prs` in `host.ts`.
- Needs `gh` with a logged-in user on the primary host.
- Adds two `gh` search calls per refresh.
- Depends on bb linking a worktree thread to a PR after its branch changes. Task 1 is a spike to check this.
- No change to bb core.
