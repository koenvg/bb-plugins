# Design

## Context

- github-insight writes `prSummary` metadata from its `pr-poller` service. The service sleeps 60s between polls (`insight-service.ts` `run`).
- pr-thread-list's `useSummaries` calls its `listSummaries` RPC every 60s. It also reloads on the `github-insight.summary-written` BroadcastChannel, but only the Review tab posts on it (see the `sidebar-resolve-refresh` change).
- `bb.realtime.publish` reaches only the frontend of the plugin that publishes. github-insight's `insight.updated` signal cannot reach the sidebar.
- The SDK gives no push event for thread plugin metadata.
- The plugin server gets `thread.idle` through `bb.events.on`. The payload has the thread DTO.

See proposal.md for the problem.

## Goals / Non-Goals

**Goals:**
- Each plugin keeps its own job. github-insight owns the GitHub data. pr-thread-list owns the signal to its own frontend.
- No new contract between the two plugins. The `prSummary` metadata stays the only shared data.

**Non-Goals:**
- Faster GitHub polls.
- A push of the summary content in the realtime payload.
- A refresh on `thread.active` or `thread.created`. At those times the agent has not changed the PR yet.

## Decisions

### 1. github-insight refreshes on `thread.idle`

`server.ts` registers `bb.events.on("thread.idle", ...)` and calls a new insight service method, `refreshOnIdle(threadId)`. The handler does not wait for the method and logs a warning when it fails.

`refreshOnIdle`:
- Returns at once when the service is paused for a rate limit.
- Resolves the PR of the thread. With a PR, it calls the existing `refreshThread`. That joins a run in progress for the same PR, so a poll and an idle event cause one fetch.
- Skips a settled PR (merged or closed on GitHub, and not open on BB), the same as `poll`.
- With `no_pr`, it waits 10s and resolves one more time. BB can link a new PR to the environment after the turn ends. After the second try it stops, and the 60s poll takes over.
- With a resolution error, it logs a warning and stops.

The retry timer is cleared when the plugin unloads, so a reload does not leave a timer that calls a disposed service.

Alternatives:
- Shorter poll interval. Rejected: more GitHub calls for every thread, all the time.
- Refresh on every `experimental_thread.events` debounce. Rejected: many fetches while the agent works, and the PR state changes mostly at the end of a turn.

### 2. pr-thread-list server watches the summaries

A new background service, `summary-watch`, in pr-thread-list `server.ts`:
- Every 5s it calls the existing `listSummaries(sdk)`.
- It makes a stable fingerprint of the result: `insightAvailable` plus the summaries sorted by thread id, as JSON.
- When the fingerprint differs from the last one, it calls `bb.realtime.publish("summaries.changed", {})`. The first read after start only stores the fingerprint. The frontend loads on mount anyway.
- A failed read keeps the old fingerprint and tries again on the next tick.
- The loop sleeps in an abortable way and returns when the signal aborts, the same pattern as `pr-poller`.

This catches every write: the poller, `refreshOnIdle`, `refreshAfterWrite`, and the PR tab's manual refresh.

Alternatives:
- Send the summaries in the realtime payload. Rejected: a large broadcast to every client, and a second load path next to the RPC.
- github-insight's frontend relays `insight.updated` on the BroadcastChannel. Rejected: it works only while a github-insight surface is mounted.
- Watch for `experimental_thread.events`. Rejected: the SDK does not say that a metadata update emits it.

### 3. Sidebar reloads on the realtime signal

`useSummaries` adds `useRealtime("summaries.changed", ...)`, which calls the same `load` as the timer and the BroadcastChannel. The newest-load guard stays, so an old load cannot overwrite a new one. The 60s timer, the reconnect reload, and the BroadcastChannel stay as they are. The BroadcastChannel is still the fastest path after a resolve.

The channel name is a constant in `summary-watch.ts`, so the server and the frontend use the same value. It is not in `contract.ts`, because a value import from that file would put zod in the app bundle.

## Risks / Trade-offs

- [The watch reads metadata for every active thread every 5s] → These are local reads with 8 in parallel, and they make no GitHub calls. With 50 threads, that is 10 reads each second. If this is too much, make the interval longer. The spec allows up to 10s.
- [The watch runs when no sidebar is open] → Accepted. A server service cannot see open clients, and a publish with no listener costs almost nothing.
- [BB links the PR more than 10s after the turn ends] → The 60s poll finds it. The row shows the badge later, but it stays correct.
- [Many threads go idle at the same time] → Each idle event resolves one thread. Threads on the same PR join one run. The rate-limit pause still applies.
- [The `thread.idle` handler throws] → The handler catches all errors and logs a warning, so the event does not fail for other plugins.
