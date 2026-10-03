# Design

## Context

- github-insight writes `prSummary` thread metadata only from its background poller (`insight-service.ts`, every 60s) or from the PR tab's refresh RPC.
- `review-writes.ts` `setResolved` and `reply` write to GitHub and return. They do not touch the insight service.
- pr-thread-list's `useSummaries` calls its own `listSummaries` RPC every 60s. That RPC reads `prSummary` for every active thread.
- The SDK gives no push event for thread plugin metadata. `useRpc` and `useRealtime` work only inside the calling plugin.
- Both plugin frontends run in the same BB app.

## Goals / Non-Goals

**Goals:**
- The `prSummary` metadata is correct before the sidebar reads it again, so the badge does not flicker.
- The sidebar gets no GitHub access and no copy of the blocker rules.

**Non-Goals:**
- Optimistic badge patches.
- Faster periodic polls.
- Resolves from outside BB, including agents. The agent CLI does not resolve.

## Decisions

### 1. Refresh on the server before the RPC returns

`setResolved` and `reply` (when it resolves) call the insight service's new `refreshAfterWrite(threadId)` after a successful GitHub write. They wait for it before they return.

- `refresh` joins a run that is in progress. That run can have read GitHub before the write, so its summary is old. `refreshAfterWrite` first waits for that run, then starts or joins a run that began after the write.
- The run writes summaries for every thread on the PR. So threads that share the PR also get the new summary.
- A refresh failure does not change the write result. The resolve worked, and the poller retries.
- Alternative: return first and refresh in the background, then push through realtime. Rejected because realtime cannot reach the sidebar plugin, so the sidebar would have no signal for when the write is done.

`createReviewWrites` gets a new dependency, `refreshAfterWrite(threadId): Promise<void>`. It logs a warning when the refresh throws.

### 2. Signal through a BroadcastChannel

After the RPC returns OK, `thread-actions.tsx` posts `{ threadId }` on a `BroadcastChannel` named `github-insight.summary-written`. This applies to `setResolved` and to `post` with `resolve: true` when `resolveError` is null.

- A BroadcastChannel reaches every same-origin context, including other BB windows. A `window` event reaches only one document.
- Each plugin keeps its own copy of the channel name, the same as `INSIGHT_PLUGIN_ID` today. The coupling is accepted.
- Alternative: optimistic patch of the `unresolved_threads` code in the sidebar. Rejected because it needs a counter on the client and a guard against flicker.

### 3. Sidebar reloads on the signal

`useSummaries` listens to the channel while the list is mounted. On any message, it calls `listSummaries` at once. The 60s interval stays as it is.

- Only the newest load writes its result. A poll that started before the server write cannot overwrite the new summaries.
- The server already wrote the summary for every thread on the PR. So other rows on the same PR update without the sidebar knowing which PR changed.
- Alternative: reload only the message's thread. Rejected because `listSummaries` loads all threads in one call, and the Review tab cannot easily say which other threads share the PR.
- The payload stays `{ threadId }` for logs and a later filter. The sidebar does not use it.

## Risks / Trade-offs

- [The resolve button stays busy 1 to 3s longer] → Accepted. The UI already shows a busy state.
- [Plugin frontends run in different origins in a future BB version, so BroadcastChannel cannot reach the sidebar] → The 60s poll still updates the row. Do a check in the running app first (task 1).
- [The refresh is rate limited] → The refresh still calls GitHub once and fails. It writes the old data with a summary error, and the row stays usable. The poller catches up after the pause.
- [The user resolves many threads quickly] → Resolves that wait for the same run all join the next run. So there are at most two fetches for each PR: the old one and one after the writes.
