# bb-plugin-github-insight

Shows the merge blockers, reviewers, and checks of a thread's pull request in a **PR** tab in the thread's right panel. A **Review** tab shows the PR's diff from GitHub, with the review threads on their lines. A **Pull Requests** nav panel lists the open PRs that wait for your review and your own open PRs, and starts a review thread for a PR.

## How it works

```
app (PR tab) --getInsight/refresh--> server --fetchOverviewPage--> host (gh api graphql)
      ^                                 |
      +------ insight.updated ----------+  (pr-poller, every 60s)
```

- `pr-lookup.ts`: finds the thread's PR through `bb.sdk.environments.pullRequest`. Both tabs use it. No PR means no GitHub call.
- `server.ts`: asks the thread's host for the PR data.
- `review/review-service.ts`: reads the PR files and review threads (max 5 pages of 100) in parallel on each load, without a cache, and attaches the drafts. The Review tab and the CLI both use it.
- `review/review-cli.ts`: the `bb github-insight review` commands (see "Review threads").
- `review/review-writes.ts`: the only GitHub writes. `reply` posts a reply, and for "Post + resolve" then resolves the thread. When the resolve fails, the reply stays posted and the error shows. `setResolved` resolves or unresolves. Only the tab's RPCs call it. The CLI does not. After a successful resolve or unresolve, both refresh the PR insight and write `prSummary` before they return. Then the tab posts `{ threadId }` on the `github-insight.summary-written` BroadcastChannel (`ui/summary-written.ts`), and the pr-thread-list sidebar reads the summary again.
- `refresh/insight-service.ts`: keeps the last insight per PR in memory. The `pr-poller` service refreshes each open PR every 60 seconds, one refresh per PR, max 4 at once. When a thread goes idle, `server.ts` calls `refreshOnIdle`, which refreshes that thread's PR at once. When BB links no PR yet, it tries one more time after 10 seconds. A merged or closed PR gets one last refresh. After a rate limit, it waits until the reset time or 5 minutes. After a refresh that changes the data, it publishes `insight.updated` with the thread ids.
- `host.ts`: reads a `--body-file` (`readTextFile`), and runs `gh api graphql`, and `gh api --paginate --slurp` for the PR files, with the `gh` login of the host. It returns the raw JSON, or a failure: `gh_missing`, `gh_logged_out`, `rate_limited` (with the reset time from `gh api rate_limit`), or `failed`.
- `core/`: pure parsing. One entry per check name (newest run), mapped to `failed`, `running`, `cancelled`, `passed`, or `skipped`. `buildReviewers` puts open requests (pending) before latest reviews. `buildBlockers` gives the blockers in fixed order, and `blocked` only when no other code applies.
- `core/merge-queue.ts`: maps the PR's merge queue entry (read in the first overview page, no extra request) to a queue state. A queued PR has no blockers, so the composer shows no banner.

  | GitHub entry state | Queue state | PR tab text |
  |---|---|---|
  | `QUEUED` | `queued` | In merge queue (#N) |
  | `AWAITING_CHECKS` | `awaiting_checks` | Merge queue checks running (#N) |
  | `MERGEABLE`, `LOCKED` | `merging` | Merging |
  | `UNMERGEABLE` | `failed` | Merge queue failed (problem tone) |
  | no entry | none | none |
- `ui/pr-tab.tsx`: the PR header with a refresh button, the merge queue state or the merge blockers, the reviewers, and the checks, grouped by status. Passed and skipped are collapsed. A failed refresh shows the error with a retry button, and keeps the last good data with its time.
- `queue/review-queue-service.ts`: builds the Pull Requests panel data (see "Pull Requests panel"). It calls `fetchReviewQueue` on bb's primary host, adds the matching projects and the linked thread to each PR, and keeps the last good result in memory.
- `ui/review-tab.tsx`: the file count, a refresh button, and one diff per file at the PR head. `ui/file-diff.tsx` is the only file that imports `@pierre/diffs` (see design D4 of the `pr-review-threads` change). A file without a patch shows "Diff not available". `placeThreads` puts each thread on its line (RIGHT on the new side, LEFT on the old side). A thread that is outdated, has no line, or whose line or file is not in the diff goes to the "Outdated" section at the top. Resolved threads show only with "Show resolved", collapsed. Each open thread has a reply box with "Post", "Post + resolve", and "Resolve". A resolved thread has "Unresolve". A failed post keeps the text in the box. When the user has a pending review on GitHub, GitHub adds the reply to that review, and the tab says "Reply added to your pending review".

## Pull Requests panel

```
app (Pull Requests panel) --getReviewQueue--> server --fetchReviewQueue--> primary host (gh api graphql)
            |
            +--startReview--> server --> bb.sdk.threads.spawn
```

- One `gh api graphql` call per load with two searches (`github/review-queue-query.ts`): `is:pr is:open review-requested:@me` and `is:pr is:open author:@me`, first 50 results each. `review-requested:@me` also matches requests to your teams.
- `core/review-queue.ts` groups the PRs by repo and sorts each group by last update, newest first. When GitHub reports more than 50, the list shows "Showing first 50".
- The panel loads when it opens, on Refresh, and every 5 minutes while it is open. It makes no GitHub calls while it is closed.
- A failed load shows the reason and "Retry". The last good lists stay visible with their load time. With no primary host, the panel shows "No host available".
- A PR matches a bb project when the project's git remote points to the PR repo (HTTPS or SSH, any case, with or without `.git`). Personal projects do not match. The first project is the most recently updated one.
- A card shows "Open thread" when an unarchived thread is linked to the PR (newest first). Else a review request shows "Review in thread", or "No bb project for this repository" when no project matches.
- "Review in thread" opens the new-thread composer on `review/<owner>/<repo>/<number>`, filled in with the first matching project, a new worktree from the default branch, and the prompt from `core/review-prompt.ts`. The prompt tells the agent to run `gh pr checkout <n>`, review the PR, and not post to GitHub. Submit starts the thread and opens it. After the checkout, bb links the PR to the thread, and the PR and Review tabs show it.

### Check it on a fresh install

1. Run `gh auth status` on the primary host. It must show a logged-in user.
2. Install the plugin (see "Develop") and open **Pull Requests** in the bb sidebar.
3. "Review requests" and "My PRs" show the same PRs as `https://github.com/pulls/review-requested` and `https://github.com/pulls`, each with its count.
4. On a review request in a repo that has a bb project, select "Review in thread". The composer shows that project, a new worktree, and the review prompt. Submit it.
5. bb opens the new thread. The agent runs `gh pr checkout <n>`. Then the PR and Review tabs show that PR.
6. Go back to **Pull Requests** and select Refresh. The card shows "Open thread".
7. Run `gh auth logout` on the primary host and select Refresh. The panel shows "gh not logged in", "Retry", and the last lists with their load time. Log in again and select "Retry".

## Review threads

The agent of a thread can read the review threads of the thread's PR and save a draft reply for each one:

```bash
bb github-insight review list [--json]
bb github-insight review draft <thread-id> --body <text>
bb github-insight review draft <thread-id> --body-file <path>
```

- `review list` prints the unresolved threads: id, path, line, `[outdated]`, `[draft]`, and the comments. A comment body is cut at 4000 characters.
- `review draft` saves the text as a draft for one unresolved thread. A new draft replaces the old one. An unknown or resolved thread id fails.
- `--body-file` is read on the thread's host, relative to the agent's working directory. It must be a regular file of max 64 KB.
- Drafts are kept in plugin kv storage, one row per PR and thread (`review/draft-store.ts`). They stay after a bb restart. The draft of a resolved or deleted thread is deleted on the next load. When the PR has more than 5 pages of threads, a draft of a thread that was not read is kept, but not shown.
- The Review tab puts a draft in the reply box of its thread, marked "Draft from agent". It updates when the agent saves a draft (realtime event `review.updated`). Edits are saved to the draft 500 ms after the last key press, and when the tab closes. "Post" and "Post + resolve" save the edit first, and a successful post deletes the draft. "Discard" deletes the draft and writes nothing to GitHub. While the user has edited a draft, a new draft from the agent does not replace the edited text.
- Both commands only read from GitHub. A draft is never posted to GitHub by the CLI.
- In the Review tab, select open threads and click "Send N to agent". The server loads the threads again and sends one message to the thread's chat (`bb.sdk.threads.send`, `auto` mode: it starts a turn, or it waits until the agent is idle). The message holds each thread's id, path, line, the last 10 lines of its diff hunk, and the comments. It tells the agent to fix the code, save a draft per thread, and not post or resolve. Threads that were resolved in the meantime are left out (`core/agent-prompt.ts`).

**Rule for the agent: never post or resolve with `gh`.** The plugin cannot block `gh`. Only the user posts a reply, from the Review tab.

## Requirements

- `gh` 2.48 or later (for `--slurp`), installed and logged in on each host that runs threads.
- For the Pull Requests panel: `gh` logged in on bb's primary host.

## Develop

```bash
npm install --include=dev
npm test
npm run typecheck
bb plugin install .
bb plugin dev
```

## Test fixtures

`test/fixtures/pr-25337-overview-page-*.json` are the two pages of the overview query for `collibra/frontend#25337`, recorded with `gh api graphql`. `test/fixtures/pr-25337-check-run-details.json` is the detail query for its newest failed and cancelled check runs. `test/fixtures/pr-1-files.json` is 3 files of `koenvangeert/bb-plugins#1` from `gh api --paginate --slurp repos/koenvangeert/bb-plugins/pulls/1/files`. `package-lock.json` has no patch. Re-record with the queries in `github/`.
