# bb-plugin-github-insight

Shows the merge blockers, reviewers, and checks of a thread's pull request in a **PR** tab in the thread's right panel. A **Review** tab shows the PR's diff from GitHub, with the review threads on their lines. A **Pull Requests** nav panel lists the open PRs that wait for your review, starts a hidden review thread for a PR, and lists your review threads in "My reviews".

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
- `review/review-writes.ts`: the review thread writes. `reply` posts a reply, and for "Post + resolve" then resolves the thread. When the resolve fails, the reply stays posted and the error shows. `setResolved` resolves or unresolves. Only the tab's RPCs call it. The CLI does not. After a successful resolve or unresolve, both refresh the PR insight and write `prSummary` before they return. Then the tab posts `{ threadId }` on the `github-insight.summary-written` BroadcastChannel (`ui/summary-written.ts`), and the pr-thread-list sidebar reads the summary again.
- `merge/merge-writes.ts`: the merge and enqueue writes (see "Merge and enqueue").
- `refresh/insight-service.ts`: keeps the last insight per PR in memory. The `pr-poller` service refreshes each open PR every 60 seconds, one refresh per PR, max 4 at once. When a thread goes idle, `server.ts` calls `refreshOnIdle`, which refreshes that thread's PR at once. When BB links no PR yet, it tries one more time after 10 seconds. A merged or closed PR gets one last refresh. After a rate limit, it waits until the reset time or 5 minutes. After a refresh that changes the data, it publishes `insight.updated` with the thread ids.
- `host.ts`: reads a `--body-file` (`readTextFile`), and runs `gh api graphql`, and `gh api --paginate --slurp` for the PR files, with the `gh` login of the host. It returns the raw JSON, or a failure: `gh_missing`, `gh_logged_out`, `rate_limited` (with the reset time from `gh api rate_limit`), or `failed`.
- `core/`: pure parsing. One entry per check name (newest run), mapped to `failed`, `running`, `cancelled`, `passed`, or `skipped`. `buildReviewers` puts open requests (pending) before latest reviews. `buildBlockers` gives the blockers in fixed order, and `blocked` only when no other code applies.
- `core/merge-queue.ts`: maps the PR's merge queue entry (read in the first overview page, no extra request) to a queue state. A queued PR has no blockers, so the composer banner shows "Queued".

  | GitHub entry state | Queue state | PR tab text |
  |---|---|---|
  | `QUEUED` | `queued` | In merge queue (#N) |
  | `AWAITING_CHECKS` | `awaiting_checks` | Merge queue checks running (#N) |
  | `MERGEABLE`, `LOCKED` | `merging` | Merging |
  | `UNMERGEABLE` | `failed` | Merge queue failed (problem tone) |
  | no entry | none | none |
- `ui/pr-tab.tsx`: the PR header with a refresh button, the merge queue state, the merge action ("Merge" or "Enqueue" button in `ui/merge-action-button.tsx`, or a "Queued" label), the merge blockers, the reviewers, and the checks, grouped by status. Passed and skipped are collapsed. A failed refresh shows the error with a retry button, and keeps the last good data with its time.
- `ui/composer-banner.tsx`: the banner above the thread's composer. `bannerState` in `core/banner.ts` picks the row (see "Merge and enqueue"). The text opens the PR tab.
- `ui/hide-host-pr-strip.ts`: a content script that hides bb's own PR link and Merge button above the composer, so the banner is the only merge control. bb has no setting for this, so the CSS targets bb's DOM (`section[aria-label="Thread context before sending"]`). The changed-files toggle stays. Check the selectors after a bb upgrade.
- `queue/review-queue-service.ts`: builds the Pull Requests panel data (see "Pull Requests panel"). The `review-queue` service calls `fetchReviewQueue` on bb's primary host, adds the matching projects and the linked thread to each PR, and keeps the result in plugin kv storage.
- `ui/review-tab.tsx`: the file count, a refresh button, and one diff per file at the PR head. `ui/file-diff.tsx` is the only file that imports `@pierre/diffs` (see design D4 of the `pr-review-threads` change). A file without a patch shows "Diff not available". `placeThreads` puts each thread on its line (RIGHT on the new side, LEFT on the old side). A thread that is outdated, has no line, or whose line or file is not in the diff goes to the "Outdated" section at the top. Resolved threads show only with "Show resolved", collapsed. Each open thread has a reply box with "Post", "Post + resolve", and "Resolve". A resolved thread has "Unresolve". A failed post keeps the text in the box. When the user has a pending review on GitHub, GitHub adds the reply to that review, and the tab says "Reply added to your pending review".
- Comment drafts in the Review tab (see "Review drafts"): a draft at the PR head shows below its line, on its side, marked "Draft from agent", with the line or range. Drafts at another commit show in "Drafts on an older commit" at the top, with "PR has new commits since these drafts (<draft commit> -> <head>)", the path, side, line, and body. The user can edit or delete each draft. Edits are saved 500 ms after the last key press and when the tab closes (`ui/draft-saves.ts`, shared with reply drafts). "Delete" writes nothing to GitHub.
- "Submit review" in the tab header opens the submit panel (`ui/submit-panel.tsx`). It opens at once when the PR has drafts. It shows the summary draft as an editable body, the number of comment drafts, and the verdicts from `submitRules` (`core/review-submit.ts`): Comment, Approve, and Request changes, or only Comment on your own PR. A disabled submit shows the reason, for example "Add a summary to request changes" or "Pull request is merged". Submit saves the open edits first, then calls `submitReview`. After success the tab shows "Review submitted" and no drafts. A failed submit shows the GitHub error, with "Open the PR" when you have a pending review on GitHub, and keeps all drafts and the body.

## Pull Requests panel

```
review-queue service --fetchReviewQueue--> primary host (gh api graphql)
      |  (at start, every 5 minutes, and on refreshReviewQueue)
      +--> kv "review-queue" --getReviewQueue--> app (Pull Requests panel)
      +--> review-queue.updated -------------------^

app --startReview--> server --> bb.sdk.threads.spawn (hidden, review-pr metadata)
app --archiveReview--> server --> bb.sdk.threads.archive
```

- One `gh api graphql` call per load with one search (`github/review-queue-query.ts`): `is:pr is:open review-requested:@me`, first 50 results. It also matches requests to your teams.
- `core/review-queue.ts` groups the PRs by repo and sorts each group by last update, newest first. When GitHub reports more than 50, the list shows "Showing first 50".
- The `review-queue` background service loads at start and then every 5 minutes, also while the panel is closed. Only one load runs at a time. A Refresh during a load waits for it and then starts one more.
- After each load, the service writes the result to the kv entry `review-queue` (`{ v: 1, result }`) and publishes it on `review-queue.updated`. A failed load keeps the last good lists in the entry. The entry stays after a bb restart. An entry of another version reads as no entry.
- `getReviewQueue` returns the stored result at once and never waits for GitHub. Before the first load, it returns `loading`, and the panel shows "Loading pull requests…" until the first result is published.
- The panel reads the stored result when it opens and shows each published result. It has no timer of its own. Refresh calls `refreshReviewQueue`, which loads at once. The old lists stay visible until the new result arrives.
- `startReview` and `archiveReview` build "My reviews" and the thread links again from the stored GitHub data, with no `gh` call, then store and publish the result.
- A failed load shows the reason and "Retry". The last good lists stay visible with their load time. With no primary host, the panel shows "No host available".
- A PR matches a bb project when the project's git remote points to the PR repo (HTTPS or SSH, any case, with or without `.git`). Personal projects do not match. The first project is the most recently updated one.
- The repo name and the "No bb project for this repository" hint show once, on the group header. A card shows the number, title, and time since the last update, then one row with the author, CI state, review decision, Draft, and the actions.
- A card shows "Open thread" when an unarchived thread, hidden or visible, is linked to the PR (most recently updated first). A thread is linked when bb links its branch to the PR, or when it has the `review-pr` metadata of that PR. Else a review request in a repo with a bb project shows "Review in thread". Every card has "Open on GitHub".
- "Review in thread" opens the new-thread composer on `review/<owner>/<repo>/<number>`, filled in with the first matching project, a new worktree from the default branch, and the prompt from `core/review-prompt.ts`. The prompt tells the agent to run `gh pr checkout <n>`, review the PR, save each finding with `review comment` and one summary with `review summary` (see "Review drafts"), and not post to GitHub. Submit starts the thread and opens it. After the checkout, bb links the PR to the thread, and the PR and Review tabs show it.

### Hidden review threads

- `startReview` spawns the thread with `visibility: "hidden"`, so it is not in the sidebar thread list. It also writes the plugin metadata key `review-pr`: `{ v: 1, repo, number, title, url }` (`core/review-pr.ts`). A missing entry, a malformed entry, or another version reads as no review thread.
- "My reviews", at the top of the panel, lists the unarchived threads this plugin started that have a valid `review-pr` entry, newest first. It keeps a thread after its PR leaves "Review requests". Each row shows the repo, number, title, and thread status (Running, Needs you, Idle, or Error), with "Open thread" and "Archive". The list is collapsible and shows "No review threads" when empty.
- "Archive" calls `archiveReview`. The server archives the thread only when it has a `review-pr` entry, so the panel cannot archive other threads.
- The queue service and the `pr-poller` list threads with `includeHidden: true`, so the PR and Review tabs of a hidden thread refresh like on a visible thread.
- To find a review thread without the plugin, run `bb thread list --include-hidden`. To show it in the sidebar again, run `bb thread update <thread-id> --visibility visible`.

### Check it on a fresh install

1. Run `gh auth status` on the primary host. It must show a logged-in user.
2. Install the plugin (see "Develop") and open **Pull Requests** in the bb sidebar.
3. "Review requests" shows the same PRs as `https://github.com/pulls/review-requested`, with its count. The "My reviews" header row shows Refresh and "Updated <time> ago".
4. On a review request in a repo that has a bb project, select "Review in thread". The composer shows that project, a new worktree, and the review prompt. Submit it.
5. bb opens the new thread. It is not in the sidebar thread list. The agent runs `gh pr checkout <n>`. Then the PR and Review tabs show that PR.
6. Go back to **Pull Requests**. "My reviews" shows the thread with its status, and the card shows "Open thread".
7. Select "Archive" on the row. bb archives the thread, and the row leaves "My reviews".
8. Run `gh auth logout` on the primary host and select Refresh. The panel shows "gh not logged in", "Retry", and the last lists with their load time. Log in again and select "Retry".
9. Restart bb and open **Pull Requests** at once. The panel shows the lists from before the restart.

## PR summary

After each refresh, the plugin writes a `prSummary` metadata entry on each thread of the PR (`core/summary.ts`, max 4 KiB). Other plugins, such as pr-thread-list, read it.

| Field | Value |
|---|---|
| `version` | `1` |
| `updatedAt` | ISO time of the last good refresh |
| `pr` | `{ number, url, state }`, `state` is `open`, `draft`, `merged`, or `closed` |
| `checks` | counts per status (`failed`, `running`, `cancelled`, `passed`, `skipped`) and `failedNames` (max 5) |
| `reviewers` | `pending`, `approved`, `changesRequested` counts and `pendingNames` (max 5) |
| `blockers` | blocker codes, `[]` while the PR is in a merge queue |
| `mergeQueue` | `{ position, state }` with `state` `queued`, `awaiting_checks`, `merging`, or `failed`, or `null` when the PR is not in a queue. Optional: a reader treats a missing field as `null` |
| `error` | the last refresh error, or `null` |

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

### Review drafts

The agent saves its own review of the PR as drafts. The user submits them from the Review tab as one GitHub review.

```bash
bb github-insight review comment <path> --line <n> --body <text>
bb github-insight review comment <path> --line <n> --start-line <n> --side LEFT --body-file <path>
bb github-insight review summary --body <text>
bb github-insight review summary --body-file <path>
```

- `review comment` saves a comment draft on a line, or on a range with `--start-line`. `--side` is `RIGHT` (new file, the default) or `LEFT` (old file). It prints the new draft id.
- It fails, and saves nothing, when the path is not a file of the PR, when a line of the range is not in the file's diff on that side (the message names the diff ranges), when the start line is after the line, or when the body is empty.
- Each draft keeps the PR head commit at save time. All comment drafts of a PR have the same commit. When the head moved after the first draft, `review comment` fails and names both commits: submit or delete the old drafts first.
- `review summary` saves the review body. A new summary replaces the old one.
- `review list` prints the comment drafts (id, path, line or range, side, body) and the summary draft after the threads. With `--json`, they are `comments` and `summary` (text or `null`) next to `threads`.
- Both commands publish `review.updated`, so an open Review tab shows the new draft at once. They never write to GitHub.

Plugin kv keys (`review/draft-store.ts`, schemas in `core/review-drafts.ts`). An entry of another version reads as no draft.

| Key | Value |
|---|---|
| `draft:<owner>/<repo>#<n>:<reviewThreadId>` | reply draft: `{ body, updatedAt, source }` |
| `comment:<owner>/<repo>#<n>:<draftId>` | comment draft: `{ v: 1, path, side, line, startLine, body, commitOid, updatedAt, source }` |
| `summary:<owner>/<repo>#<n>` | summary draft: `{ v: 1, body, updatedAt, source }` |

Submit (RPC `submitReview({ threadId, event, body })`, only from the Review tab):

```
submitReview --> server: load the review again (files, threads, head, drafts from kv)
   submitRules: verdict allowed? (own PR: Comment only; merged or closed: all disabled)
   body needed? (Request changes, or Comment with 0 comment drafts)
   host: gh api graphql --input -  addPullRequestReview(pullRequestId, commitOID, event, body, threads)
      commitOID = commit of the comment drafts, or the PR head when there are none
   ok    --> delete the comment drafts and the summary, publish review.updated, refresh the PR insight
   error --> keep all drafts; a pending review on GitHub gives a message with the PR link
```

- The server builds the review from kv. It does not use the tab's copy of the drafts.
- The variables go to `gh` as JSON on stdin, so a large review does not hit the argument length limit.
- One submit is one GitHub write. The CLI never submits.

## Merge and enqueue

The PR tab shows one merge action below the PR header (`core/merge-action.ts`):

| PR | Action |
|---|---|
| merged, closed, or draft | none |
| in the merge queue (also with running checks) | "Queued" label, no button |
| has merge blockers | none |
| base branch has a merge queue | "Enqueue" button |
| repository allows your default merge method | merge button |
| other | none |

The composer banner of the thread shows the same action, with the same `MergeActionButton` and `useMergeAction` as the tab (`core/banner.ts`):

| PR | Banner |
|---|---|
| merged or closed | hidden |
| in the merge queue | "Queued", no button |
| has merge blockers | the top blockers, no button |
| merge or enqueue action | "Ready to merge" or "Ready to enqueue" + the button |
| other | hidden |

The banner text opens the PR tab and writes nothing. The button sits next to the text, not inside it. The tab and the banner each have their own busy state.

The merge button names your default merge method: "Create merge commit", "Squash and merge", or "Rebase and merge". The plugin has no method picker. "Enqueue" uses the queue's own merge method.

```
"Enqueue" --------------------------------------------+
merge button --> confirm dialog (#number, title, method) --Cancel--> no write
                        |                              |
                     Confirm                           |
                        v                              v
runMergeAction({ threadId, action, expectedHeadOid }) --> server
   cached action or head commit differs? --> error "The PR changed. Refresh and try again."
   host: gh api graphql mergePullRequest(pullRequestId, mergeMethod, expectedHeadOid)
      or gh api graphql enqueuePullRequest(pullRequestId, expectedHeadOid)
   ok --> refresh the PR insight (a failed refresh only logs a warning)
```

- "Enqueue" runs at once, without a dialog. After the refresh, the tab and the banner show "Queued".
- The tab sends the head commit that it shows. The server compares it with its cached insight, and GitHub rejects the merge or enqueue when the branch has a newer commit. Then the tab or the banner shows the error.
- The server takes the PR node id and the method from its cache, not from the tab.
- All values go to GitHub as GraphQL variables.
- While the merge or enqueue runs, the button is disabled. A GitHub error shows below the button, and the button is available again.
- The merge or enqueue runs as the `gh` user of the thread's host, with the permissions of that user.
- Only a click in the tab or the banner, or the "GitHub: Merge PR" palette command, merges or enqueues. No CLI command merges or enqueues.
- The overview query reads `isMergeQueueEnabled` and `mergeQueueEntry`. GitHub Enterprise Server versions without these fields are not supported: the PR tab shows an error.

## Command palette

`ui/commands.ts` adds these commands to bb's command palette. They show only for a thread with a PR. "Merge PR" shows only when the PR has a "Merge" or "Enqueue" action.

- `isAvailable` must be sync, so `useInsight` writes each load into `ui/pr-availability.ts` (in memory). A PR sets the entry, no PR deletes it, and a failed load keeps it.
- The composer banner loads the insight of each thread you open. Until that first load ends, no command shows.

| Command | Opens | Then |
|---|---|---|
| GitHub: Merge PR | PR tab | the merge button's action: confirm dialog for merge, enqueue at once |
| GitHub: Open PR tab | PR tab | nothing |
| GitHub: Open Review tab | Review tab | nothing |
| GitHub: Submit review | Review tab | opens the submit panel; the user submits |
| GitHub: Refresh PR | PR tab | the refresh button's action |
| GitHub: Open PR on GitHub | PR tab | opens the PR URL |

```
palette run(ctx) --> ctx.openPanel({ actionId })  (no params, so an open tab gets focus)
      | accepted
      v
postIntent(threadId, tab, intent)   ui/command-intents.ts, in memory, one per thread and tab
      v
PR tab or Review tab takes it once --> waits for its data --> acts with its own UI
```

- The tab acts on the data of its load. When the PR cannot merge, "Merge PR" only opens the tab, which shows why.
- An intent waits max 10 seconds for its tab to mount. A restored tab after a bb restart does nothing.
- No command sends review threads to the agent. That needs a selection of threads.

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

`test/fixtures/pr-25337-overview-page-*.json` are the two pages of the overview query for `collibra/frontend#25337`, recorded with `gh api graphql`. `test/fixtures/pr-25337-check-run-details.json` is the detail query for its newest failed and cancelled check runs. `test/fixtures/pr-1-files.json` is 3 files of `koenvangeert/bb-plugins#1` from `gh api --paginate --slurp repos/koenvangeert/bb-plugins/pulls/1/files`. `package-lock.json` has no patch. The merge fields of page 1 (`viewerDefaultMergeMethod`, the `*Allowed` flags, `id`, `headRefOid`, `isMergeQueueEnabled`) were recorded later, after the PR was closed. `test/fixtures/pr-43-head.json` is the `github/pr-head-query.ts` response for the merged `koenvg/bb-plugins#43`. Re-record with the queries in `github/`.
