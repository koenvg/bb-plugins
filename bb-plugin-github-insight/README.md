# bb-plugin-github-insight

Shows the merge blockers, reviewers, and checks of a thread's pull request in a **PR** tab in the thread's right panel. A **Review** tab shows the PR's diff from GitHub, with the review threads on their lines.

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
- `ui/review-tab.tsx`: the file count, a refresh button, and one diff per file at the PR head. `ui/file-diff.tsx` is the only file that imports `@pierre/diffs` (see design D4 of the `pr-review-threads` change). A file without a patch shows "Diff not available". `placeThreads` puts each thread on its line (RIGHT on the new side, LEFT on the old side). A thread that is outdated, has no line, or whose line or file is not in the diff goes to the "Outdated" section at the top. Resolved threads show only with "Show resolved", collapsed. Each open thread has a reply box with "Post", "Post + resolve", and "Resolve". A resolved thread has "Unresolve". A failed post keeps the text in the box. When the user has a pending review on GitHub, GitHub adds the reply to that review, and the tab says "Reply added to your pending review".

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
- Only a click in the tab or the banner merges or enqueues. No CLI command merges or enqueues.
- The overview query reads `isMergeQueueEnabled` and `mergeQueueEntry`. GitHub Enterprise Server versions without these fields are not supported: the PR tab shows an error.

## Requirements

- `gh` 2.48 or later (for `--slurp`), installed and logged in on each host that runs threads.

## Develop

```bash
npm install --include=dev
npm test
npm run typecheck
bb plugin install .
bb plugin dev
```

## Test fixtures

`test/fixtures/pr-25337-overview-page-*.json` are the two pages of the overview query for `collibra/frontend#25337`, recorded with `gh api graphql`. `test/fixtures/pr-25337-check-run-details.json` is the detail query for its newest failed and cancelled check runs. `test/fixtures/pr-1-files.json` is 3 files of `koenvangeert/bb-plugins#1` from `gh api --paginate --slurp repos/koenvangeert/bb-plugins/pulls/1/files`. `package-lock.json` has no patch. The merge fields of page 1 (`viewerDefaultMergeMethod`, the `*Allowed` flags, `id`, `headRefOid`, `isMergeQueueEnabled`) were recorded later, after the PR was closed. Re-record with the queries in `github/`.
