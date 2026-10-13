# Design

## Context

See proposal.md for the reasons.

Current state in `bb-plugin-github-insight`:

```
app.tsx
 +-- threadPanelAction "pr"      PrTab      padded  rpc getInsight (snapshot store)
 +-- threadPanelAction "review"  ReviewTab  flush   rpc getReview (files, threads, drafts, viewed marks)

entry points
 sidebar badge (bb-plugin-pr-thread-list) --requestPrPanel--> receivePrPanel --> openThreadPanel("pr")
 composer banner click ---------------------------------------------------------> openThreadPanel("pr")
 palette --openPanel({ actionId })--> postIntent(threadId, tab, intent) --> useCommandIntent in the tab
```

Constraints:

- The SDK `openPanel({ params })` stores `params` with the tab. The SDK types do not say if bb uses `params` to find an existing tab. Different `params` can create a second PR tab.
- The SDK cannot hide a `threadPanelAction` from the new-tab launcher.
- No query reads conversation comments. The review queue query reads only their timestamps.
- `bb-plugin-pr-thread-list` imports `requestPrPanel` from this plugin.

## Goals / Non-Goals

**Goals:**

- One "pr" panel action. The current PR and Review bodies move into it with as few changes as possible.
- Sub-tab selection without tab `params`.
- Read the timeline separately from the insight, so a timeline failure does not hide the PR status.

**Non-Goals:**

- Keep saved "Review" tabs after the upgrade.
- Add the timeline to the snapshot store.
- Rename "Review tab" in all existing specs. `pr-tab-sub-tabs` maps the name.

## Decisions

### 1. One flush panel action with a sub-tab shell

`app.tsx` registers only `"pr"`, with layout `"flush"`. A new `PrPanel` component shows the sub-tab bar and two bodies:

```
PrPanel (key = threadId)
+-- SubTabBar  [Overview] [Files]
+-- OverviewTab  own scroll area + padding
|     current PrTabContent + Timeline + CommentComposer
+-- FilesTab     current ReviewTabContent (mounted on first show, then hidden)
```

- `layout: "flush"`, because "Files" needs its own scroll area for comment navigation. "Overview" adds its own padding and scroll.
- **Alternative:** keep "padded" and put "Files" in a fixed-height box. Rejected: the comment stepper measures a scroll area that the host owns in padded mode.

### 2. Sub-tab memory per thread in module state

`ui/pr-sub-tab.ts` keeps the selected sub-tab of each thread in a module-level `Map`. The value then survives an unmount when the user selects another side-panel tab or another thread. A missing entry means "Overview". bb gives no close signal, so a closed and opened PR tab also gets the remembered sub-tab.

The first render reads a pending `pr` intent (`peekIntent`) before the memory. So a badge or banner open renders "Overview" at once and does not mount "Files" for one frame.

- **Alternative:** `params`. Rejected: it can create duplicate tabs (see Context), and it would save a sub-tab that the user did not choose.
- **Alternative:** React state only. Rejected: the value is lost when bb unmounts the panel.

### 3. "Files" stays mounted after the first show

After the first show in a mounted panel, `FilesTab` stays in the tree with `hidden` while "Overview" shows. This keeps scroll position, open forms, and comment position. `getReview` runs only after the first show. The "shown" flag is React state, not memory: a remount on "Overview" does not load "Files".

- Comment navigation measures the layout. It runs only when "Files" is visible, because each request that steps a comment first selects "Files".

### 4. Intents: a "pr" sub-tab key, plus "overview" and "files" keys

`IntentsByTab` in `ui/command-intents.ts` changes:

| Key                      | Intents                                      | Consumer      |
| ------------------------ | -------------------------------------------- | ------------- |
| `pr`                     | `show-overview`, `show-files`                | `PrPanel`     |
| `overview` (was in `pr`) | `refresh`, `open-on-github`                  | `OverviewTab` |
| `files` (was `review`)   | `submit`, `next-comment`, `previous-comment` | `FilesTab`    |
| `merge`                  | `merge`                                      | no change     |

Only the last mounted listener of a key gets an intent. If `PrPanel` and `OverviewTab` both listened on `pr`, one of them would miss its intents. So each consumer has its own key.

