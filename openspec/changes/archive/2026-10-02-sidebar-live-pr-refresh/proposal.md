# Proposal

## Why

When an agent opens or pushes to a PR, the sidebar row can take up to about 2 minutes to show the new PR status. Until then, the row has no badge and the thread can be in the wrong tab. Two 60s timers cause the lag: the github-insight poller and the sidebar's own poll. The timers do not line up, and no signal goes from the poller to the sidebar.

## What Changes

- github-insight refreshes the PR of a thread when that thread goes idle. It does not wait for the next 60s poll. If BB has no linked PR yet, it tries one more time after a short delay.
- pr-thread-list adds a server service that reads the `prSummary` metadata of active threads every few seconds. When a summary changes, the service sends a realtime signal to the pr-thread-list frontend.
- The sidebar loads the summaries again when it gets that signal. The 60s sidebar poll and the reconnect reload stay as fallbacks.
- No change to the summary contract, the badge, or the tab rules.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sidebar-thread-list`: the row PR status follows work that the agent does in BB within seconds, not only on the next periodic refresh.

## Impact

- `bb-plugin-github-insight`: `server.ts` (`thread.idle` listener), `refresh/insight-service.ts` (refresh one thread on idle, with one retry when no PR is linked yet).
- `bb-plugin-pr-thread-list`: `server.ts` (new background service and realtime publish), `summaries.ts` (change detection), `use-summaries.ts` (reload on the realtime signal).
- More local metadata reads in pr-thread-list. No more GitHub calls than one refresh for each turn that ends.
- Changes on the GitHub side (CI done, reviewer approves) still come from the 60s github-insight poll.
