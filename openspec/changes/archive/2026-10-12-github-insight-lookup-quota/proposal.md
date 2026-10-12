# Proposal

## Why

Users see `gh pr view failed: GraphQL: API rate limit already exceeded`. github-insight asks bb for the PR of an environment (`sdk.environments.pullRequest`, which runs `gh pr view` on the host) on every poll, every `getInsight`, every manual refresh, and every review-queue relink. It does this also for merged PRs and while GitHub reports a rate limit. With about 20 environments this uses most of the 5,000 GraphQL points per hour that the user shares with agents and other tools. t3code fixed the same problem with a lookup cache, no polls for settled PRs, and a shared rate-limit pause.

## What Changes

- Keep the PR lookup result of each environment in memory. Open PR: 60 seconds. No PR: 5 minutes. Closed PR: 15 minutes. Merged PR: 60 minutes. Concurrent lookups for one environment share one host call.
- Calls that need current data get a fresh lookup: manual refresh, the thread-idle refresh, and the 10-second retry after a thread becomes idle.
- The poller no longer asks bb for the PR of an environment while its cached lookup is valid. Merged PRs are therefore looked up at most once per hour, not once per minute.
- When the host lookup fails with a rate limit, github-insight pauses all its background GitHub work, the same as when its own `gh` calls are rate limited. The pause ends at the GraphQL reset time, or after 5 minutes when the reset time is not known.
- While paused, a lookup returns the last known result of the environment, also when it is expired. The PR tab then shows the last snapshot with the "rate limited" error, not a full-page error.

## Capabilities

### New Capabilities

- `pr-lookup-quota`: how github-insight limits and pauses its PR lookups through bb, so it stays inside the GitHub rate limit.

### Modified Capabilities

None. The PR tab error behavior in `pr-insight-snapshot` stays the same. This change only makes the snapshot path reachable when the lookup is rate limited.

## Impact

- `bb-plugin-github-insight/pr-lookup.ts`: cache, in-flight dedupe, fresh option, rate-limit detection.
- `bb-plugin-github-insight/refresh/insight-service.ts`: shared pause, fresh lookups on manual and idle refresh.
- `bb-plugin-github-insight/host.ts`, `contract.ts`: a host call that reads the GraphQL reset time.
- `bb-plugin-github-insight/server.ts`: wiring of the shared pause.
- Not in scope: tasks-plus lookups, the review-queue search poll, a cheap fingerprint check before the overview query, stale data on the Review tab.