A Files command calls `openPanel({ actionId: "pr" })`, then posts `pr: show-files` and the `files` intent. The `files` intent waits in the pending map (TTL 10 s) until `FilesTab` mounts. "Refresh PR" posts `pr: show-overview` and `overview: refresh`. "Open PR on GitHub" posts only `overview: open-on-github` and keeps the sub-tab. The status entry points (`receivePrPanel` callback and banner click) open `"pr"` and post `pr: show-overview`.

- **Alternative:** one combined intent such as `pr: files-submit`. Rejected: `PrPanel` would then forward each Files action, and Files must still wait to mount.

### 5. Review-to-Files jump through panel context

The "N inline comments" link calls `showFiles({ jumpTo: reviewCommentIds })` from a React context in `PrPanel`. `FilesTab` gets a jump request prop, the same pattern as `commentStep` in `review-tab.tsx`. It finds the first visible thread that has one of those comment ids. If all are resolved and hidden, it turns on "Show resolved" first.

- **Alternative:** a global intent with a payload. Rejected: both bodies are in one component tree, so a context is simpler and typed.

### 6. Timeline query and RPCs

New `github/timeline-query.ts`:

```graphql
pullRequest(number: $number) {
  id locked viewerCanUpdate
  timelineItems(last: 100, before: $before, itemTypes: [
    ISSUE_COMMENT, PULL_REQUEST_REVIEW, PULL_REQUEST_COMMIT,
    READY_FOR_REVIEW_EVENT, CLOSED_EVENT, REOPENED_EVENT, MERGED_EVENT
  ]) {
    pageInfo { hasPreviousPage startCursor }
    nodes { __typename ...per type fields }
  }
}
```

- A review node reads `state body submittedAt url author` and `comments(first: 100) { totalCount nodes { id } }`. The comment ids drive the jump.
- New `core/timeline.ts` parses the nodes with zod into a `TimelineEvent` union and groups consecutive commits. Pure function, unit tested.
- New RPCs `getTimeline({ threadId, before })` and `addPrComment({ threadId, prNodeId, body })`. The client sends the PR node id from the timeline it shows, the same as `reply` sends a review thread id. The server resolves the thread's PR for the host. `addPrComment` uses the `addComment(input: { subjectId, body })` mutation.
- The client reads the timeline when "Overview" mounts and again when the insight `refreshedAt` changes. After a post, the client reloads the newest page. The client keeps one event list and merges each page into it by id, so older pages stay and a failed read keeps the last good events and the comment box.
- Locked conversation: hide the comment box when `locked` is true and `viewerCanUpdate` is false. GitHub lets users with write access comment on a locked PR.
- **Alternative:** add the timeline to `getInsight`. Rejected: the insight has a snapshot store, merge actions use it, and a timeline failure must not fail the status.

### 7. Commands

`ui/commands.ts`: remove `open-review-tab`, add `open-pr-files` ("GitHub: Open PR files"). `open-pr-tab` posts `pr: show-overview`. `submit-review`, `next-comment`, and `previous-comment` use the flow in decision 4.

## Risks / Trade-offs

- [Saved "Review" tabs after the upgrade. bb behavior for an unknown action id was not checked, by user choice.] → Note it in the release notes. If bb shows an error tab, the user closes it once.
- [Module-level sub-tab map grows with each thread opened in the window.] → One small entry for each thread. Cleared on reload. Accepted.
- [One more GitHub GraphQL call for each insight refresh.] → Only while "Overview" is mounted. 100 items at most for each page.
- [Merged event list keeps a deleted comment until the panel remounts.] → Accepted. A replace on each read would drop events that a new push moves out of the newest page.
- [Narrow side panel.] → The timeline uses one column, truncates logins, and wraps Markdown. Code blocks scroll on the x axis.
- [`review-tab.test.tsx` (87 KB) renders `ReviewTab`.] → Keep an exported `FilesTab` with the same props, so most tests only change the import.

## Migration Plan

- No data migration. Viewed marks, drafts, and snapshots keep their keys.
- Rollback: revert the change. A saved "PR" tab works in both versions because the action id stays `"pr"`.
