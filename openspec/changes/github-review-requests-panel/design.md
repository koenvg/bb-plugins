## Context

- GitHub Insight has `server.ts` (bb server process), `host.ts` (runs `gh` on a host through `bb.hosts.experimental_client`), and `app.tsx` (two thread panel tabs).
- All GitHub calls go through `runGhJson` in `host.ts`. Failures map to `gh not installed`, `gh not logged in`, and `rate limited` through `classifyGhFailure`.
- A thread's PR comes from `sdk.environments.pullRequest`, which bb resolves from the environment's branch (`pr-lookup.ts`).
- The SDK project has `gitRemoteUrl`. The SDK has `experimental_NewThreadComposer` with `defaultProjectId`, `defaultEnvironment`, `initialPrompt`, and `onSubmit(NewThreadRequest)`. The server has `bb.sdk.threads.spawn`.
- Tasks Plus uses `app.slots.navPanel` with a `subPath` router. This change uses the same pattern.

## Goals / Non-Goals

**Goals:**
- One `gh` call per refresh for both lists.
- No new state storage. The lists are derived from GitHub and bb every time.

**Non-Goals:**
- Background polling when the panel is closed.
- A cache that survives a plugin restart.

## Decisions

### 1. One GraphQL call with two aliased searches

`gh api graphql` with two `search(type: ISSUE)` aliases:
- `is:pr is:open review-requested:@me`
- `is:pr is:open author:@me`

Each node asks for `number`, `title`, `url`, `isDraft`, `createdAt`, `updatedAt`, `author.login`, `repository.nameWithOwner`, `headRefName`, `reviewDecision`, and `commits(last: 1) { statusCheckRollup { state } }`. First page only, `first: 50`.

Alternative: `gh search prs --json`. It has no CI state or review decision, so each PR needs one more call. Rejected.

`review-requested:@me` also matches requests sent to the user's teams. This is the same as OpenForge and the GitHub "Review requests" page. A team filter is out of scope.

### 2. `gh` runs on the primary host

The panel is not tied to a thread, so there is no thread host. The server calls the new host handler `fetchReviewQueue` on bb's primary host: `(await bb.sdk.system.config()).primaryHostId`, as `bb-plugin-tasks-plus/delegate/index.ts` does. It can be `null`; then the panel shows the error "No host available".

### 3. Pure core module for mapping and grouping

New `core/review-queue.ts`:
- zod schema for the GraphQL response
- maps nodes to a `QueuePr` (repo, number, title, author, age source, draft, CI state, review decision, head branch, URL)
- groups by repo and sorts by `updatedAt` desc
- `parseGithubRepo(remoteUrl)`: HTTPS and SSH forms, ignores case and `.git`

This keeps the logic testable without `gh` or bb, as `core/overview.ts` does now.

### 4. Server builds the full view

New RPC `getReviewQueue()` returns `{ myReviews, reviewRequests, myPrs, loadedAt }` or a failure. For each PR it adds:
- `projectIds`: standard projects whose `parseGithubRepo(gitRemoteUrl)` equals the PR repo, most recently updated first.
- `threadId`: the most recently updated unarchived thread linked to the same repo and number, or null. A thread is linked by its resolved PR, or by the review metadata of decision 8.

Thread links use the existing `resolvePr` from `pr-lookup.ts` over `sdk.threads.list({ includeHidden: true })`. Without `includeHidden`, the hidden review threads would be missing. The server caches results per environment for one refresh only.

The server keeps the last good result in memory. On failure it returns the failure together with that result, so the UI can show both.

### 5. Poll from the UI, not a background service

The panel component calls `getReviewQueue` when it mounts, on Refresh, and on a 5-minute interval. It clears the interval when it unmounts. This gives "no calls while closed" without extra server state. The existing `pr-poller` background service is not changed.

### 6. Composer on a panel subpath

Routes:
- `""`: My reviews and the two lists
- `review/<owner>/<repo>/<number>`: the composer for one review request

The composer page loads the PR from the last queue result and renders `experimental_NewThreadComposer` with:
- `defaultProjectId`: first of `projectIds`
- `defaultEnvironment`: `managed-worktree` with `baseBranch: { kind: "default" }`
- `initialPrompt`: from `core/review-prompt.ts`
- a draft key per PR

`onSubmit` calls the RPC `startReview({ pr, request })`. The server passes the request to `bb.sdk.threads.spawn` with `visibility: "hidden"` and the review metadata of decision 8 added, and returns the thread ID. The UI then navigates to the thread.

Alternative: one-click `threads.spawn` from the card. Rejected for v1: the user picks the model and edits the prompt per PR.

### 7. Checkout happens in the agent, not in the environment

The worktree starts on a new branch from the project default. The prompt's first step is `gh pr checkout <n>`. After that the worktree branch is the PR head branch, so bb links the PR and the GitHub Insight tabs work. `gh pr checkout` also handles PRs from forks.

Alternative: a worktree from `origin/<headRefName>`. bb makes a new local branch with another name, so the thread has no PR link. It also fails for forks.

## Risks / Trade-offs

- [bb may not link the PR after the branch changes inside a running worktree] → Spike 1.1 (2026-10-02, PR #1): bb linked the PR within 7 seconds of `gh pr checkout`. bb reads the real git HEAD. `environment.branchName` keeps the old bb branch name, so code must use the linked PR (`environments.pullRequest`), never `branchName`.
- [A hidden thread may not raise "Needs you" or a notice when its agent stops] → Task 8.6 checks this in a running bb. The "My reviews" row shows the thread status either way.
- [A hidden thread can be lost if the plugin is uninstalled] → It still exists in bb; `bb thread list --include-hidden` finds it, and `bb thread update --visibility visible` shows it again. README says so.
- [Only the first 50 results per list] → The list shows "Showing first 50" when GitHub reports more. Pagination can come later.
- [Resolving the PR for every thread on each refresh costs one SDK call per environment] → Per-refresh cache, and refresh runs only while the panel is open.
- [`gh pr checkout` fails because the worktree has local changes] → The worktree is fresh, so it has no local changes.

### 8. Hidden review threads with plugin metadata

`startReview` sets `visibility: "hidden"` and `pluginMetadata: { "review-pr": { v: 1, repo, number, title, url } }` on spawn. The plugin metadata key sits next to the existing summary key in `core/summary.ts`.

- "My reviews" = `sdk.threads.list({ includeHidden: true, originPluginId: <this plugin> })`, unarchived, with a valid `review-pr` entry, newest first. Each row also carries the thread status from the list result.
- The metadata gives "Open thread" a link from the moment of spawn, before `gh pr checkout` runs. This removes the old gap where a new thread was not linked yet.
- "Archive" calls a new RPC `archiveReview({ threadId })` that checks the thread has `review-pr` metadata before it calls `sdk.threads.archive`. The panel cannot archive other threads through it.
- The `pr-poller` `listThreads` in `server.ts` also passes `includeHidden: true`, so PR and Review tabs on hidden threads refresh.

Alternative: a bb section "PR reviews". Rejected by the user: they want review threads out of the sidebar.

### 9. Card layout

- The repo name shows only on the group header. The "No bb project" hint moves to the group header too.
- The card age uses `updatedAt`, the same field as the sort.
- One meta row: author, CI, review decision, then the actions on the right.
- The panel header keeps Refresh but drops the duplicate "Pull Requests" title.
- The nav panel icon must be a name that bb's icon set has. `GitPullRequest` falls back to a default icon.
