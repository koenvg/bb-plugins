# Proposal

## Why

When the user resolves a review thread in BB, the sidebar PR badge can show "unresolved threads" for up to 2 minutes. Two 60-second timers run one after the other: the github-insight poller, then the sidebar poll. A resolve does not reset either timer.

## What Changes

- After a successful resolve or unresolve, github-insight refreshes the PR insight and writes the new `prSummary` before the RPC returns. This applies to "Resolve", "Unresolve", and "Post + resolve".
- When the RPC returns, the Review tab sends a browser signal with the thread id.
- The sidebar loads the summaries again at once.
- The 60-second polls stay as the fallback.
- Out of scope: resolves done on github.com. They still update on the next poll.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sidebar-thread-list`: the PR status on a row updates within seconds after the user resolves or unresolves a review thread in BB.

## Impact

- `bb-plugin-github-insight/review/review-writes.ts`: refresh the insight after a resolve write.
- `bb-plugin-github-insight/server.ts`: give the review writes access to the insight service refresh.
- `bb-plugin-github-insight/ui/thread-actions.tsx`: send the signal after a successful resolve write.
- `bb-plugin-pr-thread-list/use-summaries.ts`: `useSummaries` listens for the signal and reloads.
- The resolve button stays busy 1 to 3 seconds longer, for one GitHub refresh.
- No new GitHub calls in the sidebar. One extra insight fetch for each resolve.
