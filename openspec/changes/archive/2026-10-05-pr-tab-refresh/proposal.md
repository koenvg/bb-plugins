# Proposal

## Why

The PR tab shows "Loading pull request…" on every thread switch, and it starts cold after a bb restart. It also does not tell you at a glance if the PR can merge, which branch it is on, or how big it is. Two common actions, update branch and auto-merge, still need GitHub. t3code and Conductor show this data and these actions in their PR views.

## What Changes

- The PR tab shows the last known PR data at once on a thread switch and after a restart, then refreshes it in the background.
- The PR tab always shows when its data was updated.
- New header: number, state, `head -> base`, lines added and removed, changed files, author, title.
- New one-line summary at the top: the most important blocker, or "Ready to merge".
- Checks show a "required" label. Passed and skipped checks stay collapsed into one line.
- New "Update branch" split button when the branch is behind its base and has no conflicts. Merge is the default. Rebase is the second option, needs a confirm, and is disabled when the thread's worktree has unpushed commits.
- New "Enable auto-merge" button when only checks or reviews block the merge and the repository allows auto-merge. It uses the user's default merge method. A PR with auto-merge on shows it, with "Disable".
- These new writes run only from a user click, the same as merge.

Out of scope:

- A "Fix checks" button that sends failures to the agent.
- Waking the agent when checks fail or comments arrive.
- A merge method picker.

## Capabilities

### New Capabilities

- `pr-insight-snapshot`: keep and show the last known PR data per thread, on the client and across restarts, with a visible age.
- `pr-tab-layout`: the header, summary line, and check list of the PR tab.
- `pr-branch-update`: update the PR branch from its base with merge or rebase, and the guard against lost local work.
- `pr-auto-merge`: turn GitHub auto-merge on or off for the thread's PR.

### Modified Capabilities

- `pr-merge-actions`: "Writes only from the user" now also covers update branch and auto-merge.

## Impact

- `bb-plugin-github-insight`:
  - `github/overview-query.ts`: new fields (branch names, diff size, author, required flag, auto-merge state, repo auto-merge setting).
  - New GraphQL mutations next to `github/merge-mutations.ts`.
  - `host.ts`: new handlers for the mutations and for a local unpushed-commit check.
  - `refresh/insight-service.ts`: persist the last good reading in `bb.storage.kv`.
  - `ui/use-insight.ts`, `ui/use-thread-result.ts`: client snapshot.
  - `ui/pr-tab.tsx`, `core/merge-action.ts`, `ui/pr-status-view.ts`: layout and new actions.
  - `PLUGIN_OVERVIEW.md` and `README.md`.
- GitHub: uses `updatePullRequestBranch`, `enablePullRequestAutoMerge`, and `disablePullRequestAutoMerge` through `gh api graphql`. No new token.
