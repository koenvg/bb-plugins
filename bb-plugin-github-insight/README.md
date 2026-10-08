# bb-plugin-github-insight

Shows the merge blockers, reviewers, and checks of a thread's pull request in a **PR** tab in the thread's right panel. A **Review** tab shows the PR's diff from GitHub, with the review threads on their lines. A **Pull Requests** nav panel lists the open PRs that wait for your review in "Needs review" and "Reviewed", starts a hidden review thread for a PR, and keeps a PR reviewed until its author pushes.

## How it works

```
app (PR tab) --getInsight/refresh--> server --fetchOverviewPage--> host (gh api graphql)
      ^                                 |
      +------ insight.updated ----------+  (pr-poller, every 60s)
```

- `pr-lookup.ts`: finds the thread's PR through `bb.sdk.environments.pullRequest`. Both tabs use it. No PR means no GitHub call. A lookup that reports `no git remotes found` also means no PR: the composer PR banner is hidden, and the PR tab shows "No pull request for this thread". Other lookup and refresh errors remain visible with Retry.
- `server.ts`: asks the thread's host for the PR data.
- `review/review-service.ts`: reads the PR files and review threads (max 5 pages of 100) in parallel on each load, without a cache, and attaches the drafts. The Review tab and the CLI both use it.
- `review/review-cli.ts`: the `bb github-insight review` commands (see "Review threads").
- `review/review-writes.ts`: the review thread writes. `reply` posts a reply, and for "Post + resolve" then resolves the thread. When the resolve fails, the reply stays posted and the error shows. `setResolved` resolves or unresolves. Only the tab's RPCs call it. The CLI does not. After a successful resolve or unresolve, both refresh the PR insight and write `prSummary` before they return. Then the tab posts `{ threadId }` on the `github-insight.summary-written` BroadcastChannel (`ui/summary-written.ts`), and the pr-thread-list sidebar reads the summary again.
- `merge/pr-writes.ts`: all PR writes behind `runPrAction`: merge, enqueue, branch update with merge or rebase, and auto-merge on or off (see "Merge and enqueue", "Update branch", and "Auto-merge"). `merge/local-commits-lookup.ts`: the `localCommitsAhead` check for the rebase.
- `refresh/insight-service.ts`: keeps the last insight per PR in memory. The `pr-poller` service refreshes each open PR every 60 seconds, one refresh per PR, max 4 at once. When a thread goes idle, `server.ts` calls `refreshOnIdle`, which refreshes that thread's PR at once. When BB links no PR yet, it tries one more time after 10 seconds. A merged or closed PR gets one last refresh. After a rate limit, it waits until the reset time or 5 minutes. After a refresh that changes the data, it publishes `insight.updated` with the thread ids and writes the reading to the kv entry `insight:<owner>/<repo>#<number>` (`{ v: 1, refreshedAt, reading }`). On a memory miss, for example after a restart, `getInsight` returns that stored reading with its original time at once and refreshes it in the background. An entry of another version reads as no entry. Each poll deletes the entries of PRs that no thread links, but only when bb could read the PR of every thread.
- `host.ts`: reads a `--body-file` (`readTextFile`), and runs `gh api graphql`, and `gh api --paginate --slurp` for the PR files, with the `gh` login of the host. It returns the raw JSON, or a failure: `gh_missing`, `gh_logged_out`, `rate_limited` (with the reset time from `gh api rate_limit`), or `failed`.
- `core/`: pure parsing. One entry per check name (newest run), mapped to `failed`, `running`, `cancelled`, `passed`, or `skipped`. `buildReviewers` puts open requests (pending) before latest reviews. `buildBlockers` gives the blockers in fixed order, and `blocked` only when no other code applies.
- `core/merge-queue.ts`: maps the PR's merge queue entry (read in the first overview page, no extra request) to a queue state. A queued PR has no blockers. Both the PR tab and composer banner use the same queue detail from `ui/pr-status-view.ts`.

  | GitHub entry state    | Queue state       | PR tab and banner text            |
  | --------------------- | ----------------- | --------------------------------- |
  | `QUEUED`              | `queued`          | In merge queue (#N)               |
  | `AWAITING_CHECKS`     | `awaiting_checks` | Merge queue checks running (#N)   |
  | `MERGEABLE`, `LOCKED` | `merging`         | Merging                           |
  | `UNMERGEABLE`         | `failed`          | Merge queue failed (problem tone) |
  | no entry              | none              | none                              |

- `ui/pr-tab.tsx`: the PR header (number, state, "Updated <age>", refresh button, title, then `head → base`, lines added and removed, changed files, and author), one summary line (`prSummaryLine` in `ui/pr-status-view.ts`: the queue state, "Auto-merge on", the first blocker with "+N more", or "Ready to merge"), the merge action ("Merge" or "Enqueue" button in `ui/merge-action-button.tsx`), the merge blockers when there are 2 or more, the reviewers, and the checks. Failed, cancelled, and running checks show open. Passed and skipped share one collapsed line, for example "52 passed, 2 skipped". A required check has a "required" label. A failed refresh shows the error with a retry button, and keeps the last good data with its time.
- `ui/pr-availability.ts`: the last PR result per thread in the window. `useInsight` writes each accepted load there (a PR sets it, no PR deletes it, a failed load keeps it) and seeds a thread switch from it, so the PR tab and banner show the last PR at once with a spinner while the new load runs.
- `ui/composer-banner.tsx`: the banner above the thread's composer. `ui/pr-status-view.ts` picks lifecycle, queue detail, and valid actions for both views; `core/banner.ts` selects compact blockers (see "Merge and enqueue"). The text opens the PR tab.
- `ui/hide-host-pr-strip.ts`: a content script that hides bb's own PR link and Merge button above the composer, so the banner is the only merge control. bb has no setting for this, so the CSS targets bb's DOM (`section[aria-label="Thread context before sending"]`). The changed-files toggle stays. Check the selectors after a bb upgrade.
- `queue/review-queue-service.ts`: builds the Pull Requests panel data (see "Pull Requests panel"). The `review-queue` service calls `fetchReviewQueue` on bb's primary host, adds the matching projects, the linked thread, and the reviewed state to each PR, and keeps the result in plugin kv storage.
- `pr-panel-navigation.ts` and `ui/use-pr-panel-navigation.ts`: the sidebar badge records a one-shot PR-panel request in the current window before navigating. A receiver in this plugin opens its own `pr` action when the matching thread mounts, even if its blocker banner is hidden. The newest request wins; accepted requests are consumed, ordinary sidebar navigation cancels them, and abandoned requests expire after 30 seconds. Requests are not stored on the server, persisted across reloads, or broadcast to other clients.
- `ui/review-tab.tsx`: the file count, a refresh button, and one diff per file at the PR head. `ui/file-diff.tsx` is the only file that imports `@pierre/diffs` (see design D4 of the `pr-review-threads` change). A file without a patch shows "Diff not available". `placeThreads` puts each thread on its line (RIGHT on the new side, LEFT on the old side). A thread that is outdated, has no line, or whose line or file is not in the diff goes to the "Outdated" section at the top. Resolved threads show only with "Show resolved", collapsed. Each open thread has a reply box with "Post", "Post + resolve", and "Resolve". A resolved thread has "Unresolve". A failed post keeps the text in the box. When the user has a pending review on GitHub, GitHub adds the reply to that review, and the tab says "Reply added to your pending review".
- Comment drafts in the Review tab (see "Review drafts"): a draft at the PR head shows below its line, on its side, marked "Pending comment", with the line or range. The "+" in the diff gutter saves an empty comment draft on that line and side (RPC `createCommentDraft`) and focuses its box. The "+" does not show on a merged or closed PR, or when drafts are on an older commit. Drafts at another commit show in "Drafts on an older commit" at the top, with "PR has new commits since these drafts (<draft commit> -> <head>)", "Submit or delete these drafts to add new comments.", the path, side, line, and body. The user can edit or delete each draft. Edits are saved 500 ms after the last key press and when the tab closes (`ui/draft-saves.ts`, shared with reply drafts). "Delete" writes nothing to GitHub.
- "Submit review" in the tab header opens the submit panel (`ui/submit-panel.tsx`). It opens at once when the PR has drafts. It shows the summary draft as an editable body, the number of comment drafts with text, and the verdicts from `submitRules` (`core/review-submit.ts`): Comment, Approve, and Request changes, or only Comment on your own PR. A disabled submit shows the reason, for example "Add a summary to request changes" or "Pull request is merged". Submit saves the open edits first, then calls `submitReview`. After success the tab shows "Review submitted" and no drafts, and the PR is marked reviewed (see "Reviewed state"). A failed submit shows the GitHub error, with "Open the PR" when you have a pending review on GitHub, and keeps all drafts and the body.
- The tab header shows your last submitted review from GitHub's `viewerLatestReview` (`ui/viewer-review-badge.tsx`): "You approved", "You requested changes", "You commented", or "Your review was dismissed", with its age. "new commits since" shows when the head moved after that review. A review you just submitted animates in; under reduced motion it only fades.

## Pull Requests panel

```
review-queue service --fetchReviewQueue--> primary host (gh api graphql)
      |  (at start, every 5 minutes, and on refreshReviewQueue)
      +--> kv "review-queue" --getReviewQueue--> app (Pull Requests panel)
      +--> review-queue.updated -------------------^

app --startReview--> server --> bb.sdk.threads.spawn (hidden, review-pr metadata)
app --archiveReview--> server --> bb.sdk.threads.archive
app --markReviewed / markNeedsReview--> server --> kv "reviewed:<owner/repo#n>"
app --markQueueSeen--> server --> kv "review-seen"
thread.idle / thread.failed --> server --> kv "review-returned:<threadId>"
composer banner --markThreadOpened--> server --> deletes "review-returned:<threadId>"
```

- One `gh api graphql` call per load (`github/review-queue-query.ts`). It has one search, `is:pr is:open review-requested:@me` (first 50 results, also requests to your teams), and one `repository { pullRequest }` lookup per tracked PR, with recent comments, reviews, and review requests (see "Reviewed state"). Tracked PRs are the PRs with a reviewed mark and the PRs of unarchived review threads.
- GitHub returns `null` and a `NOT_FOUND` error for a tracked PR or repository that does not exist, and `gh` then exits non-zero. The host keeps the response when every error is `NOT_FOUND` (`github/not-found-partial.ts`). Other errors fail the load.
- The list holds each open PR once: requested PRs, marked PRs, and PRs with a review thread. A merged, closed, or missing tracked PR leaves the list, and its mark is deleted. When GitHub reports more than 50 requests, "Needs review" shows "Showing first 50".
- Each section groups its PRs by repo. Repo groups with a PR whose thread needs you or came back come first, then the other groups by name. In a group, those PRs come first, then by last update, newest first.
- The `review-queue` background service loads at start and then every 5 minutes, also while the panel is closed. Only one load runs at a time. A Refresh during a load waits for it and then starts one more.
- After each load, the service writes the result to the kv entry `review-queue` (`{ v: 2, result }`) and publishes it on `review-queue.updated`. A failed load keeps the last good lists in the entry. The entry stays after a bb restart. An entry of another version reads as no entry.
- `getReviewQueue` returns the stored result at once and never waits for GitHub. Before the first load, it returns `loading`, and the panel shows "Loading pull requests…" until the first result is published.
- The panel reads the stored result when it opens and shows each published result. It has no timer of its own. Refresh calls `refreshReviewQueue`, which loads at once. The old lists stay visible until the new result arrives.
- `startReview`, `archiveReview`, `markReviewed`, `markNeedsReview`, `markQueueSeen`, `markThreadOpened`, and a review thread's `thread.idle` or `thread.failed` build the thread links and the reviewed state again from the stored GitHub data, with no `gh` call, then store and publish the result. A mark on a PR that is not in the stored data starts a load.
- A failed load shows the reason and "Retry". The last good lists stay visible with their load time. With no primary host, the panel shows "No host available".
- A PR matches a bb project when the project's git remote points to the PR repo (HTTPS or SSH, any case, with or without `.git`). Personal projects do not match. The first project is the most recently updated one.
- The repo name and the "No bb project for this repository" hint show once, on the group header. A card shows the number, title, and time since the last update, then one row with the author, CI state, review decision, Draft, and the actions.
- A card shows the thread status (Running, Needs you, Idle, or Error) and "Open thread" when an unarchived thread, hidden or visible, is linked to the PR (most recently updated first). A thread is linked when bb links its branch to the PR, or when it has the `review-pr` metadata of that PR. A review thread also has "Archive thread". Else a PR in a repo with a bb project shows "Review in thread". Every card has "Mark reviewed" or "Mark as needs review", and "Open on GitHub".

### Sidebar badge

- The Pull Requests sidebar row shows the "Needs review" count (`ui/pr-sidebar-badge.tsx`), or `50+` when the list is truncated. It is hidden before the first load and at 0. It follows `review-queue.updated`, so it changes while the panel is closed. A failed load keeps the last good count.
- The count is a filled pill when "Needs review" holds a PR that is not in the kv entry `review-seen` (`{ v: 1, keys }`, keys `owner/repo#n` lowercase). New commits do not make a PR unseen.
- When the panel shows the list with an unseen PR, it calls `markQueueSeen` with the PRs it renders. The server replaces `review-seen` with them. Each build of the lists also removes PRs that left "Needs review" from the set, so a later request counts as new.
- A dot shows when a review thread came back: its agent stopped (`thread.idle` or `thread.failed`), is still stopped, and the user has not opened it since, or it needs the user. The dot also shows without a count.
- A stopped review thread writes the kv entry `review-returned:<threadId>` (`queue/returned-threads.ts`). Other threads are ignored. The composer banner of every opened thread calls `markThreadOpened`. The server deletes the entry, or does nothing when there is none. When the agent stops while the thread is open, the banner sees it in the next `review-queue.updated` and calls again. A thread that needs the user stays returned until answered. Entries of archived or deleted threads are deleted after the next build. A failed metadata read keeps the entry.
- A card with a returned thread shows "Agent finished", "Needs you", or "Failed" as a pill.

### Reviewed state

- "Mark reviewed" writes the kv entry `reviewed:<owner/repo#n>` (lowercase): `{ v: 1, owner, repo, number, headOid, markedAt }` (`queue/reviewed-marks.ts`). `headOid` is the head commit that the card shows.
- `core/review-state.ts` compares the mark with the current head: no mark is "Needs review", the same commit is "Reviewed", another commit is "Needs review" with "Updated since review". A push or force push changes the head, so the PR comes back by itself.
- "Reviewed" is collapsed when the panel opens. "Mark as needs review" deletes the mark. A PR with no request and no review thread then leaves the list.
- A successful submit in the Review tab marks the PR reviewed at the submitted commit, except on your own PR. When the mark cannot be saved, the submit panel says to use "Mark reviewed".
- A marked PR also comes back to "Needs review" on activity after `markedAt`. The tracked PR lookups fetch the last 20 PR comments, the last 20 reviews, the last 10 review requests, and `viewer { login }` (`QueueActivity` fragment). `core/review-queue.ts` keeps the newest time of each kind:
  - "New comments": a PR comment, a review comment or reply, or a review with text, from a `User` that is not you. Bots, your own activity, deleted users, and approvals with no text and no comments do not count. A reply on github.com is a review with no body and one comment, so it counts.
  - "Review requested again": a review request to your login. Requests to a team do not count.
- "Mark reviewed" writes a new `markedAt`, so it clears both labels. PRs with no mark get no activity labels, also when they have a review thread.
- Reviews submitted on github.com do not set a mark.
- "Review in thread" opens the new-thread composer on `review/<owner>/<repo>/<number>`, filled in with the first matching project, a new worktree on the primary host from the default branch, and the prompt from `core/review-prompt.ts`. The composer shows after the plugin gets the primary host ID, because bb ignores a worktree seed without a host. With no primary host, the composer uses its own environment default. The prompt tells the agent to run `gh pr checkout <n>`, review the PR, save each finding with `review comment` and one summary with `review summary` (see "Review drafts"), and not post to GitHub. Submit starts the thread and opens it. A review thread starts only in an environment that no other thread can share. The project checkout, a personal workspace, an existing environment, and the project default are rejected with "Review threads need a new worktree". After the checkout, bb links the PR to the thread, and the PR and Review tabs show it.

### Hidden review threads

- `startReview` spawns the thread with `visibility: "hidden"`, so it is not in the sidebar thread list. It also writes the plugin metadata key `review-pr`: `{ v: 1, repo, number, title, url }` (`core/review-pr.ts`). A missing entry, a malformed entry, or another version reads as no review thread.
- A review thread keeps its PR in the list after the PR leaves the review requests, until the thread is archived or the PR is merged or closed.
- "Archive thread" calls `archiveReview`. The server archives the thread only when it has a `review-pr` entry, so the panel cannot archive other threads.
- The queue service and the `pr-poller` list threads with `includeHidden: true`, so the PR and Review tabs of a hidden thread refresh like on a visible thread.
- To find a review thread without the plugin, run `bb thread list --include-hidden`. To show it in the sidebar again, run `bb thread update <thread-id> --visibility visible`.

### Check it on a fresh install

1. Run `gh auth status` on the primary host. It must show a logged-in user.
2. Install the plugin (see "Develop") and open **Pull Requests** in the bb sidebar.
3. "Needs review" shows the same PRs as `https://github.com/pulls/review-requested`, with its count. Its header row shows Refresh and "Updated <time> ago".
4. On a review request in a repo that has a bb project, select "Review in thread". The composer shows that project, a new worktree, and the review prompt. Submit it.
5. bb opens the new thread. It is not in the sidebar thread list. The agent runs `gh pr checkout <n>`. Then the PR and Review tabs show that PR.
6. Go back to **Pull Requests**. The card shows the thread status and "Open thread".
7. Select "Mark reviewed" on the card. The PR moves to "Reviewed". Select "Mark as needs review" to move it back.
8. Select "Archive thread" on the card. bb archives the thread, and the card shows "Review in thread" again.
9. Run `gh auth logout` on the primary host and select Refresh. The panel shows "gh not logged in", "Retry", and the last lists with their load time. Log in again and select "Retry".
10. Restart bb and open **Pull Requests** at once. The panel shows the lists from before the restart.
11. With the panel closed, wait for a new review request. The sidebar count becomes a pill. Open the panel. The pill goes back to a plain count.
12. Start a review thread and leave the panel. When the agent finishes, a dot shows next to the count within seconds. Open **Pull Requests**. The card shows "Agent finished". Select "Open thread". The dot goes away.

## PR summary

After each refresh, the plugin writes a `prSummary` metadata entry on each thread of the PR (`core/summary.ts`, max 4 KiB). Other plugins, such as pr-thread-list, read it.

| Field        | Value                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `version`    | `1`                                                                                                                                                                                  |
| `updatedAt`  | ISO time of the last good refresh                                                                                                                                                    |
| `pr`         | `{ number, url, state }`, `state` is `open`, `draft`, `merged`, or `closed`                                                                                                          |
| `checks`     | counts per status (`failed`, `running`, `cancelled`, `passed`, `skipped`) and `failedNames` (max 5)                                                                                  |
| `reviewers`  | `pending`, `approved`, `changesRequested` counts and `pendingNames` (max 5)                                                                                                          |
| `blockers`   | blocker codes, `[]` while the PR is in a merge queue                                                                                                                                 |
| `mergeQueue` | `{ position, state }` with `state` `queued`, `awaiting_checks`, `merging`, or `failed`, or `null` when the PR is not in a queue. Optional: a reader treats a missing field as `null` |
| `error`      | the last refresh error, or `null`                                                                                                                                                    |

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

The agent saves its own review of the PR as drafts. The user can add comment drafts from the diff gutter in the Review tab. The user submits them from the Review tab as one GitHub review.

```bash
bb github-insight review comment <path> --line <n> --body <text>
bb github-insight review comment <path> --line <n> --start-line <n> --side LEFT --body-file <path>
bb github-insight review summary --body <text>
bb github-insight review summary --body-file <path>
```

- `review comment` saves a comment draft on a line, or on a range with `--start-line`. `--side` is `RIGHT` (new file, the default) or `LEFT` (old file). It prints the new draft id.
- It fails, and saves nothing, when the path is not a file of the PR, when a line of the range is not in the file's diff on that side (the message names the diff ranges), when the start line is after the line, or when the body is empty.
- Each draft keeps the PR head commit at save time. All comment drafts of a PR have the same commit. When the head moved after the first draft, `review comment` and `createCommentDraft` fail and name both commits: submit or delete the old drafts first.
- `createCommentDraft({ threadId, path, side, line })` is the Review tab's way to start a comment draft. It runs the same file, diff, and commit checks as `review comment`, saves an empty body with `source: "user"`, and publishes `review.updated`.
- `review summary` saves the review body. A new summary replaces the old one.
- `review list` prints the comment drafts (id, path, line or range, side, body) and the summary draft after the threads. With `--json`, they are `comments` and `summary` (text or `null`) next to `threads`.
- Both commands publish `review.updated`, so an open Review tab shows the new draft at once. They never write to GitHub.

Plugin kv keys (`review/draft-store.ts`, schemas in `core/review-drafts.ts`). An entry of another version reads as no draft.

| Key                                         | Value                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `draft:<owner>/<repo>#<n>:<reviewThreadId>` | reply draft: `{ body, updatedAt, source }`                                                 |
| `comment:<owner>/<repo>#<n>:<draftId>`      | comment draft: `{ v: 1, path, side, line, startLine, body, commitOid, updatedAt, source }` |
| `summary:<owner>/<repo>#<n>`                | summary draft: `{ v: 1, body, updatedAt, source }`                                         |

Submit (RPC `submitReview({ threadId, event, body })`, only from the Review tab):

```
submitReview --> server: load the review again (files, threads, head, drafts from kv)
   submitRules: verdict allowed? (own PR: Comment only; merged or closed: all disabled)
   body needed? (Request changes, or Comment with 0 comment drafts with text)
   host: gh api graphql --input -  addPullRequestReview(pullRequestId, commitOID, event, body, threads)
      threads = comment drafts with text; empty drafts are not sent
      commitOID = commit of the comment drafts, or the PR head when there are none
   ok    --> delete all comment drafts (empty ones too) and the summary, publish review.updated, refresh the PR insight,
             mark the PR reviewed at commitOID (not on your own PR)
   error --> keep all drafts; a pending review on GitHub gives a message with the PR link
```

- The server builds the review from kv. It does not use the tab's copy of the drafts.
- The variables go to `gh` as JSON on stdin, so a large review does not hit the argument length limit.
- One submit is one GitHub write. The CLI never submits.

## Merge and enqueue

The PR tab shows one merge action below the PR header (`core/merge-action.ts`):

| PR                                            | Action                               |
| --------------------------------------------- | ------------------------------------ |
| merged, closed, or draft                      | none                                 |
| in the merge queue (also with running checks) | queue detail and position, no button |
| has merge blockers                            | none                                 |
| base branch has a merge queue                 | "Enqueue" button                     |
| repository allows your default merge method   | merge button                         |
| other                                         | none                                 |

The composer banner of the thread shows the same action, with the same `MergeActionButton` and `usePrAction` as the tab (`ui/pr-status-view.ts`):

| PR                                  | Banner                                                             |
| ----------------------------------- | ------------------------------------------------------------------ |
| merged                              | Pull request merged, violet merge icon, no merge action            |
| closed                              | Closed, no merge action                                            |
| draft                               | Draft beside compact blockers, no merge action                     |
| open, in the merge queue            | Open beside matching queue detail and position, no button          |
| open, has merge blockers            | Open beside the top blockers, no button                            |
| open, valid merge or enqueue action | Open beside "Ready to merge" or "Ready to enqueue", and the button |
| open, no blockers or action         | Open without readiness or a button                                 |
| no linked PR confirmed              | hidden                                                             |

The lifecycle stays readable at compact widths; long detail truncates first. Closed and Merged suppress old blocker, readiness, and queue messages. Draft never offers a merge or enqueue action, including through the palette.

Before the first result, both views show "Loading pull request…". An initial read failure shows an error and Retry, not an invented PR state. A failed refresh keeps the last good state and details with the error, original update time, and Retry. This includes transport failures after a good read. Refresh progress does not erase known status. A confirmed no-PR result clears retained data and hides normal banner status; explicit palette feedback can still show.

Both views use the same `useInsight` read and realtime path. They load independently, so one can briefly be at a different read stage. After both consume the same result, their lifecycle and queue status agree. There is no additional fetch source or polling timer. Retained data belongs to one thread. It stays in the window across navigation, so a return to the thread shows it at once (see `ui/pr-availability.ts`), and a no-PR result clears it.

The banner text opens the PR tab and writes nothing. The button sits next to the text, not inside it. The tab and banner share one operation state per thread in this window. Both buttons show "Merging…" or "Enqueuing…" and stay disabled during a write, including when one view opens later. Requests from different entry points cannot start a second write while one is running.

The merge button names your default merge method: "Create merge commit", "Squash and merge", or "Rebase and merge". The plugin has no method picker. "Enqueue" uses the queue's own merge method.

```
"Enqueue" --------------------------------------------+
merge button --> confirm dialog (#number, title, method) --Cancel--> no write
                        |                              |
                     Confirm                           |
                        v                              v
runPrAction({ threadId, action, expectedHeadOid }) --> server
   cached action or head commit differs? --> error "The PR changed. Refresh and try again."
   host: gh api graphql mergePullRequest(pullRequestId, mergeMethod, expectedHeadOid)
      or gh api graphql enqueuePullRequest(pullRequestId, expectedHeadOid)
   ok --> refresh the PR insight (a failed refresh only logs a warning)
```

- "Enqueue" runs at once, without a dialog. After the refresh, both views show the reported queue state and position. Failed queue entries use the problem tone, not a waiting tone.
- The tab sends the head commit that it shows. The server compares it with its cached insight, and GitHub rejects the merge or enqueue when the branch has a newer commit. Then the tab or the banner shows the error.
- The server takes the PR node id and the method from its cache, not from the tab.
- All values go to GitHub as GraphQL variables.
- While a merge or enqueue runs, the banner shows progress instead of "Ready to merge" or "Ready to enqueue". An error shows in the tab and banner; a still-valid action is available again. The banner error can be dismissed and an error for an older head commit does not appear for a new head.
- The merge or enqueue runs as the `gh` user of the thread's host, with the permissions of that user.
- Only a click in the tab or the banner, or the "GitHub: Merge PR" palette command, merges or enqueues. Only a click in the tab updates the branch or changes auto-merge. No CLI command writes any of these.
- The overview query reads `isMergeQueueEnabled` and `mergeQueueEntry`. GitHub Enterprise Server versions without these fields are not supported: the PR tab shows an error.

## Update branch

The PR tab shows an "Update branch" split button when `canUpdateBranch` is true (`core/branch-update.ts`): the PR is open or draft, GitHub reports the branch `BEHIND`, it has no conflicts, and it is not in the merge queue.

```
"Update branch" -------------------------------> runPrAction(update-merge)
chevron --> localCommitsAhead(threadId)
              server: cached PR head branch + bb.sdk.environments.get (path, hostId)
              host:   git rev-parse --abbrev-ref HEAD  (must be the head branch)
                      git rev-list --count refs/remotes/origin/<branch>..HEAD
            "Update with rebase…" (disabled with the reason, or)
              --> confirm dialog --Cancel--> no write
              --> runPrAction(update-rebase)
server: gh api graphql updatePullRequestBranch(pullRequestId, expectedHeadOid, updateMethod)
```

- The main part merges the base into the branch at once, without a dialog. A merge never makes the agent lose work: its next push is rejected until it pulls.
- A rebase rewrites the remote branch, so the agent's local branch no longer matches it. The tab checks the worktree first. "N unpushed commits. Push first." or "Cannot check local commits" disables the rebase. The check returns `unknown` for a fork PR, a thread without a worktree path, another checked-out branch, a missing `origin/<branch>` ref, or a failed git command. `sdk.environments.status` with `mergeBaseBranch` is not used, because bb rejects its own merge-base response.
- After an update, the tab shows "Branch updated on GitHub. Pull before you push." until you dismiss it or switch threads.
- Branch update shares the operation state of merge and enqueue (`ui/pr-operations.ts`): one write per thread at a time, "Updating…" while it runs, and the GitHub error below the button.

## Auto-merge

`core/auto-merge.ts` builds `autoMergeAction` from the first overview page (`autoMergeRequest`, `autoMergeAllowed`, and the merge settings):

| PR                                                                                                                                          | Tab                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| open or draft, auto-merge on (also when set on github.com)                                                                                  | "Auto-merge on (method)" in the summary line, "Disable" |
| open, not draft, repo allows auto-merge, no merge queue, default method allowed, and every blocker is "checks running" or "review required" | "Enable auto-merge (method)"                            |
| other                                                                                                                                       | none                                                    |

- Both buttons run at once, without a dialog: `runPrAction(enable-auto-merge)` sends `enablePullRequestAutoMerge(pullRequestId, mergeMethod, expectedHeadOid)` with your default merge method. `runPrAction(disable-auto-merge)` sends `disablePullRequestAutoMerge(pullRequestId)` and does not check the head commit.
- A failed check, conflicts, an out-of-date branch, or changes requested hide "Enable auto-merge". GitHub has the final say: a rejected request shows the GitHub error.
- Auto-merge shares the operation state of the other PR writes: "Enabling…" or "Disabling…" while it runs, one write per thread at a time.

## Command palette

`ui/commands.ts` adds these commands to bb's command palette. They show only for a thread with a PR. "Merge PR" shows only when the PR has a "Merge" or "Enqueue" action.

- `isAvailable` must be sync, so `useInsight` writes each load into `ui/pr-availability.ts` (in memory). A PR sets the entry, no PR deletes it, and a failed load keeps it.
- The composer banner loads the insight of each thread you open. Until that first load ends, no command shows.

| Command                   | Opens      | Then                                                                             |
| ------------------------- | ---------- | -------------------------------------------------------------------------------- |
| GitHub: Merge PR          | no panel   | uses loaded PR data; confirm dialog for merge, enqueue at once; feedback in chat |
| GitHub: Open PR tab       | PR tab     | nothing                                                                          |
| GitHub: Open Review tab   | Review tab | nothing                                                                          |
| GitHub: Submit review     | Review tab | opens the submit panel; the user submits                                         |
| GitHub: Refresh PR        | PR tab     | the refresh button's action                                                      |
| GitHub: Open PR on GitHub | PR tab     | opens the PR URL                                                                 |

```
merge command --> chat merge intent --> loaded PR data --> confirm or enqueue
                                        | error/unavailable
                                        v
                                   chat banner feedback
other commands --> ctx.openPanel({ actionId }) --> tab intent --> tab UI
```

- Merge never opens, closes, switches, or focuses a side-panel tab, including on error. The explicit Open PR tab command and normal banner text still open the PR tab.
- Merge opens confirmation immediately from loaded PR data, like the button. If data is missing or a load or refresh is in progress, preparation shows loading in chat and waits for that result without starting another request. Errors and unavailable reasons remain visible with a dismiss control, including when the normal PR banner is hidden. New attempts replace that feedback; relevant PR updates clear obsolete messages.
- Merge captures the selected PR, action, and head commit for confirmation. If that target changes, the confirmation closes without a write. A failed load never falls back to an earlier action.
- Repeated merge commands during preparation, confirmation, or a write do not start another action. Leaving the thread cancels unsent palette work; a sent write keeps its original thread.
- An intent waits at most 10 seconds for its recipient to mount. Consumed intents do not replay on remount or after a BB restart.
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

`test/fixtures/pr-25337-overview-page-*.json` are the two pages of the overview query for `collibra/frontend#25337`, recorded with `gh api graphql`. `test/fixtures/pr-25337-check-run-details.json` is the detail query for its newest failed and cancelled check runs. `test/fixtures/pr-1-files.json` is 3 files of `koenvangeert/bb-plugins#1` from `gh api --paginate --slurp repos/koenvangeert/bb-plugins/pulls/1/files`. `package-lock.json` has no patch. The merge fields of page 1 (`viewerDefaultMergeMethod`, the `*Allowed` flags, `id`, `headRefOid`, `isMergeQueueEnabled`) were recorded later, after the PR was closed. The branch, author, diff size, `autoMergeAllowed`, `autoMergeRequest`, and `isRequired` fields of the three `collibra/frontend` overview fixtures were added by hand after the query got them. `test/fixtures/pr-cli-14583-overview-required-checks.json` is the overview query for the public `cli/cli#14583`, trimmed to its 3 required checks and 2 optional checks. `test/fixtures/pr-43-head.json` is the `github/pr-head-query.ts` response for the merged `koenvg/bb-plugins#43`. Re-record with the queries in `github/`. `test/fixtures/review-queue-tracked.json` is written by hand in the shape of a real `github/review-queue-query.ts` response with tracked PRs: an open PR, a merged PR, a missing repository and a missing PR (`null` with `NOT_FOUND` errors), and a PR that the search also returns.
