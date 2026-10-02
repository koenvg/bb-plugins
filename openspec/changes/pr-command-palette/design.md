# Design

## Context

- The SDK registers palette commands with `app.commands.register({ id, title, isAvailable, run })`. `bb-plugin-tasks-plus/shell/commands.ts` uses it.
- `isAvailable(ctx)` must be sync and cheap. `run(ctx)` gets `threadId` and `openPanel({ actionId, params })`. `run` has no UI, and its errors are only logged.
- `openPanel` persists `params` with the tab. The same params focus the open tab. Different params open a second tab.
- The PR tab loads its data with `useInsight` (async RPC). The merge dialog, the refresh button, and the submit panel are local state of `PrTab`, `MergeActionButton`, and `ReviewTab`.
- `BbNavigate.openUrl(url)` opens a URL with bb's browser preference. It comes from the `useBbNavigate()` hook, so only a mounted component can call it.

## Goals / Non-Goals

**Goals:**
- Each command reuses the tab's own UI for confirm, progress, and errors.
- No new RPC method and no server change.

**Non-Goals:**
- Dynamic command titles such as "Squash and merge". Titles are static at registration.
- Commands in the composer banner or on a screen without a thread side panel.
- Default keyboard shortcuts. Users can bind the commands in bb.

## Decisions

### 1. Every command is "open a tab, then send an intent"

```
 palette run(ctx)
     |
     +--> ctx.openPanel({ actionId })      (no params)
     |
     +--> if accepted: postIntent(threadId, "pr" | "review", intent)
                |
                v
         PrTab / ReviewTab mounts or is already mounted
                |
                v
         useCommandIntent(threadId, tab) takes the intent once
                |
                v
         tab waits for its data, then acts with its own UI
```

| Command | Tab | Intent |
|---|---|---|
| GitHub: Open PR tab | pr | none |
| GitHub: Open Review tab | review | none |
| GitHub: Merge PR | pr | `merge` |
| GitHub: Refresh PR | pr | `refresh` |
| GitHub: Open PR on GitHub | pr | `open-on-github` |
| GitHub: Submit review | review | `submit` |

"Open PR on GitHub" also goes through the PR tab. The tab has the PR URL and a `useBbNavigate()` for `openUrl`, and it already shows "No pull request for this thread" for the no-PR case.

Alternatives:
- `openPanel` `params` as the intent. Rejected: params persist, so a restored tab would merge again. Different params also open a second tab.
- `run` calls the RPC directly. Rejected: no confirm dialog and no place to show errors.

### 2. An in-memory intent bus, keyed by thread and tab

A small module `ui/command-intents.ts` keeps one pending intent per `(threadId, tab)`. A post replaces the pending intent. A tab subscribes with a hook. When a subscriber exists, the post goes to it at once. Otherwise the intent waits until the tab mounts. A take removes the intent.

- In memory only, so a bb restart drops it. A restored tab does not act again.
- Keyed by thread, so an intent for thread A never reaches the PR tab of thread B.
- Pattern from `bb-plugin-tasks-plus/shell/command-bridge.ts`, but keyed and with no navigator registry, because `ctx.openPanel` replaces navigation.

`run` posts the intent only when `ctx.openPanel` returns true. When the surface has no side panel, no intent waits, so a later open of the tab does not run an old action.

### 3. The tab acts only after its data has loaded

The PR tab keeps the taken intent in state. It acts when `useInsight` has a result and no refresh is running. Then the action uses the merge action and head commit of that load, not an older one.

- `merge`: when `mergeAction.kind` is `merge`, open the confirm dialog. When it is `enqueue`, run the enqueue. Otherwise do nothing; the tab shows blockers, "Queued", or the PR state.
- `refresh`: call the `refresh` that the refresh button calls.
- `open-on-github`: call `openUrl(pr.url)` when there is a PR.

The Review tab sets its submit panel to open on `submit`. When the panel is already open it stays open and keeps the body.

### 4. The PR tab drives the merge button, not the button itself

`MergeActionButton` gets an optional `request: { onHandled }` prop. When a request is present, the button runs the enqueue or opens the dialog, then calls `onHandled`. The dialog becomes a controlled `AlertDialog`. Only `PrTab` passes the prop, so the composer banner never reacts to a palette command. The PR tab sets a request only when a merge action button shows, so a request never waits for a later merge action. The existing `running` ref in `useMergeAction` keeps one request for a double run.

`PrTab` and `ReviewTab` render their content with `key={threadId}`. A thread switch resets all command state, so an intent of thread A never runs on thread B, or later on A.

### 5. Commands live in one module

`ui/commands.ts` exports the six registrations. `app.tsx` registers them in a loop, the same as tasks-plus.

### 6. Availability comes from an in-memory cache that `useInsight` fills

`isAvailable` is sync, and the SDK gives PR data only through React hooks. So `useInsight` writes each load it accepts (not a stale response it drops) into `ui/pr-availability.ts`: a map from thread id to "can merge". An `ok` result sets the entry, `no_pr` deletes it, and an error keeps it. The composer banner runs `useInsight` for every thread in view, so the entry exists within one load of opening a thread. The PR tab feeds it too.

- "Merge PR" is listed when the entry says it can merge. The other five are listed when an entry exists.
- Unknown means hidden. A wrong "listed" costs a useless tab open; a short "hidden" costs nothing.
- Alternative: show every command whenever a thread is in view (the first version). Rejected after use: the commands showed on threads without a PR.

## Risks / Trade-offs

- [The tab acts on data that is up to 60 s old] → The head commit guard on the server still rejects a stale merge, and the tab shows the error. This is the same as a click today.
- [A posted intent is never taken, for example when the user closes the tab before it loads] → It stays in memory until the next post for that thread and tab, or until the tab mounts again. Then it acts. Mitigation: an intent older than 10 s is dropped on take.
- [The cache is up to 60 s old, so "Merge PR" can show for a PR that got a blocker since] → The tab opens and shows the blocker, and nothing is written.
- [A thread viewed without the composer banner never fills the cache] → The commands stay hidden there until the PR tab loads. Accepted.
- [`ctx.openPanel` returns false on some surfaces] → `run` posts no intent, so nothing runs later. The command does nothing on that surface.
